"""AI endpoints (decisions Q7, Q8, Q16): sentence search, match explanations, and for drivers:
a ride offer from one sentence and a "write it for me" note.

Both degrade gracefully: search falls back to the rule parser (source="rules"),
explanations come back empty when AI is unavailable - the UI then shows just
the match % and label.
"""

import json
import re
import threading
from datetime import date as date_cls
from collections import OrderedDict
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints
from sqlmodel import Session, col, select

from .. import ai
from ..clock import today_pl
from ..config import settings
from ..database import get_session
from ..deps import get_current_user
from ..matching import match
from ..models import Event, Ride, RideRequest, User
from ..cities import fold, normalize_city
from ..search import SearchFilters, describe, parse_rules

router = APIRouter(prefix="/ai", tags=["ai"])


class _LRU(OrderedDict):
    """Tiny in-memory cache to save free-tier quota on repeats. Locked, since
    sync endpoints run concurrently in FastAPI's threadpool."""

    def __init__(self, size: int):
        super().__init__()
        self.size = size
        self._lock = threading.Lock()

    def get_or_none(self, key):
        with self._lock:
            if key not in self:
                return None
            self.move_to_end(key)
            return self[key]

    def put(self, key, value):
        with self._lock:
            self[key] = value
            self.move_to_end(key)
            while len(self) > self.size:
                self.popitem(last=False)

    def clear(self):
        with self._lock:
            super().clear()


_search_cache = _LRU(128)
_explain_cache = _LRU(512)


# --- search --------------------------------------------------------------------------


class SearchRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class SearchResponse(BaseModel):
    filters: SearchFilters  # pass these as query params to GET /rides
    chips: list[str]  # "what I understood" preview
    source: Literal["ai", "rules"]  # rules = AI unavailable, simplified parsing
    understood: bool  # False -> nothing recognised; show the filter form


def _known_event_names(session: Session, today) -> list[str]:
    names = session.exec(select(Event.name).where(Event.event_date >= today).distinct()).all()
    return [n for n in names if n]


def _known_cities(session: Session) -> list[str]:
    events = session.exec(select(Event.city).distinct()).all()
    origins = session.exec(select(Ride.origin_city).distinct()).all()
    return sorted(set(events) | set(origins))


@router.post("/search", response_model=SearchResponse)
def search(data: SearchRequest, session: Session = Depends(get_session)) -> SearchResponse:
    """Interpret a free-text search like "z Łodzi na techno do Krakowa w grudniu, max 50 zł"."""
    today = today_pl()
    key = (data.text.casefold(), today)
    cached = _search_cache.get_or_none(key)
    if cached is not None:
        return cached

    try:
        filters = ai.parse_search(data.text, today)
        source = "ai"
    except ai.AIUnavailable:
        filters = parse_rules(data.text, today, _known_cities(session), _known_event_names(session, today))
        source = "rules"

    chips = describe(filters)
    result = SearchResponse(filters=filters, chips=chips, source=source, understood=bool(chips))
    if source == "ai":  # don't cache fallbacks: retry AI next time
        _search_cache.put(key, result)
    return result


# --- explanations ----------------------------------------------------------------------

_MAX_ITEMS = 5


class ExplainRequest(BaseModel):
    ride_ids: list[int] = Field(default_factory=list, max_length=_MAX_ITEMS)  # as passenger
    request_ids: list[int] = Field(default_factory=list, max_length=_MAX_ITEMS)  # as driver
    lang: Literal["en", "pl"] = "en"  # language of the sentences (UI language)


class ExplainResponse(BaseModel):
    rides: dict[int, str]
    requests: dict[int, str]
    ai_available: bool


def _music_relation(score: float) -> str:
    if score >= 0.75:
        return "very similar taste"
    if score >= 0.4:
        return "related taste"
    return "somewhat related taste" if score > 0 else "different taste"


def _facts(you: User, them: User, other: str, extra: Optional[dict] = None) -> dict:
    """Relations are computed here, in words, because the model misreads raw
    scores (it called "party" vs "chatty" a shared style)."""
    m = match(you, them)
    style = {1.0: "same style", 0.5: "close but not the same"}.get(m.style, "opposite styles")
    return {
        "other": other,
        "music": _music_relation(m.music),
        "shared_genres": m.shared_genres,
        # Genre lists stay so the model can name related ones ("techno vs house");
        # style and smoking are only given as the relations below/above.
        "your_genres": you.music_genres,
        "their_genres": them.music_genres,
        "driving_style": f"you: {you.driving_style.value}, them: {them.driving_style.value} ({style})",
        "smoking": (
            "neither smokes" if not (you.smoker or them.smoker)
            else "both smoke" if you.smoker and them.smoker
            else "you smoke, they don't" if you.smoker
            else "they smoke, you don't"
        ),
        **(extra or {}),
    }


def _cache_key(you: User, them: User, facts: dict, lang: str) -> tuple:
    # Profiles are part of the key, so editing a profile refreshes the text.
    return (you.id, them.id, lang, json.dumps(facts, sort_keys=True, ensure_ascii=False))


@router.post("/explain", response_model=ExplainResponse)
def explain(
    data: ExplainRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ExplainResponse:
    """One-sentence "why you'd (not) get along" for a few top rides or requests.
    Call it after rendering the list; the list itself never waits for AI."""
    jobs: list[tuple[str, int, User, dict]] = []  # (kind, id, other user, facts)

    if data.ride_ids:
        rides = session.exec(select(Ride).where(col(Ride.id).in_(set(data.ride_ids)))).all()
        drivers = {u.id: u for u in session.exec(select(User).where(col(User.id).in_({r.driver_id for r in rides})))}
        for ride in rides:
            if ride.driver_id == current_user.id:
                continue  # no "match with yourself"
            driver = drivers[ride.driver_id]
            facts = _facts(current_user, driver, "driver", {"smoking_in_car_allowed": ride.smoking_allowed})
            jobs.append(("rides", ride.id, driver, facts))

    if data.request_ids:
        rows = session.exec(
            select(RideRequest, Ride, User)
            .join(Ride, Ride.id == RideRequest.ride_id)
            .join(User, User.id == RideRequest.passenger_id)
            .where(col(RideRequest.id).in_(set(data.request_ids)))
        ).all()
        for req, ride, passenger in rows:
            if ride.driver_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the driver can see requests")
            jobs.append(("requests", req.id, passenger, _facts(current_user, passenger, "passenger")))

    result: dict[str, dict[int, str]] = {"rides": {}, "requests": {}}
    todo = []
    for kind, obj_id, other, facts in jobs:
        cached = _explain_cache.get_or_none(_cache_key(current_user, other, facts, data.lang))
        if cached is not None:
            result[kind][obj_id] = cached
        else:
            todo.append((kind, obj_id, other, facts))

    available = settings.ai_enabled
    if todo:
        try:
            # Temporary ids 0..n-1, so ride and request ids can't collide.
            texts = ai.explain_matches([{"id": i, **facts} for i, (_, _, _, facts) in enumerate(todo)], data.lang)
        except ai.AIUnavailable:
            texts, available = {}, False
        for i, (kind, obj_id, other, facts) in enumerate(todo):
            if i in texts:
                result[kind][obj_id] = texts[i]
                _explain_cache.put(_cache_key(current_user, other, facts, data.lang), texts[i])

    return ExplainResponse(rides=result["rides"], requests=result["requests"], ai_available=available)


# --- offer a ride from one sentence (AI #3) ------------------------------------------------


class OfferParseRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400)]


class OfferDraft(BaseModel):
    """Values for the "offer a ride" form; every field may be missing. The form stays editable."""

    event: Optional[Event] = None  # resolved to a real upcoming event, or None
    event_hint: Optional[str] = None  # what the sentence called it, when no event matched
    event_options: list[Event] = []  # close matches to pick from, when no single event matched
    origin_city: Optional[str] = None
    departure: Optional[str] = None  # "YYYY-MM-DDTHH:MM", local time (for a datetime-local field)
    seats: Optional[int] = None
    price: Optional[float] = None
    smoking_allowed: Optional[bool] = None
    note: Optional[str] = None
    source: Literal["ai", "rules"]
    understood: bool


def _upcoming_events(session: Session, today) -> list[Event]:
    stmt = select(Event).where(Event.event_date >= today).order_by(Event.event_date, Event.id)
    return list(session.exec(stmt).all())


# Words that say nothing about which event it is ("festival", years, "tour", Polish prepositions).
_EVENT_STOPWORDS = {
    "festival", "festiwal", "festiwalu", "fest", "tour", "live", "koncert", "koncertu", "concert",
    "the", "and", "of", "na", "do", "w", "we", "z", "i", "edition", "edycja",
}


def _event_words(text: str) -> list[str]:
    return [w for w in re.findall(r"\w+", fold(text)) if w not in _EVENT_STOPWORDS and not re.fullmatch(r"(19|20)\d\d", w)]


def _word_match(hint_word: str, name_word: str) -> int:
    """2 = same word; 1 = the name word in a Polish case form: an ending added ("openera" ~ "opener")
    or a final vowel changed ("łydkę" ~ "łydka", "warszawie" ~ "warszawa"); 0 = no match."""
    if hint_word == name_word:
        return 2
    if len(name_word) >= 4 and hint_word.startswith(name_word) and len(hint_word) - len(name_word) <= 2:
        return 1
    stem = name_word[:-1]
    if len(name_word) >= 5 and name_word[-1] in "aeiouy" and hint_word.startswith(stem) and 1 <= len(hint_word) - len(stem) <= 3:
        return 1
    return 0


def _hint_score(words: list[str], ev: Event) -> Optional[tuple[bool, float, float]]:
    """(every hint word found, share found in the name itself, match quality) for one event, or None
    when no word is in its name. Each hint word must be in the name or the city/venue; words in the
    name beat words only in the venue, and exact words beat inflected ones."""
    name_words = _event_words(ev.name)
    place_words = _event_words(f"{ev.city} {ev.venue or ''}")
    in_name = [max((_word_match(w, n) for n in name_words), default=0) for w in words]
    if not any(in_name):
        return None
    found = [q or max((_word_match(w, p) for p in place_words), default=0) for w, q in zip(words, in_name)]
    return all(found), sum(1 for q in in_name if q) / len(words), sum(found) / (2 * len(words))


def _event_candidates(events: list[Event], hint: Optional[str], day) -> tuple[Optional[Event], list[Event]]:
    """The upcoming event the driver means, or close candidates to choose from.
    Word by word, so word order, "festival", years and Polish case endings don't matter; the hint
    is also tried glued together ("pol and rock" -> "polandrock"). The best complete match wins
    when it is the only one that good, or the only one on the given day."""
    words = _event_words(hint or "")
    glued = re.sub(r"\W", "", fold(hint or ""))
    if not words:
        return None, []
    scored = []
    for ev in events:
        tries = [sc for sc in (_hint_score(words, ev), _hint_score([glued], ev) if len(words) > 1 else None) if sc]
        if tries:
            complete, in_name, quality = max(tries)
            scored.append(((complete, day is not None and ev.event_date == day, in_name, quality), ev))
    # best first; sort is stable, so equal ones stay soonest-first
    scored.sort(key=lambda t: t[0], reverse=True)
    if scored and scored[0][0][0]:
        top = scored[0][0]
        if not any(key == top for key, _ in scored[1:]):
            return scored[0][1], []
    return None, [ev for _, ev in scored[:6]]


def _offer_rules(text: str, today, session: Session, events: list[Event]) -> dict:
    """No-AI fallback: reuse the search parser (cities, price, seats, dates, known event names)
    and add the departure hour and "smoking allowed"."""
    f = parse_rules(text, today, _known_cities(session), sorted({e.name for e in events}))
    folded = fold(text)
    out: dict = {
        "origin_city": f.origin_city,
        "price": f.max_price,
        "seats": f.min_seats,
        "event_date": f.date_from if f.date_from and f.date_from == f.date_to else None,
        "event": f.q,
    }
    m = re.search(r"\b(?:o|at|godz\.?|godzinie)\s*(\d{1,2})(?:[:.](\d{2}))?", folded)
    if m and 0 <= int(m.group(1)) <= 23:
        out["departure_time"] = f"{int(m.group(1)):02d}:{m.group(2) or '00'}"
    if f.no_smoking:
        out["smoking_allowed"] = False
    elif re.search(r"mozna palic|palenie dozwolone|smoking (is )?(ok|allowed)|palacy", folded):
        out["smoking_allowed"] = True
    return out


def _pick(raw: dict, key: str, cast, ok=lambda v: True):
    """One validated value from the model (or rule) output; a bad value is dropped, not fatal."""
    value = raw.get(key)
    if value in (None, ""):
        return None
    try:
        value = cast(value)
    except (TypeError, ValueError):
        return None
    return value if value is not None and ok(value) else None


@router.post("/offer", response_model=OfferDraft)
def parse_offer(
    data: OfferParseRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> OfferDraft:
    """Fill the "offer a ride" form from a sentence like "jadę z Łodzi na Föllakzoid 4 grudnia o 10,
    3 miejsca po 35 zł". Falls back to rule-based parsing when AI is unavailable."""
    today = today_pl()
    events = _upcoming_events(session, today)
    try:
        raw, source = ai.parse_offer(data.text, today), "ai"
    except ai.AIUnavailable:
        raw, source = _offer_rules(data.text, today, session, events), "rules"

    day = _pick(raw, "event_date", lambda v: v if isinstance(v, date_cls) else date_cls.fromisoformat(str(v)), lambda d: d >= today)
    hint = _pick(raw, "event", lambda v: " ".join(str(v).split())[:100])
    event, options = _event_candidates(events, hint, day)
    hhmm = _pick(raw, "departure_time", str, lambda v: re.fullmatch(r"([01]?\d|2[0-3]):[0-5]\d", v) is not None)
    when = day or (event.event_date if event else None)
    departure = None
    if when and hhmm:
        hh, mm = hhmm.split(":")
        departure = f"{when.isoformat()}T{int(hh):02d}:{mm}"
    draft = OfferDraft(
        event=event,
        event_hint=hint if not event else None,
        event_options=options,
        origin_city=_pick(raw, "origin_city", lambda v: normalize_city(str(v))[:60]),
        departure=departure,
        seats=_pick(raw, "seats", int, lambda n: 1 <= n <= 8),
        price=_pick(raw, "price", float, lambda p: 0 <= p <= 1000),
        smoking_allowed=_pick(raw, "smoking_allowed", lambda v: v if isinstance(v, bool) else None),
        note=_pick(raw, "note", lambda v: " ".join(str(v).split())[:300]) if source == "ai" else None,
        source=source,
        understood=False,
    )
    filled = draft.model_dump(exclude={"source", "understood", "event_options"})
    draft.understood = any(v is not None for v in filled.values())
    return draft


# --- "write it for me": a ride note for passengers (AI #4) -----------------------------------


class NoteRequest(BaseModel):
    event_id: Optional[int] = None
    origin_city: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]] = None
    departure: Optional[str] = Field(default=None, max_length=20)  # "YYYY-MM-DDTHH:MM"
    smoking_allowed: bool = False
    hint: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]] = None  # the driver's own words
    lang: Literal["en", "pl"] = "pl"


class NoteResponse(BaseModel):
    text: str
    source: Literal["ai", "template"]


_STYLE_WORDS = {
    "pl": {"quiet": "raczej w ciszy", "chatty": "chętnie pogadam", "party": "z muzyką na full"},
    "en": {"quiet": "a quiet ride", "chatty": "happy to chat", "party": "music loud, party mode"},
}


def _note_template(facts: dict, lang: str) -> str:
    """No-AI fallback: a plain note from the same facts."""
    genres = ", ".join(facts["driver_genres"][:2])
    style = _STYLE_WORDS[lang][facts["driver_style"]]
    if lang == "pl":
        head = f"Jadę na {facts['event']}" if facts.get("event") else "Jadę na koncert"
        if facts.get("from"):
            head += f", ruszam z: {facts['from']}"
        if facts.get("leaves_at"):
            head += f" o {facts['leaves_at']}"
        text = f"{head}. W aucie {genres or 'dobra muzyka'}, {style}"
        text += ", bez palenia." if not facts["smoking_allowed"] else ", palenie dozwolone."
    else:
        head = f"Driving to {facts['event']}" if facts.get("event") else "Driving to the show"
        if facts.get("from"):
            head += f", leaving from {facts['from']}"
        if facts.get("leaves_at"):
            head += f" at {facts['leaves_at']}"
        text = f"{head}. {genres or 'Good music'} in the car, {style}"
        text += ", no smoking." if not facts["smoking_allowed"] else ", smoking allowed."
    if facts.get("driver_words"):
        text += " " + facts["driver_words"]
    return text[:300]


@router.post("/ride-note", response_model=NoteResponse)
def ride_note(
    data: NoteRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> NoteResponse:
    """Write the note for a ride being offered, in the driver's voice. Template when AI is down."""
    event = session.get(Event, data.event_id) if data.event_id else None
    leaves = data.departure[11:16] if data.departure and len(data.departure) >= 16 else None
    facts = {
        "event": event.name if event else None,
        "event_city": event.city if event else None,
        "venue": event.venue if event else None,
        "event_date": event.event_date.isoformat() if event and event.event_date else None,
        "from": normalize_city(data.origin_city) if data.origin_city else None,
        "leaves_at": leaves,
        "driver_genres": list(current_user.music_genres),
        "driver_style": current_user.driving_style.value,
        "smoking_allowed": data.smoking_allowed,
        "driver_words": data.hint or None,
    }
    try:
        return NoteResponse(text=ai.write_ride_note(facts, data.lang), source="ai")
    except ai.AIUnavailable:
        return NoteResponse(text=_note_template(facts, data.lang), source="template")

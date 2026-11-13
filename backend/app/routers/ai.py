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


class SearchRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class SearchResponse(BaseModel):
    filters: SearchFilters
    chips: list[str]
    source: Literal["ai", "rules"]
    understood: bool


def _known_event_names(session: Session, today) -> list[str]:
    names = session.exec(select(Event.name).where(Event.event_date >= today).distinct()).all()
    return [name for name in names if name]


def _known_cities(session: Session) -> list[str]:
    events = session.exec(select(Event.city).distinct()).all()
    origins = session.exec(select(Ride.origin_city).distinct()).all()
    return sorted(set(events) | set(origins))


@router.post("/search", response_model=SearchResponse)
def search(data: SearchRequest, session: Session = Depends(get_session)) -> SearchResponse:
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


_MAX_ITEMS = 5


class ExplainRequest(BaseModel):
    ride_ids: list[int] = Field(default_factory=list, max_length=_MAX_ITEMS)
    request_ids: list[int] = Field(default_factory=list, max_length=_MAX_ITEMS)
    lang: Literal["en", "pl"] = "en"


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
    scores = match(you, them)
    style = {1.0: "same style", 0.5: "close but not the same"}.get(scores.style, "opposite styles")
    return {
        "other": other,
        "music": _music_relation(scores.music),
        "shared_genres": scores.shared_genres,
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
    return (you.id, them.id, lang, json.dumps(facts, sort_keys=True, ensure_ascii=False))


@router.post("/explain", response_model=ExplainResponse)
def explain(
    data: ExplainRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ExplainResponse:
    jobs: list[tuple[str, int, User, dict]] = []  # (kind, id, other user, facts)

    if data.ride_ids:
        rides = session.exec(select(Ride).where(col(Ride.id).in_(set(data.ride_ids)))).all()
        drivers = {user.id: user for user in session.exec(select(User).where(col(User.id).in_({ride.driver_id for ride in rides})))}
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
            texts = ai.explain_matches([{"id": i, **facts} for i, (_, _, _, facts) in enumerate(todo)], data.lang)
        except ai.AIUnavailable:
            texts, available = {}, False
        for i, (kind, obj_id, other, facts) in enumerate(todo):
            if i in texts:
                result[kind][obj_id] = texts[i]
                _explain_cache.put(_cache_key(current_user, other, facts, data.lang), texts[i])

    return ExplainResponse(rides=result["rides"], requests=result["requests"], ai_available=available)


class OfferParseRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400)]


class OfferDraft(BaseModel):
    event: Optional[Event] = None
    event_hint: Optional[str] = None
    event_options: list[Event] = []
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


_EVENT_STOPWORDS = {
    "festival", "festiwal", "festiwalu", "fest", "tour", "live", "koncert", "koncertu", "concert",
    "the", "and", "of", "na", "do", "w", "we", "z", "i", "edition", "edycja",
}


def _event_words(text: str) -> list[str]:
    return [word for word in re.findall(r"\w+", fold(text)) if word not in _EVENT_STOPWORDS and not re.fullmatch(r"(19|20)\d\d", word)]


def _word_match(hint_word: str, name_word: str) -> int:
    if hint_word == name_word:
        return 2
    if len(name_word) >= 4 and hint_word.startswith(name_word) and len(hint_word) - len(name_word) <= 2:
        return 1
    stem = name_word[:-1]
    if len(name_word) >= 5 and name_word[-1] in "aeiouy" and hint_word.startswith(stem) and 1 <= len(hint_word) - len(stem) <= 3:
        return 1
    return 0


def _hint_score(words: list[str], event: Event) -> Optional[tuple[bool, float, float]]:
    name_words = _event_words(event.name)
    place_words = _event_words(f"{event.city} {event.venue or ''}")
    in_name = [max((_word_match(word, name_word) for name_word in name_words), default=0) for word in words]
    if not any(in_name):
        return None
    found = [name_score or max((_word_match(word, place_word) for place_word in place_words), default=0) for word, name_score in zip(words, in_name)]
    return all(found), sum(1 for name_score in in_name if name_score) / len(words), sum(found) / (2 * len(words))


def _event_candidates(events: list[Event], hint: Optional[str], day) -> tuple[Optional[Event], list[Event]]:
    words = _event_words(hint or "")
    glued = re.sub(r"\W", "", fold(hint or ""))
    if not words:
        return None, []
    scored = []
    for event in events:
        tries = [score for score in (_hint_score(words, event), _hint_score([glued], event) if len(words) > 1 else None) if score]
        if tries:
            complete, in_name, quality = max(tries)
            scored.append(((complete, day is not None and event.event_date == day, in_name, quality), event))
    scored.sort(key=lambda entry: entry[0], reverse=True)
    if scored and scored[0][0][0]:
        top = scored[0][0]
        if not any(key == top for key, _ in scored[1:]):
            return scored[0][1], []
    return None, [event for _, event in scored[:6]]


def _offer_rules(text: str, today, session: Session, events: list[Event]) -> dict:
    f = parse_rules(text, today, _known_cities(session), sorted({e.name for e in events}))
    folded = fold(text)
    out: dict = {
        "origin_city": f.origin_city,
        "price": f.max_price,
        "seats": f.min_seats,
        "event_date": f.date_from if f.date_from and f.date_from == f.date_to else None,
        "event": f.q,
    }
    time_match = re.search(r"\b(?:o|at|godz\.?|godzinie)\s*(\d{1,2})(?:[:.](\d{2}))?", folded)
    if time_match and 0 <= int(time_match.group(1)) <= 23:
        out["departure_time"] = f"{int(time_match.group(1)):02d}:{time_match.group(2) or '00'}"
    if f.no_smoking:
        out["smoking_allowed"] = False
    elif re.search(r"mozna palic|palenie dozwolone|smoking (is )?(ok|allowed)|palacy", folded):
        out["smoking_allowed"] = True
    return out


def _pick(raw: dict, key: str, cast, ok=lambda value: True):
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
    today = today_pl()
    events = _upcoming_events(session, today)
    try:
        raw, source = ai.parse_offer(data.text, today), "ai"
    except ai.AIUnavailable:
        raw, source = _offer_rules(data.text, today, session, events), "rules"

    day = _pick(raw, "event_date", lambda value: value if isinstance(value, date_cls) else date_cls.fromisoformat(str(value)), lambda parsed_day: parsed_day >= today)
    hint = _pick(raw, "event", lambda value: " ".join(str(value).split())[:100])
    event, options = _event_candidates(events, hint, day)
    hhmm = _pick(raw, "departure_time", str, lambda value: re.fullmatch(r"([01]?\d|2[0-3]):[0-5]\d", value) is not None)
    when = day or (event.event_date if event else None)
    departure = None
    if when and hhmm:
        hours, minutes = hhmm.split(":")
        departure = f"{when.isoformat()}T{int(hours):02d}:{minutes}"
    draft = OfferDraft(
        event=event,
        event_hint=hint if not event else None,
        event_options=options,
        origin_city=_pick(raw, "origin_city", lambda value: normalize_city(str(value))[:60]),
        departure=departure,
        seats=_pick(raw, "seats", int, lambda count: 1 <= count <= 8),
        price=_pick(raw, "price", float, lambda amount: 0 <= amount <= 1000),
        smoking_allowed=_pick(raw, "smoking_allowed", lambda value: value if isinstance(value, bool) else None),
        note=_pick(raw, "note", lambda value: " ".join(str(value).split())[:300]) if source == "ai" else None,
        source=source,
        understood=False,
    )
    filled = draft.model_dump(exclude={"source", "understood", "event_options"})
    draft.understood = any(v is not None for v in filled.values())
    return draft


class NoteRequest(BaseModel):
    event_id: Optional[int] = None
    origin_city: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]] = None
    departure: Optional[str] = Field(default=None, max_length=20)  # "YYYY-MM-DDTHH:MM"
    smoking_allowed: bool = False
    hint: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]] = None
    lang: Literal["en", "pl"] = "pl"


class NoteResponse(BaseModel):
    text: str
    source: Literal["ai", "template"]


_STYLE_WORDS = {
    "pl": {"quiet": "raczej w ciszy", "chatty": "chętnie pogadam", "party": "z muzyką na full"},
    "en": {"quiet": "a quiet ride", "chatty": "happy to chat", "party": "music loud, party mode"},
}


def _note_template(facts: dict, lang: str) -> str:
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

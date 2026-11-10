"""AI endpoints (decisions Q7, Q8, Q16): sentence search and match explanations.

Both degrade gracefully: search falls back to the rule parser (source="rules"),
explanations come back empty when AI is unavailable - the UI then shows just
the match % and label.
"""

import json
import threading
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
from ..matching import family_of, match
from ..models import Event, Ride, RideRequest, User
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
        filters = parse_rules(data.text, today, _known_cities(session))
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


class ExplainResponse(BaseModel):
    rides: dict[int, str]
    requests: dict[int, str]
    ai_available: bool


def _profile(user: User) -> dict:
    return {
        "genres": [{"name": g, "family": family_of(g)} for g in user.music_genres],
        "driving_style": user.driving_style.value,
        "smoker": user.smoker,
    }


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
        "driving_style": f"you: {you.driving_style.value}, them: {them.driving_style.value} ({style})",
        "smoking": (
            "neither smokes" if not (you.smoker or them.smoker)
            else "both smoke" if you.smoker and them.smoker
            else "you smoke, they don't" if you.smoker
            else "they smoke, you don't"
        ),
        "you": _profile(you),
        "them": _profile(them),
        **(extra or {}),
    }


def _cache_key(you: User, them: User, facts: dict) -> tuple:
    # Profiles are part of the key, so editing a profile refreshes the text.
    return (you.id, them.id, json.dumps(facts, sort_keys=True, ensure_ascii=False))


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
        cached = _explain_cache.get_or_none(_cache_key(current_user, other, facts))
        if cached is not None:
            result[kind][obj_id] = cached
        else:
            todo.append((kind, obj_id, other, facts))

    available = settings.ai_enabled
    if todo:
        try:
            # Temporary ids 0..n-1, so ride and request ids can't collide.
            texts = ai.explain_matches([{"id": i, **facts} for i, (_, _, _, facts) in enumerate(todo)])
        except ai.AIUnavailable:
            texts, available = {}, False
        for i, (kind, obj_id, other, facts) in enumerate(todo):
            if i in texts:
                result[kind][obj_id] = texts[i]
                _explain_cache.put(_cache_key(current_user, other, facts), texts[i])

    return ExplainResponse(rides=result["rides"], requests=result["requests"], ai_available=available)

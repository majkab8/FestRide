"""Event browsing endpoints (public: no login needed to look around)."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, true
from sqlmodel import Session, col, select

from ..cities import fold, normalize_city
from ..clock import today_pl
from ..database import get_session
from ..models import Event

router = APIRouter(prefix="/events", tags=["events"])


class CityCount(BaseModel):
    city: str
    events: int


def _contains(text: str) -> str:
    """LIKE pattern for a case/diacritic-insensitive substring match against
    fold(column). User-typed % and _ are escaped so they match literally."""
    escaped = fold(text).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _upcoming(include_past: bool):
    """Filter clause: events today or later (undated events are kept)."""
    if include_past:
        return true()
    return or_(col(Event.event_date).is_(None), col(Event.event_date) >= today_pl())


@router.get("", response_model=list[Event])
def list_events(
    q: Optional[str] = Query(None, max_length=100, description="Text in event name or venue"),
    city: Optional[str] = Query(None, max_length=60),
    genre: Optional[str] = Query(None, max_length=40),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    include_past: bool = False,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
) -> list[Event]:
    stmt = select(Event).where(_upcoming(include_past))
    if q and q.strip():
        pattern = _contains(q)
        stmt = stmt.where(
            or_(
                func.fold(Event.name).like(pattern, escape="\\"),
                func.fold(Event.venue).like(pattern, escape="\\"),
            )
        )
    if city and city.strip():
        # Exact (case/diacritic-insensitive) match, so "Gdańsk" from the cities
        # dropdown doesn't also return "Gdańsk/Sopot". normalize_city maps
        # English names ("Warsaw") to the stored Polish ones.
        stmt = stmt.where(func.fold(Event.city) == fold(normalize_city(city)))
    if genre and genre.strip():
        stmt = stmt.where(func.fold(Event.genre).like(_contains(genre), escape="\\"))
    if date_from:
        stmt = stmt.where(col(Event.event_date) >= date_from)
    if date_to:
        stmt = stmt.where(col(Event.event_date) <= date_to)

    stmt = stmt.order_by(col(Event.event_date).is_(None), Event.event_date, Event.id)
    return list(session.exec(stmt.offset(offset).limit(limit)).all())


# Declared before /{event_id} so "cities" isn't parsed as an id.
@router.get("/cities", response_model=list[CityCount])
def list_cities(session: Session = Depends(get_session)) -> list[CityCount]:
    """Cities with upcoming events, most events first (for filter dropdowns)."""
    count = func.count(Event.id)
    stmt = (
        select(Event.city, count)
        .where(_upcoming(False))
        .group_by(Event.city)
        .order_by(count.desc(), Event.city)
    )
    return [CityCount(city=c, events=n) for c, n in session.exec(stmt).all()]


@router.get("/{event_id}", response_model=Event)
def get_event(event_id: int, session: Session = Depends(get_session)) -> Event:
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event

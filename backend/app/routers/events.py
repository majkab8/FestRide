from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, true
from sqlmodel import Session, col, select
from ..cities import contains_pattern as _contains
from ..cities import fold, genre_clause, normalize_city
from ..clock import today_pl
from ..database import get_session
from ..models import Event

router = APIRouter(prefix="/events", tags=["events"])


class CityCount(BaseModel):
    city: str
    events: int


def _upcoming(include_past: bool):
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
    limit: int = Query(100, ge=1, le=1000),
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
        stmt = stmt.where(func.fold(Event.city) == fold(normalize_city(city)))
    if genre and genre.strip():
        stmt = stmt.where(genre_clause(session, Event.genre, genre))
    if date_from:
        stmt = stmt.where(col(Event.event_date) >= date_from)
    if date_to:
        stmt = stmt.where(col(Event.event_date) <= date_to)

    stmt = stmt.order_by(col(Event.event_date).is_(None), Event.event_date, Event.id)
    return list(session.exec(stmt.offset(offset).limit(limit)).all())


@router.get("/cities", response_model=list[CityCount])
def list_cities(session: Session = Depends(get_session)) -> list[CityCount]:
    count = func.count(Event.id)
    stmt = (
        select(Event.city, count)
        .where(_upcoming(False))
        .group_by(Event.city)
        .order_by(count.desc(), Event.city)
    )
    return [CityCount(city=city, events=count) for city, count in session.exec(stmt).all()]


@router.get("/{event_id}", response_model=Event)
def get_event(event_id: int, session: Session = Depends(get_session)) -> Event:
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event

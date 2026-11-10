"""Rides and join requests (decision Q6).

A driver offers a ride to an event; passengers send a join request, which the
driver accepts or declines. Seats left = seats_total - accepted requests.
"""

from collections.abc import Iterable
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from ..cities import fold, normalize_city
from ..clock import now_pl
from ..database import get_session
from ..deps import get_current_user, get_optional_user
from ..matching import match
from ..models import Event, RequestStatus, Ride, RideRequest, User
from ..schemas import (
    EventSummary,
    MatchRead,
    MyRequestRead,
    RequestDecision,
    RequestRead,
    RideCreate,
    RideRead,
    UserPublic,
)

router = APIRouter(prefix="/rides", tags=["rides"])
requests_router = APIRouter(prefix="/requests", tags=["requests"])


# --- helpers ---------------------------------------------------------------


def _accepted_counts(session: Session, ride_ids: Iterable[int]) -> dict[int, int]:
    ids = list(ride_ids)
    if not ids:
        return {}
    stmt = (
        select(RideRequest.ride_id, func.count())
        .where(col(RideRequest.ride_id).in_(ids), RideRequest.status == RequestStatus.accepted)
        .group_by(RideRequest.ride_id)
    )
    return dict(session.exec(stmt).all())


def _public(user: User) -> UserPublic:
    return UserPublic.model_validate(user, from_attributes=True)


def _match(a: User, b: User) -> MatchRead:
    return MatchRead.model_validate(match(a, b), from_attributes=True)


def _to_reads(session: Session, rides: list[Ride], viewer: Optional[User] = None) -> list[RideRead]:
    """Build RideRead objects with batched lookups (no query per ride).
    With a viewer, each ride carries the viewer-driver match (not on own rides)."""
    if not rides:
        return []
    events = {
        e.id: e for e in session.exec(select(Event).where(col(Event.id).in_({r.event_id for r in rides})))
    }
    drivers = {
        u.id: u for u in session.exec(select(User).where(col(User.id).in_({r.driver_id for r in rides})))
    }
    taken = _accepted_counts(session, (r.id for r in rides))
    return [
        RideRead(
            **ride.model_dump(exclude={"driver_id", "event_id"}),
            event=EventSummary.model_validate(events[ride.event_id], from_attributes=True),
            driver=_public(drivers[ride.driver_id]),
            seats_left=ride.seats_total - taken.get(ride.id, 0),
            match=(
                _match(viewer, drivers[ride.driver_id])
                if viewer is not None and viewer.id != ride.driver_id
                else None
            ),
        )
        for ride in rides
    ]


def _get_ride_or_404(session: Session, ride_id: int) -> Ride:
    ride = session.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")
    return ride


def _same_event_requests(session: Session, passenger_id: int, event_id: int, status_: RequestStatus):
    """A passenger's requests with the given status on any ride to this event."""
    stmt = (
        select(RideRequest)
        .join(Ride, Ride.id == RideRequest.ride_id)
        .where(
            RideRequest.passenger_id == passenger_id,
            Ride.event_id == event_id,
            RideRequest.status == status_,
        )
    )
    return list(session.exec(stmt).all())


def _request_read(req: RideRequest, passenger: User, driver: Optional[User] = None) -> RequestRead:
    """With the driver given, include driver-passenger match (for the driver's view)."""
    return RequestRead(
        id=req.id,
        ride_id=req.ride_id,
        passenger=_public(passenger),
        status=req.status,
        created_at=req.created_at,
        match=_match(driver, passenger) if driver is not None else None,
    )


# --- rides -----------------------------------------------------------------


@router.post("", response_model=RideRead, status_code=status.HTTP_201_CREATED)
def create_ride(
    data: RideCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RideRead:
    event = session.get(Event, data.event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if data.departure_time <= now_pl():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Departure time must be in the future")
    if event.event_date and data.departure_time.date() > event.event_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Departure must be on or before the event date"
        )

    ride = Ride(
        **data.model_dump(exclude={"origin_city"}),
        origin_city=normalize_city(data.origin_city),
        driver_id=current_user.id,
    )
    session.add(ride)
    session.commit()
    session.refresh(ride)
    return _to_reads(session, [ride])[0]


@router.get("", response_model=list[RideRead])
def list_rides(
    event_id: Optional[int] = None,
    origin_city: Optional[str] = Query(None, max_length=60),
    departure_date: Optional[date] = Query(None, description="Rides leaving on this day"),
    max_price: Optional[float] = Query(None, ge=0),
    no_smoking: bool = Query(False, description="Only rides where smoking in the car isn't allowed"),
    min_seats: int = Query(1, ge=0, le=8, description="Minimum free seats (0 = include full rides)"),
    sort: Optional[Literal["match", "departure"]] = Query(
        None,
        description="Default: best match first when logged in, else soonest first. "
        "'match' needs login; anonymous requests are always sorted by departure.",
    ),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> list[RideRead]:
    """Upcoming rides. Public; logged-in users also get a match % per ride
    and, by default, a ranking by match (decision Q6)."""
    accepted = (
        select(RideRequest.ride_id, func.count().label("n"))
        .where(RideRequest.status == RequestStatus.accepted)
        .group_by(RideRequest.ride_id)
        .subquery()
    )
    seats_left = Ride.seats_total - func.coalesce(accepted.c.n, 0)

    stmt = (
        select(Ride)
        .outerjoin(accepted, accepted.c.ride_id == Ride.id)
        .where(Ride.departure_time > now_pl(), seats_left >= min_seats)
    )
    if event_id is not None:
        stmt = stmt.where(Ride.event_id == event_id)
    if origin_city and origin_city.strip():
        stmt = stmt.where(func.fold(Ride.origin_city) == fold(normalize_city(origin_city)))
    if departure_date:
        stmt = stmt.where(func.date(Ride.departure_time) == departure_date.isoformat())
    if max_price is not None:
        stmt = stmt.where(Ride.price <= max_price)
    if no_smoking:
        stmt = stmt.where(Ride.smoking_allowed == False)  # noqa: E712 (SQL expression)
    if viewer is not None:
        # A search is for rides to join; your own are under GET /rides/mine.
        stmt = stmt.where(Ride.driver_id != viewer.id)

    stmt = stmt.order_by(Ride.departure_time, Ride.id)
    rank_by_match = viewer is not None and sort != "departure"
    if not rank_by_match:
        return _to_reads(session, list(session.exec(stmt.offset(offset).limit(limit)).all()), viewer)

    # Match is computed in Python, so rank all filtered rides, then paginate.
    # Fine at MVP scale (rides to upcoming events number in the hundreds).
    reads = _to_reads(session, list(session.exec(stmt).all()), viewer)
    # Stable sort: ties keep the soonest-departure order.
    reads.sort(key=lambda r: r.match.percent, reverse=True)
    return reads[offset : offset + limit]


# Declared before /{ride_id} so "mine" isn't parsed as an id.
@router.get("/mine", response_model=list[RideRead])
def my_rides(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[RideRead]:
    """Rides I drive (past ones included), soonest first."""
    stmt = select(Ride).where(Ride.driver_id == current_user.id).order_by(Ride.departure_time)
    return _to_reads(session, list(session.exec(stmt).all()))


@router.get("/{ride_id}", response_model=RideRead)
def get_ride(
    ride_id: int,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> RideRead:
    return _to_reads(session, [_get_ride_or_404(session, ride_id)], viewer)[0]


# --- join requests -----------------------------------------------------------


@router.post("/{ride_id}/requests", response_model=RequestRead, status_code=status.HTTP_201_CREATED)
def request_to_join(
    ride_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RequestRead:
    ride = _get_ride_or_404(session, ride_id)
    if ride.driver_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't join your own ride")
    if ride.departure_time <= now_pl():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This ride has already left")
    if _accepted_counts(session, [ride.id]).get(ride.id, 0) >= ride.seats_total:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This ride is full")
    # Passengers may ask several drivers at once, but once one accepts they're
    # set for this event (see decide_request).
    if _same_event_requests(session, current_user.id, ride.event_id, RequestStatus.accepted):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an accepted ride to this event",
        )

    req = RideRequest(ride_id=ride.id, passenger_id=current_user.id)
    session.add(req)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already requested to join this ride",
        )
    session.refresh(req)
    return _request_read(req, current_user)


@router.get("/{ride_id}/requests", response_model=list[RequestRead])
def ride_requests(
    ride_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[RequestRead]:
    """Join requests for my ride (driver only), oldest first."""
    ride = _get_ride_or_404(session, ride_id)
    if ride.driver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the driver can see requests")
    stmt = (
        select(RideRequest, User)
        .join(User, User.id == RideRequest.passenger_id)
        .where(RideRequest.ride_id == ride.id)
        .order_by(RideRequest.created_at, RideRequest.id)
    )
    return [
        _request_read(req, passenger, driver=current_user)
        for req, passenger in session.exec(stmt).all()
    ]


@requests_router.get("/mine", response_model=list[MyRequestRead])
def my_requests(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[MyRequestRead]:
    """Rides I asked to join, with their status, newest first."""
    reqs = list(
        session.exec(
            select(RideRequest)
            .where(RideRequest.passenger_id == current_user.id)
            .order_by(col(RideRequest.created_at).desc(), col(RideRequest.id).desc())
        ).all()
    )
    rides = list(session.exec(select(Ride).where(col(Ride.id).in_({q.ride_id for q in reqs}))))
    ride_reads = {r.id: r for r in _to_reads(session, rides, viewer=current_user)}
    return [
        MyRequestRead(**_request_read(req, current_user).model_dump(), ride=ride_reads[req.ride_id])
        for req in reqs
    ]


@requests_router.patch("/{request_id}", response_model=RequestRead)
def decide_request(
    request_id: int,
    data: RequestDecision,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RequestRead:
    """Driver accepts or declines a pending request. Accepting also declines
    the passenger's other pending requests for the same event."""
    req = session.get(RideRequest, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    ride = session.get(Ride, req.ride_id)
    if ride.driver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the driver can decide")
    if req.status != RequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Request already {req.status.value}")
    if data.status == RequestStatus.accepted and ride.departure_time <= now_pl():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This ride has already left")
    # Check-then-write: two simultaneous accepts could overbook by one. SQLite
    # serialises writes, so the window is tiny; acceptable for the MVP.
    if (
        data.status == RequestStatus.accepted
        and _accepted_counts(session, [ride.id]).get(ride.id, 0) >= ride.seats_total
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No seats left on this ride")

    req.status = data.status
    session.add(req)
    if data.status == RequestStatus.accepted:
        # The passenger now has a seat to this event: decline their other
        # pending requests for it, so no other driver holds a seat for them.
        for other in _same_event_requests(session, req.passenger_id, ride.event_id, RequestStatus.pending):
            if other.id != req.id:
                other.status = RequestStatus.declined
                session.add(other)
    session.commit()
    session.refresh(req)
    return _request_read(req, session.get(User, req.passenger_id))

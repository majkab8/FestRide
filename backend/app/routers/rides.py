from collections.abc import Iterable
from datetime import date
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select
from ..cities import contains_pattern, fold, genre_clause, normalize_city
from ..clock import now_pl
from ..database import get_session
from ..deps import get_current_user, get_optional_user
from ..matching import match
from ..models import Event, NotificationKind, RequestStatus, Ride, RideRequest, User, _utcnow
from .notifications import notify
from ..schemas import (
    EventSummary,
    MatchRead,
    MyRequestRead,
    RequestCreate,
    RequestDecision,
    RequestRead,
    RideCreate,
    RideRead,
    UserPublic,
)

router = APIRouter(prefix="/rides", tags=["rides"])
requests_router = APIRouter(prefix="/requests", tags=["requests"])


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
    if not rides:
        return []
    events = {
        event.id: event for event in session.exec(select(Event).where(col(Event.id).in_({ride.event_id for ride in rides})))
    }
    drivers = {
        user.id: user for user in session.exec(select(User).where(col(User.id).in_({ride.driver_id for ride in rides})))
    }
    taken = _accepted_counts(session, (ride.id for ride in rides))
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


def _request_read(ride_request: RideRequest, passenger: User, driver: Optional[User] = None) -> RequestRead:
    return RequestRead(
        id=ride_request.id,
        ride_id=ride_request.ride_id,
        passenger=_public(passenger),
        status=ride_request.status,
        message=ride_request.message,
        created_at=ride_request.created_at,
        match=_match(driver, passenger) if driver is not None else None,
    )


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
    already = session.exec(
        select(Ride.id).where(
            Ride.driver_id == current_user.id, Ride.event_id == event.id,
            Ride.departure_time > now_pl(), Ride.cancelled == False,
        )
    ).first()
    if already is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already offer a ride to this event")

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
    q: Optional[str] = Query(None, max_length=100, description="Text in the event name or venue"),
    event_city: Optional[str] = Query(None, max_length=60),
    genre: Optional[str] = Query(None, max_length=40, description="Event genre, e.g. rock"),
    origin_city: Optional[str] = Query(None, max_length=60),
    date_from: Optional[date] = Query(None, description="Leaving on or after this day"),
    date_to: Optional[date] = Query(None, description="Leaving on or before this day"),
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
        .where(Ride.departure_time > now_pl(), seats_left >= min_seats, Ride.cancelled == False)  # noqa: E712
    )
    if event_id is not None:
        stmt = stmt.where(Ride.event_id == event_id)
    q, event_city, genre = (value.strip() if value else None for value in (q, event_city, genre))
    if q or event_city or genre:
        stmt = stmt.join(Event, Event.id == Ride.event_id)
        if q:
            pattern = contains_pattern(q)
            stmt = stmt.where(
                or_(
                    func.fold(Event.name).like(pattern, escape="\\"),
                    func.fold(Event.venue).like(pattern, escape="\\"),
                )
            )
        if event_city:
            stmt = stmt.where(func.fold(Event.city) == fold(normalize_city(event_city)))
        if genre:
            stmt = stmt.where(genre_clause(session, Event.genre, genre))
    if origin_city and origin_city.strip():
        stmt = stmt.where(func.fold(Ride.origin_city) == fold(normalize_city(origin_city)))
    if date_from:
        stmt = stmt.where(func.date(Ride.departure_time) >= date_from.isoformat())
    if date_to:
        stmt = stmt.where(func.date(Ride.departure_time) <= date_to.isoformat())
    if max_price is not None:
        stmt = stmt.where(Ride.price <= max_price)
    if no_smoking:
        stmt = stmt.where(Ride.smoking_allowed == False)
    if viewer is not None:
        stmt = stmt.where(Ride.driver_id != viewer.id)

    stmt = stmt.order_by(Ride.departure_time, Ride.id)
    rank_by_match = viewer is not None and sort != "departure"
    if not rank_by_match:
        return _to_reads(session, list(session.exec(stmt.offset(offset).limit(limit)).all()), viewer)

    reads = _to_reads(session, list(session.exec(stmt).all()), viewer)
    reads.sort(key=lambda ride_read: ride_read.match.percent, reverse=True)
    return reads[offset : offset + limit]


@router.get("/mine", response_model=list[RideRead])
def my_rides(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[RideRead]:

    stmt = (
        select(Ride)
        .where(Ride.driver_id == current_user.id, Ride.cancelled == False)
        .order_by(Ride.departure_time)
    )
    return _to_reads(session, list(session.exec(stmt).all()))


@router.get("/{ride_id}", response_model=RideRead)
def get_ride(
    ride_id: int,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> RideRead:
    return _to_reads(session, [_get_ride_or_404(session, ride_id)], viewer)[0]



@router.delete("/{ride_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_ride(
    ride_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    ride = _get_ride_or_404(session, ride_id)
    if ride.driver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the driver can call off a ride")
    if ride.cancelled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This ride is already called off")
    if ride.departure_time <= now_pl():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This ride has already left")
    requests = list(session.exec(select(RideRequest).where(RideRequest.ride_id == ride.id)).all())
    if not requests:
        session.delete(ride)
    else:
        ride.cancelled = True
        session.add(ride)
        for ride_request in requests:
            if ride_request.status in (RequestStatus.pending, RequestStatus.accepted):
                ride_request.status = RequestStatus.called_off
                session.add(ride_request)
                notify(session, ride_request.passenger_id, current_user.id, ride.id, NotificationKind.called_off)
    session.commit()


@router.post("/{ride_id}/requests", response_model=RequestRead, status_code=status.HTTP_201_CREATED)
def request_to_join(
    ride_id: int,
    data: Optional[RequestCreate] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RequestRead:
    ride = _get_ride_or_404(session, ride_id)
    if ride.driver_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't join your own ride")
    if ride.cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The driver called off this ride")
    if ride.departure_time <= now_pl():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This ride has already left")
    if _accepted_counts(session, [ride.id]).get(ride.id, 0) >= ride.seats_total:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This ride is full")

    if _same_event_requests(session, current_user.id, ride.event_id, RequestStatus.accepted):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an accepted ride to this event",
        )

    message = data.message if data and data.message else None
    earlier = session.exec(
        select(RideRequest).where(RideRequest.ride_id == ride.id, RideRequest.passenger_id == current_user.id)
    ).first()
    if earlier is not None and earlier.status == RequestStatus.cancelled:
        ride_request = earlier
        ride_request.status, ride_request.message, ride_request.created_at = RequestStatus.pending, message, _utcnow()
    else:
        ride_request = RideRequest(ride_id=ride.id, passenger_id=current_user.id, message=message)
    session.add(ride_request)
    notify(session, ride.driver_id, current_user.id, ride.id, NotificationKind.request)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already requested to join this ride",
        )
    session.refresh(ride_request)
    return _request_read(ride_request, current_user)


@router.get("/{ride_id}/requests", response_model=list[RequestRead])
def ride_requests(
    ride_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[RequestRead]:
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
        _request_read(ride_request, passenger, driver=current_user)
        for ride_request, passenger in session.exec(stmt).all()
    ]


@requests_router.get("/mine", response_model=list[MyRequestRead])
def my_requests(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[MyRequestRead]:
    reqs = list(
        session.exec(
            select(RideRequest)
            .where(RideRequest.passenger_id == current_user.id)
            .order_by(col(RideRequest.created_at).desc(), col(RideRequest.id).desc())
        ).all()
    )
    rides = list(session.exec(select(Ride).where(col(Ride.id).in_({ride_request.ride_id for ride_request in reqs}))))
    ride_reads = {ride_read.id: ride_read for ride_read in _to_reads(session, rides, viewer=current_user)}
    return [
        MyRequestRead(**_request_read(ride_request, current_user).model_dump(), ride=ride_reads[ride_request.ride_id])
        for ride_request in reqs
    ]


@requests_router.patch("/{request_id}", response_model=RequestRead)
def decide_request(
    request_id: int,
    data: RequestDecision,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RequestRead:
    ride_request = session.get(RideRequest, request_id)
    if ride_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    ride = session.get(Ride, ride_request.ride_id)
    if ride.driver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the driver can decide")
    if ride_request.status != RequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Request already {ride_request.status.value}")
    if data.status == RequestStatus.accepted and ride.departure_time <= now_pl():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This ride has already left")
    if (
        data.status == RequestStatus.accepted
        and _accepted_counts(session, [ride.id]).get(ride.id, 0) >= ride.seats_total
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No seats left on this ride")

    ride_request.status = data.status
    session.add(ride_request)
    notify(session, ride_request.passenger_id, current_user.id, ride.id,
           NotificationKind.accepted if data.status == RequestStatus.accepted else NotificationKind.declined)
    if data.status == RequestStatus.accepted:
        for other in _same_event_requests(session, ride_request.passenger_id, ride.event_id, RequestStatus.pending):
            if other.id != ride_request.id:
                other.status = RequestStatus.declined
                session.add(other)
    session.commit()
    session.refresh(ride_request)
    return _request_read(ride_request, session.get(User, ride_request.passenger_id))


def _get_request_or_404(session: Session, request_id: int) -> tuple[RideRequest, Ride]:
    ride_request = session.get(RideRequest, request_id)
    if ride_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return ride_request, session.get(Ride, ride_request.ride_id)


@requests_router.post("/{request_id}/cancel", response_model=RequestRead)
def cancel_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RequestRead:
    ride_request, ride = _get_request_or_404(session, request_id)
    if ride_request.passenger_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request")
    if ride_request.status not in (RequestStatus.pending, RequestStatus.accepted):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Request already {ride_request.status.value}")
    if ride.departure_time <= now_pl():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This ride has already left")
    ride_request.status = RequestStatus.cancelled
    session.add(ride_request)
    notify(session, ride.driver_id, current_user.id, ride.id, NotificationKind.withdrew)
    session.commit()
    session.refresh(ride_request)
    return _request_read(ride_request, current_user)


@requests_router.post("/{request_id}/remove", response_model=RequestRead)
def remove_passenger(
    request_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RequestRead:
    ride_request, ride = _get_request_or_404(session, request_id)
    if ride.driver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the driver can remove passengers")
    if ride_request.status != RequestStatus.accepted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only an accepted passenger can be removed")
    if ride.departure_time <= now_pl():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This ride has already left")
    ride_request.status = RequestStatus.removed
    session.add(ride_request)
    notify(session, ride_request.passenger_id, current_user.id, ride.id, NotificationKind.removed)
    session.commit()
    session.refresh(ride_request)
    return _request_read(ride_request, session.get(User, ride_request.passenger_id), driver=current_user)

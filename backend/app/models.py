"""Database models for FestRide."""

from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import JSON, Column, Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DrivingStyle(str, Enum):
    quiet = "quiet"
    chatty = "chatty"
    party = "party"


class RequestStatus(str, Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    cancelled = "cancelled"  # the passenger withdrew (before or after a yes)
    removed = "removed"  # the driver took an accepted passenger off the ride
    called_off = "called_off"  # the driver called off the whole ride


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    display_name: str

    # Profile fields used by the matching algorithm.
    music_genres: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    driving_style: DrivingStyle = Field(default=DrivingStyle.chatty)
    smoker: bool = False
    gender: Optional[str] = None

    created_at: datetime = Field(default_factory=_utcnow)


class Event(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    external_id: str = Field(index=True, unique=True)  # Ticketmaster id or seed slug
    name: str
    city: str = Field(index=True)
    venue: Optional[str] = None
    genre: Optional[str] = None  # Ticketmaster genre, e.g. "Rock", "Dance/Electronic"
    event_date: Optional[date] = Field(default=None, index=True)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    url: Optional[str] = None
    image_url: Optional[str] = None


class Ride(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    driver_id: int = Field(foreign_key="user.id", index=True)
    event_id: int = Field(foreign_key="event.id", index=True)

    origin_city: str
    origin_lat: Optional[float] = None
    origin_lng: Optional[float] = None
    departure_time: datetime = Field(index=True)  # naive, Polish local time
    seats_total: int
    price: float = 0.0
    smoking_allowed: bool = False  # in the car, during the ride (decision Q15)
    note: Optional[str] = None
    # Called off by the driver after someone asked to join: kept so passengers
    # see what happened, hidden from search. A ride nobody asked about is deleted.
    cancelled: bool = False

    created_at: datetime = Field(default_factory=_utcnow)


class RideRequest(SQLModel, table=True):
    # One request per passenger per ride; declined and removed are final, a
    # cancelled request is reopened if the passenger asks again.
    __table_args__ = (UniqueConstraint("ride_id", "passenger_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    ride_id: int = Field(foreign_key="ride.id", index=True)
    passenger_id: int = Field(foreign_key="user.id", index=True)
    status: RequestStatus = Field(default=RequestStatus.pending)
    message: Optional[str] = None  # a line for the driver ("one small backpack")
    created_at: datetime = Field(default_factory=_utcnow)


class NotificationKind(str, Enum):
    request = "request"  # to the driver: someone asks for a seat
    withdrew = "withdrew"  # to the driver: a passenger withdrew or gave up their seat
    accepted = "accepted"  # to the passenger
    declined = "declined"  # to the passenger (not sent for requests closed by another yes)
    removed = "removed"  # to the passenger: taken off the ride
    called_off = "called_off"  # to the passenger: the driver called off the ride


class Notification(SQLModel, table=True):
    """One line in the bell: something another person did about a ride of yours."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)  # who sees it
    actor_id: int = Field(foreign_key="user.id")  # who did it
    ride_id: int = Field(foreign_key="ride.id")
    kind: NotificationKind
    read: bool = False
    created_at: datetime = Field(default_factory=_utcnow)

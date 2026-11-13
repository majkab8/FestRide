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
    cancelled = "cancelled"
    removed = "removed"
    called_off = "called_off"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    display_name: str
    music_genres: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    driving_style: DrivingStyle = Field(default=DrivingStyle.chatty)
    smoker: bool = False
    gender: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)


class Event(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    external_id: str = Field(index=True, unique=True)
    name: str
    city: str = Field(index=True)
    venue: Optional[str] = None
    genre: Optional[str] = None
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
    departure_time: datetime = Field(index=True)
    seats_total: int
    price: float = 0.0
    smoking_allowed: bool = False
    note: Optional[str] = None
    cancelled: bool = False
    created_at: datetime = Field(default_factory=_utcnow)


class RideRequest(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("ride_id", "passenger_id"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    ride_id: int = Field(foreign_key="ride.id", index=True)
    passenger_id: int = Field(foreign_key="user.id", index=True)
    status: RequestStatus = Field(default=RequestStatus.pending)
    message: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)


class NotificationKind(str, Enum):
    request = "request"
    withdrew = "withdrew"
    accepted = "accepted"
    declined = "declined"
    removed = "removed"
    called_off = "called_off"


class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    actor_id: int = Field(foreign_key="user.id")
    ride_id: int = Field(foreign_key="ride.id")
    kind: NotificationKind
    read: bool = False
    created_at: datetime = Field(default_factory=_utcnow)

from datetime import date, datetime
from typing import Annotated, Literal, Optional
from pydantic import (
    AfterValidator,
    BaseModel,
    EmailStr,
    Field,
    StrictBool,
    StringConstraints,
    field_validator,
)
from .clock import to_pl_naive
from .models import DrivingStyle, RequestStatus


_PASSWORD = Field(min_length=8, max_length=72)
_Email = Annotated[EmailStr, AfterValidator(str.lower)]
_DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
_Genre = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=40)
]
_Genres = Annotated[
    list[_Genre],
    Field(min_length=1, max_length=20),
    AfterValidator(lambda genres: list(dict.fromkeys(genres))),
]
_Gender = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class UserCreate(BaseModel):
    email: _Email
    password: str = _PASSWORD
    display_name: _DisplayName
    music_genres: _Genres
    driving_style: DrivingStyle
    smoker: StrictBool
    gender: Optional[_Gender] = None


class UserLogin(BaseModel):
    email: _Email
    password: str = Field(max_length=72)


class ProfileUpdate(BaseModel):
    display_name: Optional[_DisplayName] = None
    music_genres: Optional[_Genres] = None
    driving_style: Optional[DrivingStyle] = None
    smoker: Optional[StrictBool] = None
    gender: Optional[_Gender] = None

    @field_validator("display_name", "music_genres", "driving_style", "smoker")
    @classmethod
    def _reject_null(cls, value):
        if value is None:
            raise ValueError("may not be null; omit the field to leave it unchanged")
        return value


class UserRead(BaseModel):
    id: int
    email: EmailStr
    display_name: str
    music_genres: list[str]
    driving_style: DrivingStyle
    smoker: bool
    gender: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class UserPublic(BaseModel):
    id: int
    display_name: str
    music_genres: list[str]
    driving_style: DrivingStyle
    smoker: bool


class EventSummary(BaseModel):
    id: int
    name: str
    city: str
    venue: Optional[str] = None
    event_date: Optional[date] = None


class RideCreate(BaseModel):
    event_id: int
    origin_city: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    origin_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    origin_lng: Optional[float] = Field(default=None, ge=-180, le=180)
    departure_time: Annotated[datetime, AfterValidator(to_pl_naive)]
    seats_total: int = Field(ge=1, le=8)
    price: float = Field(default=0.0, ge=0, le=1000)
    smoking_allowed: StrictBool = False
    note: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]] = None


class MatchRead(BaseModel):
    percent: int
    label: str
    music: float
    style: float
    smoking: float
    shared_genres: list[str]


class RideRead(BaseModel):
    id: int
    event: EventSummary
    driver: UserPublic
    origin_city: str
    origin_lat: Optional[float] = None
    origin_lng: Optional[float] = None
    departure_time: datetime
    seats_total: int
    seats_left: int
    price: float
    smoking_allowed: bool
    note: Optional[str] = None
    cancelled: bool = False
    created_at: datetime
    match: Optional[MatchRead] = None


class RequestCreate(BaseModel):
    message: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]] = None


class RequestRead(BaseModel):
    id: int
    ride_id: int
    passenger: UserPublic
    status: RequestStatus
    message: Optional[str] = None
    created_at: datetime
    match: Optional[MatchRead] = None


class MyRequestRead(RequestRead):
    ride: RideRead


class RequestDecision(BaseModel):
    status: Literal[RequestStatus.accepted, RequestStatus.declined]

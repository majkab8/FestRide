"""Request/response schemas for the API (kept separate from DB models)."""

from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from .models import DrivingStyle

# bcrypt only hashes the first 72 bytes; reject longer passwords up front so we
# return a clear 422 instead of a 500 from the hashing layer.
_PASSWORD = Field(min_length=8, max_length=72)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = _PASSWORD
    display_name: str = Field(min_length=1, max_length=80)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    music_genres: Optional[list[str]] = None
    driving_style: Optional[DrivingStyle] = None
    smoker: Optional[bool] = None
    gender: Optional[str] = None


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

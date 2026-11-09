"""Request/response schemas for the API (kept separate from DB models)."""

from typing import Optional

from pydantic import BaseModel, EmailStr

from .models import DrivingStyle


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str


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

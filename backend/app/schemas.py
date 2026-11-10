"""Request/response schemas for the API (kept separate from DB models)."""

from typing import Annotated, Optional

from pydantic import (
    AfterValidator,
    BaseModel,
    EmailStr,
    Field,
    StrictBool,
    StringConstraints,
    field_validator,
)

from .models import DrivingStyle

# bcrypt only hashes the first 72 bytes; reject longer passwords up front so we
# return a clear 422 instead of a 500 from the hashing layer.
_PASSWORD = Field(min_length=8, max_length=72)

# Shared profile-field limits (used by registration and profile updates).
# Emails are case-insensitive in practice; store and look them up lowercased.
_Email = Annotated[EmailStr, AfterValidator(str.lower)]
_DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
# Lowercased and de-duplicated so "Rock"/"rock" match in the scoring algorithm.
_Genre = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=40)
]
_Genres = Annotated[
    list[_Genre],
    Field(min_length=1, max_length=20),
    AfterValidator(lambda genres: list(dict.fromkeys(genres))),
]
# Non-empty when set; send null to clear it.
_Gender = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class UserCreate(BaseModel):
    """Registration creates a complete profile in one request, so every user
    can be matched right away (no half-finished accounts)."""

    email: _Email
    password: str = _PASSWORD
    display_name: _DisplayName
    music_genres: _Genres
    driving_style: DrivingStyle
    smoker: StrictBool  # strict: a typo like "yes" is a 422, not a guessed True
    gender: Optional[_Gender] = None


class UserLogin(BaseModel):
    email: _Email
    # Cap length only (no min) so bad logins return 401, not a 422 or a 500.
    password: str = Field(max_length=72)


class ProfileUpdate(BaseModel):
    """Partial update: omitted fields stay unchanged (PATCH semantics)."""

    display_name: Optional[_DisplayName] = None
    music_genres: Optional[_Genres] = None
    driving_style: Optional[DrivingStyle] = None
    smoker: Optional[StrictBool] = None
    gender: Optional[_Gender] = None  # null clears it

    @field_validator("display_name", "music_genres", "driving_style", "smoker")
    @classmethod
    def _reject_null(cls, value):
        # These columns are NOT NULL; an explicit null would crash the commit
        # with a 500, so reject it here as a 422. Omit the field to keep it.
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

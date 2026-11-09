"""Authentication and profile endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..deps import get_current_user
from ..database import get_session
from ..models import User
from ..schemas import ProfileUpdate, Token, UserCreate, UserLogin, UserRead
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_for(user: User) -> Token:
    return Token(
        access_token=create_access_token(user.id),
        user=UserRead.model_validate(user, from_attributes=True),
    )


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, session: Session = Depends(get_session)) -> Token:
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        display_name=data.display_name,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _token_for(user)


@router.post("/login", response_model=Token)
def login(data: UserLogin, session: Session = Depends(get_session)) -> Token:
    user = session.exec(select(User).where(User.email == data.email)).first()
    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return _token_for(user)


@router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/me", response_model=UserRead)
def update_me(
    data: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(current_user, field, value)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user

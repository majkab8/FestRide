"""Database engine and session management (SQLite via SQLModel)."""

from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from .config import settings

# check_same_thread=False is required so SQLite can be used across FastAPI threads.
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    """Create all tables. Safe to call repeatedly."""
    # Importing models here ensures they are registered on SQLModel.metadata.
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session

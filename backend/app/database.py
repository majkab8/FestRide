"""Database engine and session management (SQLite via SQLModel)."""

from collections.abc import Iterator

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from .cities import fold
from .config import settings

# check_same_thread=False is required so SQLite can be used across FastAPI threads.
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _register_sql_functions(dbapi_conn, _record) -> None:
    # SQLite's LIKE is case-insensitive for ASCII only, so expose fold() to SQL
    # for case- and diacritic-insensitive search ("lodz" matches "Łódź").
    dbapi_conn.create_function("fold", 1, lambda s: fold(s) if s is not None else None, deterministic=True)


def init_db() -> None:
    """Create all tables. Safe to call repeatedly."""
    # Importing models here ensures they are registered on SQLModel.metadata.
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session

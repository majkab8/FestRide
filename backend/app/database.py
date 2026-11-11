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
    _add_missing_columns()


def _add_missing_columns() -> None:
    """create_all doesn't alter existing tables: add columns introduced later,
    so an existing local database keeps working (no migration tool in the MVP)."""
    added = {"ride": {"cancelled": "BOOLEAN NOT NULL DEFAULT 0"}}
    with engine.begin() as conn:
        for table, columns in added.items():
            have = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, ddl in columns.items():
                if have and name not in have:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def get_session() -> Iterator[Session]:
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session

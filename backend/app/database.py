from collections.abc import Iterator
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine
from .cities import fold
from .config import settings


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _register_sql_functions(dbapi_conn, _record) -> None:
    dbapi_conn.create_function("fold", 1, lambda s: fold(s) if s is not None else None, deterministic=True)


def init_db() -> None:
    from . import models  # noqa: F401
    SQLModel.metadata.create_all(engine)
    _add_missing_columns()


def _add_missing_columns() -> None:
    added = {"ride": {"cancelled": "BOOLEAN NOT NULL DEFAULT 0"}}
    with engine.begin() as conn:
        for table, columns in added.items():
            have = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, ddl in columns.items():
                if have and name not in have:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session

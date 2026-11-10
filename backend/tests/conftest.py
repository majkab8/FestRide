"""Test fixtures: the real app on a fresh in-memory SQLite DB per test."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import models  # noqa: F401  (registers tables on SQLModel.metadata)
from app.clock import today_pl
from app.database import _register_sql_functions, get_session
from app.main import app
from app.models import Event


@pytest.fixture(autouse=True)
def no_real_ai(monkeypatch):
    """Tests never call Gemini: AI is off unless a test fakes the model reply."""
    from app.config import settings
    from app.routers import ai as ai_router

    from app import ai

    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(ai, "_down_until", 0.0)  # reset the circuit breaker
    ai_router._search_cache.clear()
    ai_router._explain_cache.clear()


@pytest.fixture
def fake_model(monkeypatch):
    """Enable AI and make the model return `reply` (a value, or an exception to raise)."""
    from app import ai
    from app.config import settings

    calls = []

    def install(reply):
        monkeypatch.setattr(settings, "gemini_api_key", "test-key")

        def fake(system, user, schema, max_tokens):
            calls.append(user)
            if isinstance(reply, Exception):
                raise reply
            return reply(user) if callable(reply) else reply

        monkeypatch.setattr(ai, "_generate_json", fake)
        return calls

    return install


@pytest.fixture
def engine():
    # StaticPool: one shared connection, so the in-memory DB survives across sessions.
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    event.listen(eng, "connect", _register_sql_functions)
    SQLModel.metadata.create_all(eng)
    with Session(eng) as s:
        s.add(Event(external_id="t:1", name="Test Fest", city="Kraków", event_date=today_pl() + timedelta(days=10)))
        s.add(Event(external_id="t:2", name="Old Gig", city="Łódź", event_date=date(2020, 1, 1)))
        s.commit()
    yield eng
    eng.dispose()


@pytest.fixture
def client(engine):
    def _session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _session
    # Not used as a context manager, so the app's lifespan (which would touch
    # the real festride.db) doesn't run.
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def register(client):
    counter = iter(range(10_000))

    def _register(genres=("rock",), style="chatty", smoker=False, name=None):
        n = next(counter)
        r = client.post(
            "/auth/register",
            json={
                "email": f"user{n}@example.com",
                "password": "password123",
                "display_name": name or f"User {n}",
                "music_genres": list(genres),
                "driving_style": style,
                "smoker": smoker,
            },
        )
        assert r.status_code == 201, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return _register


@pytest.fixture
def event_id(client):
    return client.get("/events", params={"q": "Test Fest"}).json()[0]["id"]


@pytest.fixture
def make_ride(client, event_id):
    def _make(headers, hours_before=0, seats=3, price=0, smoking_allowed=False):
        departure = (today_pl() + timedelta(days=10)).isoformat() + f"T{12 - hours_before:02d}:00"
        r = client.post(
            "/rides",
            json={
                "event_id": event_id,
                "origin_city": "Warsaw",
                "departure_time": departure,
                "seats_total": seats,
                "price": price,
                "smoking_allowed": smoking_allowed,
            },
            headers=headers,
        )
        assert r.status_code == 201, r.text
        return r.json()["id"]

    return _make

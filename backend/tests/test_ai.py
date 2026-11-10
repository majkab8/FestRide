"""AI features with a faked model: validation of model output, fallbacks, endpoints."""

from datetime import date

import httpx
import pytest

from app import ai
from app.config import settings


# --- ai.py: model output handling -------------------------------------------------------


def test_parse_search_drops_invalid_fields(fake_model):
    fake_model({"origin_city": "lodz", "max_price": -5, "date_from": "2026-13-01", "min_seats": 2, "bogus": 1})
    f = ai.parse_search("whatever", date(2026, 11, 10))
    assert (f.origin_city, f.max_price, f.date_from, f.min_seats) == ("Łódź", None, None, 2)


def test_parse_search_rejects_non_object(fake_model):
    fake_model(["not", "an", "object"])
    with pytest.raises(ai.AIUnavailable):
        ai.parse_search("whatever", date(2026, 11, 10))


def test_explain_keeps_only_requested_ids_and_trims(fake_model):
    fake_model([{"id": 0, "text": "  You both love\n techno.  "}, {"id": 7, "text": "stray"}, {"id": 1, "text": "x" * 500}])
    out = ai.explain_matches([{"id": 0}, {"id": 1}])
    assert out == {0: "You both love techno.", 1: "x" * 200}


def test_no_key_is_unavailable():
    with pytest.raises(ai.AIUnavailable):
        ai.parse_search("z łodzi", date(2026, 11, 10))


class _Resp:
    def __init__(self, status, payload=None):
        self.status_code, self._payload = status, payload

    def json(self):
        return self._payload


def _ok(text):
    return _Resp(200, {"candidates": [{"content": {"parts": [{"text": text}]}}]})


def test_falls_back_to_second_model_and_never_puts_key_in_url(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "secret-key")
    seen = []

    def fake_post(url, json, headers, timeout):
        seen.append((url, headers["x-goog-api-key"]))
        return _Resp(503, {}) if len(seen) == 1 else _ok('{"origin_city": "Kraków"}')

    monkeypatch.setattr(httpx, "post", fake_post)
    assert ai.parse_search("z krakowa", date(2026, 11, 10)).origin_city == "Kraków"
    assert [settings.gemini_model, settings.gemini_fallback_model] == [u.split("/models/")[1].split(":")[0] for u, _ in seen]
    assert all("secret-key" not in u for u, _ in seen) and all(k == "secret-key" for _, k in seen)


def test_network_errors_become_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "k")

    def boom(*a, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", boom)
    with pytest.raises(ai.AIUnavailable):
        ai.parse_search("z krakowa", date(2026, 11, 10))


def test_circuit_breaker_skips_network_after_failure(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "k")
    calls = []
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: calls.append(1) or _Resp(503, {}))
    for _ in range(3):
        with pytest.raises(ai.AIUnavailable):
            ai.parse_search("x", date(2026, 11, 10))
    assert len(calls) == 2  # primary + fallback once, then cooling down


def test_malformed_parts_are_unavailable_not_500(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "k")
    bad = _Resp(200, {"candidates": [{"content": {"parts": ["not-a-dict"]}}]})
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: bad)
    with pytest.raises(ai.AIUnavailable):
        ai.parse_search("x", date(2026, 11, 10))


def test_bad_request_is_not_retried(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "k")
    calls = []
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: calls.append(1) or _Resp(400, {}))
    with pytest.raises(ai.AIUnavailable):
        ai.parse_search("x", date(2026, 11, 10))
    assert len(calls) == 1


# --- POST /ai/search -----------------------------------------------------------------------


def test_search_uses_ai_when_available(client, fake_model):
    calls = fake_model({"origin_city": "Łódź", "genre": "techno"})
    r = client.post("/ai/search", json={"text": "z łodzi na techno"}).json()
    assert r["source"] == "ai" and r["chips"] == ["From Łódź", "techno"] and r["understood"]
    client.post("/ai/search", json={"text": "Z ŁODZI NA TECHNO"})  # cached (case-insensitive)
    assert len(calls) == 1


def test_search_falls_back_to_rules(client, fake_model):
    fake_model(ai.AIUnavailable("503"))
    r = client.post("/ai/search", json={"text": "do krakowa jutro"}).json()
    assert r["source"] == "rules" and r["filters"]["event_city"] == "Kraków"


def test_search_without_key_uses_rules_and_reports_not_understood(client):
    r = client.post("/ai/search", json={"text": "asdf"}).json()
    assert r == {**r, "source": "rules", "understood": False, "chips": []}


def test_search_validates_input(client):
    assert client.post("/ai/search", json={"text": ""}).status_code == 422
    assert client.post("/ai/search", json={"text": "x" * 301}).status_code == 422


def test_search_filters_work_on_rides(client, register, make_ride, fake_model):
    make_ride(register())  # from Warszawa to Test Fest in Kraków
    fake_model({"origin_city": "Warsaw", "event_city": "krakow"})
    filters = client.post("/ai/search", json={"text": "..."}).json()["filters"]
    params = {k: v for k, v in filters.items() if v not in (None, False)}
    assert len(client.get("/rides", params=params).json()) == 1


# --- POST /ai/explain ----------------------------------------------------------------------


def test_explain_rides_and_requests(client, register, make_ride, fake_model):
    driver = register(["techno"], "party", name="D")
    ride = make_ride(driver)
    passenger = register(["house"], "party")
    req = client.post(f"/rides/{ride}/requests", headers=passenger).json()

    calls = fake_model(lambda user: [{"id": 0, "text": "You both like electronic music."}])
    r = client.post("/ai/explain", json={"ride_ids": [ride]}, headers=passenger).json()
    assert r == {"rides": {str(ride): "You both like electronic music."}, "requests": {}, "ai_available": True}
    assert '"D"' not in calls[0] and "example.com" not in calls[0]  # no names/emails sent to the model

    r = client.post("/ai/explain", json={"request_ids": [req["id"]]}, headers=driver).json()
    assert r["requests"] == {str(req["id"]): "You both like electronic music."}


def test_explain_is_cached(client, register, make_ride, fake_model):
    ride = make_ride(register())
    me = register()
    calls = fake_model([{"id": 0, "text": "ok"}])
    for _ in range(2):
        client.post("/ai/explain", json={"ride_ids": [ride]}, headers=me)
    assert len(calls) == 1


def test_explain_requests_only_for_driver(client, register, make_ride):
    ride = make_ride(register())
    passenger = register()
    req = client.post(f"/rides/{ride}/requests", headers=passenger).json()
    assert client.post("/ai/explain", json={"request_ids": [req["id"]]}, headers=passenger).status_code == 403


def test_explain_degrades_and_needs_login(client, register, make_ride, fake_model):
    ride = make_ride(register())
    me = register()
    assert client.post("/ai/explain", json={"ride_ids": [ride]}).status_code == 401
    assert client.post("/ai/explain", json={"ride_ids": list(range(6))}, headers=me).status_code == 422
    fake_model(ai.AIUnavailable("503"))
    r = client.post("/ai/explain", json={"ride_ids": [ride]}, headers=me).json()
    assert r == {"rides": {}, "requests": {}, "ai_available": False}
    own = make_ride(me)
    assert client.post("/ai/explain", json={"ride_ids": [own]}, headers=me).json()["rides"] == {}


def test_explain_language_reaches_prompt_and_cache(client, register, make_ride, monkeypatch):
    from app import ai
    from app.config import settings

    monkeypatch.setattr(settings, "gemini_api_key", "k")
    systems = []

    def fake(system, user, schema, max_tokens):
        systems.append(system)
        return [{"id": 0, "text": "ok"}]

    monkeypatch.setattr(ai, "_generate_json", fake)
    ride = make_ride(register())
    me = register()
    for lang in ("pl", "pl", "en"):
        client.post("/ai/explain", json={"ride_ids": [ride], "lang": lang}, headers=me)
    assert len(systems) == 2  # second "pl" call served from cache
    assert "Polish" in systems[0] and "English" in systems[1]
    assert client.post("/ai/explain", json={"ride_ids": [ride], "lang": "de"}, headers=me).status_code == 422

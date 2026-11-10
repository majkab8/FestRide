"""API tests for the main flows: auth, events, rides, requests, match ranking."""


def names(rides):
    return [r["driver"]["display_name"] for r in rides]


# --- auth ---------------------------------------------------------------------


def test_register_requires_full_profile(client):
    r = client.post(
        "/auth/register",
        json={"email": "a@example.com", "password": "password123", "display_name": "A"},
    )
    assert r.status_code == 422


def test_patch_me_rejects_null(client, register):
    h = register()
    assert client.patch("/auth/me", json={"display_name": None}, headers=h).status_code == 422
    assert client.patch("/auth/me", json={"music_genres": ["House "]}, headers=h).json()["music_genres"] == ["house"]


# --- events -------------------------------------------------------------------


def test_events_upcoming_and_city_spellings(client):
    assert [e["name"] for e in client.get("/events").json()] == ["Test Fest"]  # past event hidden
    for spelling in ("Krakow", "KRAKÓW", "cracow"):
        assert len(client.get("/events", params={"city": spelling}).json()) == 1
    assert client.get("/events", params={"q": "%"}).json() == []  # wildcard is literal


# --- rides & requests ---------------------------------------------------------


def test_ride_validation(client, register, event_id):
    h = register()
    base = {"event_id": event_id, "origin_city": "Łódź", "seats_total": 2}
    assert client.post("/rides", json={**base, "departure_time": "2020-01-01T10:00"}, headers=h).status_code == 400
    assert client.post("/rides", json={**base, "departure_time": "2099-01-01T10:00"}, headers=h).status_code == 400
    assert client.post("/rides", json={**base, "departure_time": "2099-01-01T10:00"}).status_code == 401


def test_request_flow_and_seat_limit(client, register, make_ride):
    driver = register(name="Driver")
    ride = make_ride(driver, seats=1)
    p1, p2 = register(), register()

    assert client.post(f"/rides/{ride}/requests", headers=driver).status_code == 400  # own ride
    req1 = client.post(f"/rides/{ride}/requests", headers=p1).json()
    assert client.post(f"/rides/{ride}/requests", headers=p1).status_code == 409  # duplicate
    req2 = client.post(f"/rides/{ride}/requests", headers=p2).json()

    assert client.get(f"/rides/{ride}/requests", headers=p1).status_code == 403  # not the driver
    assert client.patch(f"/requests/{req1['id']}", json={"status": "accepted"}, headers=p1).status_code == 403
    assert client.patch(f"/requests/{req1['id']}", json={"status": "accepted"}, headers=driver).status_code == 200
    assert client.patch(f"/requests/{req2['id']}", json={"status": "accepted"}, headers=driver).status_code == 409

    assert client.get(f"/rides/{ride}").json()["seats_left"] == 0
    assert client.get("/rides").json() == []  # full rides hidden by default
    assert len(client.get("/rides", params={"min_seats": 0}).json()) == 1


def test_accept_declines_other_requests_to_same_event(client, register, make_ride):
    a, b = register(), register()
    ride_a, ride_b = make_ride(a), make_ride(b)
    passenger = register()
    req_a = client.post(f"/rides/{ride_a}/requests", headers=passenger).json()
    req_b = client.post(f"/rides/{ride_b}/requests", headers=passenger).json()

    client.patch(f"/requests/{req_a['id']}", json={"status": "accepted"}, headers=a)

    statuses = {q["id"]: q["status"] for q in client.get("/requests/mine", headers=passenger).json()}
    assert statuses == {req_a["id"]: "accepted", req_b["id"]: "declined"}
    assert client.post(f"/rides/{ride_b}/requests", headers=passenger).status_code == 409


# --- match ranking ------------------------------------------------------------


def test_ranking_by_match_when_logged_in(client, register, make_ride):
    # Departure order (soonest first): Jazz, House, Twin.
    make_ride(register(["jazz"], "quiet", smoker=True, name="Jazz"), hours_before=2)
    make_ride(register(["house"], "chatty", name="House"), hours_before=1)
    make_ride(register(["techno", "house"], "party", name="Twin"), hours_before=0)
    me = register(["techno", "house"], "party", name="Me")
    make_ride(me, hours_before=3)  # my own ride: no match, ranked last

    assert names(client.get("/rides").json()) == ["Me", "Jazz", "House", "Twin"]  # anonymous
    ranked = client.get("/rides", headers=me).json()
    assert names(ranked) == ["Twin", "House", "Jazz", "Me"]
    assert [r["match"]["percent"] if r["match"] else None for r in ranked] == [100, 80, 0, None]
    assert names(client.get("/rides", params={"sort": "departure"}, headers=me).json())[0] == "Me"
    assert names(client.get("/rides", params={"limit": 1, "offset": 1}, headers=me).json()) == ["House"]


def test_no_smoking_filter(client, register, make_ride):
    make_ride(register(name="Smoky"), smoking_allowed=True)
    make_ride(register(name="Clean"))
    assert sorted(names(client.get("/rides").json())) == ["Clean", "Smoky"]
    assert names(client.get("/rides", params={"no_smoking": True}).json()) == ["Clean"]


def test_match_has_label(client, register, make_ride):
    make_ride(register(["techno"], "party"))
    [ride] = client.get("/rides", headers=register(["techno"], "party")).json()
    assert ride["match"] == {**ride["match"], "percent": 100, "label": "Great match"}


def test_bad_token_on_public_endpoint_is_401(client):
    assert client.get("/rides", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_driver_sees_match_on_requests(client, register, make_ride):
    driver = register(["rock"], "quiet")
    ride = make_ride(driver)
    client.post(f"/rides/{ride}/requests", headers=register(["rock"], "quiet"))
    [req] = client.get(f"/rides/{ride}/requests", headers=driver).json()
    assert req["match"]["percent"] == 100
    assert "email" not in req["passenger"] and "gender" not in req["passenger"]

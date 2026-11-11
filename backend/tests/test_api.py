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


def test_passenger_can_withdraw_and_ask_again(client, register, make_ride):
    driver = register()
    ride = make_ride(driver, seats=1)
    passenger, stranger = register(), register()
    req = client.post(f"/rides/{ride}/requests", json={"message": "hej"}, headers=passenger).json()
    assert client.post(f"/requests/{req['id']}/cancel", headers=stranger).status_code == 403

    # withdraw while pending, then ask again: the same request reopens
    assert client.post(f"/requests/{req['id']}/cancel", headers=passenger).json()["status"] == "cancelled"
    assert client.post(f"/requests/{req['id']}/cancel", headers=passenger).status_code == 409
    again = client.post(f"/rides/{ride}/requests", json={"message": "jednak tak"}, headers=passenger).json()
    assert (again["id"], again["status"], again["message"]) == (req["id"], "pending", "jednak tak")

    # give up an accepted seat: the seat frees up
    client.patch(f"/requests/{req['id']}", json={"status": "accepted"}, headers=driver)
    assert client.get(f"/rides/{ride}").json()["seats_left"] == 0
    client.post(f"/requests/{req['id']}/cancel", headers=passenger)
    assert client.get(f"/rides/{ride}").json()["seats_left"] == 1
    statuses = {q["id"]: q["status"] for q in client.get(f"/rides/{ride}/requests", headers=driver).json()}
    assert statuses == {req["id"]: "cancelled"}
    # a cancelled request can't be accepted
    assert client.patch(f"/requests/{req['id']}", json={"status": "accepted"}, headers=driver).status_code == 409


def test_driver_can_remove_an_accepted_passenger(client, register, make_ride):
    driver = register()
    ride = make_ride(driver, seats=1)
    passenger, waiting = register(), register()
    req = client.post(f"/rides/{ride}/requests", headers=passenger).json()
    other = client.post(f"/rides/{ride}/requests", headers=waiting).json()
    assert client.post(f"/requests/{req['id']}/remove", headers=driver).status_code == 409  # not accepted yet
    client.patch(f"/requests/{req['id']}", json={"status": "accepted"}, headers=driver)

    assert client.post(f"/requests/{req['id']}/remove", headers=passenger).status_code == 403
    assert client.post(f"/requests/{req['id']}/remove", headers=driver).json()["status"] == "removed"
    assert client.get(f"/rides/{ride}").json()["seats_left"] == 1
    # the freed seat can go to someone else; the removed passenger can't ask this ride again
    assert client.patch(f"/requests/{other['id']}", json={"status": "accepted"}, headers=driver).status_code == 200
    assert client.post(f"/rides/{ride}/requests", headers=passenger).status_code == 409
    assert [q["status"] for q in client.get("/requests/mine", headers=passenger).json()] == ["removed"]


# --- match ranking ------------------------------------------------------------


def test_ranking_by_match_when_logged_in(client, register, make_ride):
    # Departure order (soonest first): Jazz, House, Twin.
    make_ride(register(["jazz"], "quiet", smoker=True, name="Jazz"), hours_before=2)
    make_ride(register(["house"], "chatty", name="House"), hours_before=1)
    make_ride(register(["techno", "house"], "party", name="Twin"), hours_before=0)
    me = register(["techno", "house"], "party", name="Me")
    make_ride(me, hours_before=3)  # my own ride: hidden from my search

    assert names(client.get("/rides").json()) == ["Me", "Jazz", "House", "Twin"]  # anonymous
    ranked = client.get("/rides", headers=me).json()
    assert names(ranked) == ["Twin", "House", "Jazz"]
    assert [r["match"]["percent"] for r in ranked] == [100, 80, 0]
    assert names(client.get("/rides", params={"sort": "departure"}, headers=me).json()) == ["Jazz", "House", "Twin"]
    assert names(client.get("/rides/mine", headers=me).json()) == ["Me"]
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


def test_genre_filter_matches_family(client, register, make_ride, engine):
    from sqlmodel import Session, select

    from app.models import Event

    with Session(engine) as s:
        ev = s.exec(select(Event).where(Event.name == "Test Fest")).one()
        ev.genre = "Dance/Electronic"
        s.add(ev)
        s.commit()
    make_ride(register())
    for genre in ("techno", "house", "electronic", "dance"):
        assert len(client.get("/rides", params={"genre": genre}).json()) == 1, genre
        assert len(client.get("/events", params={"genre": genre}).json()) == 1, genre
    assert client.get("/rides", params={"genre": "rock"}).json() == []


def test_request_message_reaches_driver(client, register, make_ride):
    driver = register()
    ride = make_ride(driver)
    passenger = register()
    r = client.post(f"/rides/{ride}/requests", json={"message": "  One small backpack  "}, headers=passenger)
    assert r.status_code == 201 and r.json()["message"] == "One small backpack"
    [req] = client.get(f"/rides/{ride}/requests", headers=driver).json()
    assert req["message"] == "One small backpack"
    assert client.post(f"/rides/{ride}/requests", json={"message": "x" * 301}, headers=register()).status_code == 422



def test_one_ride_per_driver_per_event(client, register, make_ride, event_id):
    driver = register()
    first = make_ride(driver, hours_before=2)
    departure = client.get(f"/rides/{first}").json()["departure_time"][:10] + "T12:00"
    r = client.post("/rides", json={"event_id": event_id, "origin_city": "Łódź", "departure_time": departure,
                                    "seats_total": 3, "price": 0}, headers=driver)
    assert r.status_code == 409 and "already offer" in r.json()["detail"]  # same event, two hours later
    make_ride(register())  # another driver to the same event is fine


def test_driver_can_call_off_a_ride(client, register, make_ride, event_id):
    driver, other = register(), register()
    # nobody asked: the ride is simply gone
    empty = make_ride(driver)
    assert client.delete(f"/rides/{empty}", headers=other).status_code == 403
    assert client.delete(f"/rides/{empty}", headers=driver).status_code == 204
    assert client.get(f"/rides/{empty}").status_code == 404

    # with passengers: kept as called off, hidden, requests closed
    ride = make_ride(driver)
    going, waiting = register(), register()
    req = client.post(f"/rides/{ride}/requests", headers=going).json()
    client.post(f"/rides/{ride}/requests", headers=waiting)
    client.patch(f"/requests/{req['id']}", json={"status": "accepted"}, headers=driver)
    assert client.delete(f"/rides/{ride}", headers=driver).status_code == 204
    assert client.delete(f"/rides/{ride}", headers=driver).status_code == 409

    assert client.get(f"/rides/{ride}").json()["cancelled"] is True
    assert ride not in [r["id"] for r in client.get("/rides").json()]
    assert ride not in [r["id"] for r in client.get("/rides/mine", headers=driver).json()]
    for passenger in (going, waiting):
        assert [q["status"] for q in client.get("/requests/mine", headers=passenger).json()] == ["called_off"]
    assert client.post(f"/rides/{ride}/requests", headers=register()).status_code == 400
    # the passenger is free to take another car, and the driver to offer a new ride
    assert client.post(f"/rides/{make_ride(register())}/requests", headers=going).status_code == 201
    make_ride(driver)


def test_notifications_follow_the_ride(client, register, make_ride):
    driver = register(name="Kuba")
    passenger = register(name="Ola")
    ride = make_ride(driver)
    bell = lambda who: client.get("/notifications", headers=who).json()
    kinds = lambda who: [n["kind"] for n in bell(who)["items"]]

    req = client.post(f"/rides/{ride}/requests", headers=passenger).json()
    first = bell(driver)
    assert first["unread"] == 1 and first["items"][0]["actor_name"] == "Ola" and first["items"][0]["event_name"] == "Test Fest"

    client.patch(f"/requests/{req['id']}", json={"status": "accepted"}, headers=driver)
    client.post(f"/requests/{req['id']}/cancel", headers=passenger)
    assert kinds(passenger) == ["accepted"] and kinds(driver) == ["withdrew", "request"]

    assert client.post("/notifications/read", headers=driver).status_code == 204
    assert bell(driver)["unread"] == 0 and bell(passenger)["unread"] == 1

    client.post(f"/rides/{ride}/requests", headers=passenger)  # asks again
    client.patch(f"/requests/{req['id']}", json={"status": "accepted"}, headers=driver)
    client.post(f"/requests/{req['id']}/remove", headers=driver)
    assert kinds(passenger)[:2] == ["removed", "accepted"]

    other = register()
    req2 = client.post(f"/rides/{ride}/requests", headers=other).json()
    client.delete(f"/rides/{ride}", headers=driver)
    assert kinds(other) == ["called_off"]
    assert client.get("/notifications").status_code == 401
    assert req2["status"] == "pending"

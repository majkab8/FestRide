"""Demo data for trying FestRide by hand (and for presenting it).

Usage (from backend/, after import_events.py):
    python seed_demo.py           # create demo users, rides and requests
    python seed_demo.py --reset   # remove previous demo data first

Log in as  demo@example.com / festride-demo  (techno & house, party, non-smoker):
- GET /rides?event_id=<showcase>  -> 5 drivers to the same event, ranked by match
- GET /rides/mine, /rides/{id}/requests -> your own ride with 2 pending requests
All demo accounts end in "@example.com" and use the same password.
"""

import argparse
import sys
from datetime import datetime, time, timedelta

from sqlmodel import Session, col, select

from app.clock import today_pl
from app.database import engine, init_db
from app.models import DrivingStyle, Event, RequestStatus, Ride, RideRequest, User
from app.security import hash_password

PASSWORD = "festride-demo"
DEMO_EMAIL = "demo@example.com"

# name, genres, driving style, smoker, origin city, price, smoking allowed in the car, note
DRIVERS = [
    ("Kuba", ["techno", "house"], "party", False, "Łódź", 35, False, "Techno all the way, bring snacks!"),
    ("Ola", ["pop", "disco"], "chatty", False, "Łódź", 30, False, "Happy to chat and share playlists."),
    ("Zosia", ["hip-hop", "r&b"], "chatty", False, "Kraków", 40, False, None),
    ("Piotr", ["jazz", "blues"], "quiet", False, "Poznań", 45, False, "Quiet ride, leaving on time."),
    ("Marek", ["rock", "metal"], "quiet", True, "Wrocław", 25, True, "I smoke during breaks and in the car."),
]
PASSENGERS = [  # name, genres, style, smoker, message to the driver
    ("Tomek", ["house", "electronic"], "party", False, "Hi! I can meet you at Łódź Fabryczna."),
    ("Kasia", ["rock", "indie"], "chatty", True, "Is there room for a small backpack?"),
]


def _email(name: str) -> str:
    return f"{name.lower()}@example.com"


def _reset(session: Session) -> int:
    users = session.exec(select(User).where(col(User.email).like("%@example.com"))).all()
    ids = [u.id for u in users]
    if not ids:
        return 0
    rides = session.exec(select(Ride).where(col(Ride.driver_id).in_(ids))).all()
    ride_ids = [r.id for r in rides]
    for req in session.exec(
        select(RideRequest).where(col(RideRequest.passenger_id).in_(ids) | col(RideRequest.ride_id).in_(ride_ids))
    ):
        session.delete(req)
    for ride in rides:
        session.delete(ride)
    for user in users:
        session.delete(user)
    session.commit()
    return len(users)


def _user(session: Session, name, genres, style, smoker, email=None) -> User:
    user = User(
        email=email or _email(name),
        hashed_password=hash_password(PASSWORD),
        display_name=name,
        music_genres=genres,
        driving_style=DrivingStyle(style),
        smoker=smoker,
    )
    session.add(user)
    session.flush()
    return user


def _upcoming(session: Session, min_days: int, city=None, exclude=()) -> Event | None:
    stmt = (
        select(Event)
        .where(Event.event_date >= today_pl() + timedelta(days=min_days), col(Event.id).not_in(list(exclude) or [0]))
        .order_by(Event.event_date, Event.id)
    )
    if city:
        stmt = stmt.where(Event.city == city)
    return session.exec(stmt).first()


def _ride(session: Session, driver: User, event: Event, origin, price, smoking, note, seats=3) -> Ride:
    ride = Ride(
        driver_id=driver.id,
        event_id=event.id,
        origin_city=origin,
        departure_time=datetime.combine(event.event_date, time(10, 0)),
        seats_total=seats,
        price=price,
        smoking_allowed=smoking,
        note=note,
    )
    session.add(ride)
    session.flush()
    return ride


def main() -> int:
    parser = argparse.ArgumentParser(description="Create FestRide demo data")
    parser.add_argument("--reset", action="store_true", help="delete existing *@example.com demo data first")
    args = parser.parse_args()

    init_db()
    with Session(engine) as session:
        if args.reset:
            print(f"Removed {_reset(session)} demo users (and their rides/requests).")
        if session.exec(select(User).where(User.email == DEMO_EMAIL)).first():
            print("Demo data already exists. Use --reset to recreate it.")
            return 0

        showcase = _upcoming(session, 5, city="Kraków") or _upcoming(session, 5)
        mine = _upcoming(session, 3, city="Warszawa", exclude=[showcase.id]) if showcase else None
        if showcase is None or mine is None:
            print("No upcoming events found. Run `python import_events.py` first.")
            return 1

        demo = _user(session, "Ania (demo)", ["techno", "house"], "party", False, email=DEMO_EMAIL)
        drivers = {}
        for name, genres, style, smoker, origin, price, smoking, note in DRIVERS:
            drivers[name] = _user(session, name, genres, style, smoker)
            _ride(session, drivers[name], showcase, origin, price, smoking, note)

        own = _ride(session, demo, mine, "Łódź", 30, False, "Leaving from Łódź Fabryczna.", seats=2)
        for name, genres, style, smoker, message in PASSENGERS:
            passenger = _user(session, name, genres, style, smoker)
            session.add(RideRequest(ride_id=own.id, passenger_id=passenger.id, message=message))

        # Ania as a passenger on two other events: one confirmed ride (Home's
        # wristband card) and two requests still waiting for a yes.
        used = [showcase.id, mine.id]
        going = _upcoming(session, 4, exclude=used)
        if going:
            used.append(going.id)
            ride = _ride(session, drivers["Kuba"], going, "Łódź", 35, False, "Techno all the way, bring snacks!")
            session.add(RideRequest(ride_id=ride.id, passenger_id=demo.id, status=RequestStatus.accepted, message="Hi! Small backpack only."))
        waiting = _upcoming(session, 6, exclude=used)
        if waiting:
            for name, origin, price in (("Ola", "Łódź", 30), ("Piotr", "Łódź", 40)):
                ride = _ride(session, drivers[name], waiting, origin, price, False, None)
                session.add(RideRequest(ride_id=ride.id, passenger_id=demo.id, message="Hi! Is there room for one?"))
        session.commit()

        print(f"Log in as {DEMO_EMAIL} / {PASSWORD}")
        print(f"Showcase event (5 drivers, ranked by match): #{showcase.id} {showcase.name} - "
              f"{showcase.city}, {showcase.event_date}  ->  GET /rides?event_id={showcase.id}")
        print(f"Your own ride (2 pending requests): ride #{own.id} to {mine.name} - {mine.city}, "
              f"{mine.event_date}  ->  GET /rides/{own.id}/requests")
    return 0


if __name__ == "__main__":
    sys.exit(main())

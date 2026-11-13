import argparse
import random
import sys
from datetime import datetime, time, timedelta
from sqlmodel import Session, col, select
from app.cities import fold
from app.clock import today_pl
from app.database import engine, init_db
from app.models import DrivingStyle, Event, Notification, NotificationKind, RequestStatus, Ride, RideRequest, User
from app.security import hash_password

PASSWORD = "festride-demo"
DEMO_EMAIL = "demo@example.com"

DRIVERS = [
    ("Kuba", ["techno", "house"], "party", False, "Łódź", 35, False, "Techno przez całą drogę, weźcie przekąski!"),
    ("Ola", ["pop", "disco"], "chatty", False, "Łódź", 30, False, "Chętnie pogadam i wymienię się playlistami."),
    ("Bartek", ["house", "disco"], "chatty", False, "Gdańsk", 40, False, "W radiu house, chętnie pogadam."),
    ("Zosia", ["hip-hop", "r&b"], "chatty", False, "Kraków", 40, False, None),
    ("Piotr", ["jazz", "blues"], "quiet", False, "Poznań", 45, False, "Cicha jazda, wyjeżdżam punktualnie."),
    ("Marek", ["rock", "metal"], "quiet", True, "Wrocław", 25, True, "Palę na postojach i w aucie."),
]

MAGDA = ("Magda", ["house", "techno", "pop"], "party", False, "female")
PAWEL = ("Paweł", ["techno", "electronic", "rock"], "chatty", False, "male")

PASSENGERS = [
    ("Julia", ["house", "disco"], "chatty", False, "female", "Super, to do zobaczenia na miejscu!", "accepted"),
    ("Magda", None, None, None, None, "Hej Mateusz! Zabierzesz mnie? Biorę głośnik.", "pending"),
    ("Tomek", ["house", "electronic"], "party", False, "male", "Cześć! Mogę podejść pod Łódź Fabryczną.", "pending"),
]

CROWD = [
    ("Kasia", "female", ["rock", "indie"], "chatty", True),
    ("Wiktoria", "female", ["pop", "dance pop"], "party", False),
    ("Natalia", "female", ["indie", "alternative"], "quiet", False),
    ("Karolina", "female", ["hip-hop", "trap"], "party", False),
    ("Agata", "female", ["metal", "hard rock"], "chatty", True),
    ("Ewa", "female", ["jazz", "soul"], "quiet", False),
    ("Marta", "female", ["techno", "minimal"], "party", False),
    ("Aleksandra", "female", ["pop", "r&b"], "chatty", False),
    ("Monika", "female", ["folk", "world"], "quiet", False),
    ("Paulina", "female", ["rock", "punk"], "party", True),
    ("Gosia", "female", ["classical", "opera"], "quiet", False),
    ("Weronika", "female", ["house", "deep house"], "chatty", False),
    ("Joanna", "female", ["alternative", "post-rock"], "quiet", False),
    ("Dominika", "female", ["polski rap", "hip-hop"], "chatty", True),
    ("Iga", "female", ["disco polo", "pop"], "party", False),
    ("Hania", "female", ["indie pop", "synthpop"], "chatty", False),
    ("Michał", "male", ["rock", "metal"], "party", True),
    ("Kamil", "male", ["techno", "trance"], "party", False),
    ("Adam", "male", ["hip-hop", "rap"], "chatty", False),
    ("Łukasz", "male", ["metal", "metalcore"], "quiet", True),
    ("Krzysiek", "male", ["jazz", "blues"], "quiet", False),
    ("Szymon", "male", ["drum and bass", "dubstep"], "party", False),
    ("Filip", "male", ["indie", "rock"], "chatty", False),
    ("Jakub", "male", ["pop", "electronic"], "chatty", False),
    ("Dawid", "male", ["punk", "hardcore"], "party", True),
    ("Rafał", "male", ["classical", "jazz"], "quiet", False),
    ("Wojtek", "male", ["reggae", "ska"], "chatty", True),
    ("Grzesiek", "male", ["alternative", "grunge"], "quiet", False),
    ("Sebastian", "male", ["trap", "drill"], "party", True),
    ("Mikołaj", "male", ["house", "techno"], "chatty", False),
    ("Igor", "male", ["progressive rock", "post-rock"], "quiet", False),
    ("Oskar", "male", ["edm", "dance"], "party", False),
    ("Antek", "male", ["folk rock", "country"], "chatty", False),
    ("Jan", "male", ["rock", "blues"], "quiet", False),
    ("Alex", "non-binary", ["indie", "electronic"], "chatty", False),
    ("Sam", "non-binary", ["synthpop", "house"], "party", False),
]

ORIGINS = ["Warszawa", "Kraków", "Łódź", "Wrocław", "Poznań", "Gdańsk", "Katowice", "Lublin",
           "Szczecin", "Białystok", "Bydgoszcz", "Toruń", "Rzeszów", "Kielce", "Opole", "Olsztyn"]
NOTES = [
    None, None,
    "Wyjeżdżam punktualnie, nie czekam dłużej niż 10 minut.",
    "Muzyka na cały regulator, playlista otwarta dla wszystkich.",
    "Mam miejsce na bagaż, namiot też się zmieści.",
    "Po drodze jeden postój na kawę.",
    "Wracam zaraz po koncercie, jeśli ktoś chce też w drugą stronę.",
    "Cicha jazda, można się przespać przed imprezą.",
    "Bez palenia w aucie, na postojach jak najbardziej.",
    "Mogę zgarnąć kogoś po drodze, piszcie.",
    "Auto z klimą, wygodnie i bez stresu.",
    "Zrzutka na paliwo, reszta to dobra zabawa.",
]

MESSAGES = [
    "Cześć! Znajdzie się miejsce dla jednej osoby?",
    "Hej, mogę dołączyć? Mam tylko plecak.",
    "Mogę podejść pod dworzec, jeśli to po drodze.",
    "Jadę pierwszy raz na ten koncert, chętnie się zabiorę!",
    "Dorzucę się do paliwa i ogarnę przekąski.",
    None,
]


def _email(name: str) -> str:
    return f"{fold(name)}@example.com"


def _reset(session: Session) -> int:
    users = session.exec(select(User).where(col(User.email).like("%@example.com"))).all()
    ids = [user.id for user in users]
    if not ids:
        return 0
    rides = session.exec(select(Ride).where(col(Ride.driver_id).in_(ids))).all()
    ride_ids = [ride.id for ride in rides]
    for ride_request in session.exec(
        select(RideRequest).where(col(RideRequest.passenger_id).in_(ids) | col(RideRequest.ride_id).in_(ride_ids))
    ):
        session.delete(ride_request)
    for note in session.exec(
        select(Notification).where(
            col(Notification.user_id).in_(ids) | col(Notification.actor_id).in_(ids) | col(Notification.ride_id).in_(ride_ids)
        )
    ):
        session.delete(note)
    for ride in rides:
        session.delete(ride)
    for user in users:
        session.delete(user)
    session.commit()
    return len(users)


def _user(session: Session, name, genres, style, smoker, email=None, gender=None) -> User:
    user = User(
        email=email or _email(name),
        hashed_password=hash_password(PASSWORD),
        display_name=name,
        music_genres=genres,
        driving_style=DrivingStyle(style),
        smoker=smoker,
        gender=gender,
    )
    session.add(user)
    session.flush()
    return user


def _upcoming(session: Session, min_days: int, city=None, exclude=(), genre=None) -> Event | None:
    stmt = (
        select(Event)
        .where(Event.event_date >= today_pl() + timedelta(days=min_days), col(Event.id).not_in(list(exclude) or [0]))
        .order_by(Event.event_date, Event.id)
    )
    if city:
        stmt = stmt.where(Event.city == city)
    if genre:
        stmt = stmt.where(Event.genre == genre)
    return session.exec(stmt).first()


def _ride(session: Session, driver: User, event: Event, origin, price, smoking, note, seats=3, hour=10, minute=0) -> Ride:
    ride = Ride(
        driver_id=driver.id,
        event_id=event.id,
        origin_city=origin,
        departure_time=datetime.combine(event.event_date, time(hour, minute)),
        seats_total=seats,
        price=price,
        smoking_allowed=smoking,
        note=note,
    )
    session.add(ride)
    session.flush()
    return ride


def _crowd(session: Session, lead: int, used: list[int], extra_drivers: list[User], n_events: int = 45) -> int:
    rng = random.Random(2026)
    people = [_user(session, name, genres, style, smoker, gender=gender) for name, gender, genres, style, smoker in CROWD]
    everyone = people + extra_drivers

    events = session.exec(
        select(Event)
        .where(Event.event_date >= today_pl() + timedelta(days=lead), col(Event.id).not_in(used))
        .order_by(Event.event_date, Event.id)
    ).all()
    if not events:
        return 0
    picked = events[:: max(1, len(events) // n_events)][:n_events]

    count = 0
    for event in picked:
        drivers = rng.sample(everyone, k=rng.choice([1, 2, 2, 3, 3, 4]))
        taken = {driver.id for driver in drivers}
        for driver in drivers:
            seats = rng.choice([2, 3, 3, 4, 4])
            ride = _ride(
                session, driver, event,
                origin=rng.choice([city for city in ORIGINS if city != event.city]),
                price=rng.choice([20, 25, 30, 35, 40, 45, 50, 60, 70]),
                smoking=driver.smoker and rng.random() < 0.5,
                note=rng.choice(NOTES),
                seats=seats,
                hour=rng.choice([7, 8, 9, 10, 11, 12, 13, 14]),
                minute=rng.choice([0, 15, 30, 45]),
            )
            count += 1
            accepted = rng.randint(0, seats - 1)
            pending = rng.randint(0, 2)
            pool = [person for person in people if person.id not in taken]
            for i, passenger in enumerate(rng.sample(pool, k=min(len(pool), accepted + pending))):
                taken.add(passenger.id)
                status = RequestStatus.accepted if i < accepted else RequestStatus.pending
                session.add(RideRequest(ride_id=ride.id, passenger_id=passenger.id, status=status, message=rng.choice(MESSAGES)))
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Create FestRide demo data")
    parser.add_argument("--reset", action="store_true", help="delete existing *@example.com demo data first")
    parser.add_argument("--lead-days", type=int, default=7, help="every demo event is at least this many days from today (default 7)")
    args = parser.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    init_db()
    with Session(engine) as session:
        if args.reset:
            print(f"Removed {_reset(session)} demo users (and their rides/requests).")
        if session.exec(select(User).where(User.email == DEMO_EMAIL)).first():
            print("Demo data already exists. Use --reset to recreate it.")
            return 0

        lead = max(0, args.lead_days)
        showcase = (_upcoming(session, lead + 5, city="Kraków", genre="Dance/Electronic")
                    or _upcoming(session, lead + 5, genre="Dance/Electronic")
                    or _upcoming(session, lead + 5, city="Kraków") or _upcoming(session, lead + 5))
        mine = _upcoming(session, lead + 3, city="Warszawa", exclude=[showcase.id]) if showcase else None
        if showcase is None or mine is None:
            print("No upcoming events found. Run `python import_events.py` first.")
            return 1

        demo = _user(session, "Mateusz", ["techno", "house"], "party", False, email=DEMO_EMAIL, gender="male")
        magda = _user(session, *MAGDA[:4], gender=MAGDA[4])
        pawel = _user(session, *PAWEL[:4], gender=PAWEL[4])
        drivers = {}
        for name, genres, style, smoker, origin, price, smoking, note in DRIVERS:
            drivers[name] = _user(session, name, genres, style, smoker)
            _ride(session, drivers[name], showcase, origin, price, smoking, note)

        own = _ride(session, demo, mine, "Łódź", 30, False, "Ruszam spod Łodzi Fabrycznej.", seats=3)
        for name, genres, style, smoker, gender, message, status in PASSENGERS:
            passenger = magda if name == "Magda" else _user(session, name, genres, style, smoker, gender=gender)
            session.add(RideRequest(ride_id=own.id, passenger_id=passenger.id, message=message, status=RequestStatus(status)))
            session.add(Notification(user_id=demo.id, actor_id=passenger.id, ride_id=own.id,
                                     kind=NotificationKind.request, read=status != "pending"))

        used = [showcase.id, mine.id]
        going = _upcoming(session, lead + 4, exclude=used)
        if going:
            used.append(going.id)
            ride = _ride(session, pawel, going, "Łódź", 35, False,
                         "Jedziemy z Magdą, zostało jedno miejsce. Techno od pierwszego kilometra!")
            session.add(RideRequest(ride_id=ride.id, passenger_id=magda.id, status=RequestStatus.accepted, message="Jasne, że jadę!"))
            session.add(RideRequest(ride_id=ride.id, passenger_id=demo.id, status=RequestStatus.accepted, message="Cześć! Mam tylko mały plecak."))
            session.add(Notification(user_id=demo.id, actor_id=pawel.id, ride_id=ride.id, kind=NotificationKind.accepted))
        waiting = _upcoming(session, lead + 6, exclude=used)
        if waiting:
            used.append(waiting.id)
            for name, origin, price in (("Ola", "Łódź", 30), ("Piotr", "Łódź", 40)):
                ride = _ride(session, drivers[name], waiting, origin, price, False, None)
                session.add(RideRequest(ride_id=ride.id, passenger_id=demo.id, message="Cześć! Znajdzie się miejsce dla jednej osoby?"))
        refused = _upcoming(session, lead + 8, exclude=used)
        if refused:
            used.append(refused.id)
            ride = _ride(session, drivers["Marek"], refused, "Wrocław", 25, True, "Palę na postojach i w aucie.", seats=2)
            session.add(RideRequest(ride_id=ride.id, passenger_id=demo.id, status=RequestStatus.declined, message="Hej, jest jeszcze miejsce?"))
            session.add(Notification(user_id=demo.id, actor_id=drivers["Marek"].id, ride_id=ride.id, kind=NotificationKind.declined))

        crowd_rides = _crowd(session, lead, used, [magda, pawel, *drivers.values()])
        session.commit()

        print(f"Log in as {DEMO_EMAIL} / {PASSWORD}  (Mateusz)")
        print(f"Showcase event (6 drivers, ranked by match): #{showcase.id} {showcase.name} - "
              f"{showcase.city}, {showcase.event_date}  ->  GET /rides?event_id={showcase.id}")
        print(f"Mateusz's own ride (Julia in, Magda and Tomek asking): ride #{own.id} to {mine.name} - "
              f"{mine.city}, {mine.event_date}  ->  GET /rides/{own.id}/requests")
        print(f"Crowd: {crowd_rides} more rides to other events.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

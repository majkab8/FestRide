"""One-off import of Polish music events into the local SQLite database.

Usage (from the backend/ directory):
    python import_events.py          # Ticketmaster + big festivals if TICKETMASTER_API_KEY is set, else festivals only
    python import_events.py --seed   # only the built-in festival list

The import is idempotent: events are upserted by `external_id`, so re-running
refreshes existing rows instead of creating duplicates. The app itself only
reads from the database, never from the live API (decision Q3).
"""

import argparse
import sys
from datetime import date
from typing import Optional

import httpx
from sqlmodel import Session, select

from app.cities import normalize_city
from app.config import settings
from app.database import engine, init_db
from app.models import Event

TM_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
PAGE_SIZE = 200
MAX_PAGES = 5  # Ticketmaster refuses deep paging beyond 1000 results (size * page)
SKIP_STATUSES = {"cancelled"}


def _pick_image(images: list[dict]) -> Optional[str]:
    """Prefer a 16:9 image close to 1024px wide (good for cards and headers)."""
    if not images:
        return None
    wide = [i for i in images if i.get("ratio") == "16_9"] or images
    return min(wide, key=lambda i: abs((i.get("width") or 0) - 1024)).get("url")


def _parse_tm_event(raw: dict) -> Optional[dict]:
    """Map one Ticketmaster event to Event fields, or None if unusable."""
    if raw.get("dates", {}).get("status", {}).get("code") in SKIP_STATUSES:
        return None
    venues = raw.get("_embedded", {}).get("venues") or []
    if not venues:
        return None
    venue = venues[0]
    city = (venue.get("city") or {}).get("name")
    if not city:
        return None

    location = venue.get("location") or {}
    try:
        lat = float(location["latitude"])
        lng = float(location["longitude"])
    except (KeyError, TypeError, ValueError):
        lat = lng = None

    local_date = raw.get("dates", {}).get("start", {}).get("localDate")
    classification = (raw.get("classifications") or [{}])[0]
    genre = (classification.get("genre") or {}).get("name")

    return {
        "external_id": f"tm:{raw['id']}",
        "name": raw["name"].strip(),
        "city": normalize_city(city),
        "venue": (venue.get("name") or "").strip() or None,
        "genre": None if genre in (None, "Undefined") else genre,
        "event_date": date.fromisoformat(local_date) if local_date else None,
        "latitude": lat,
        "longitude": lng,
        "url": raw.get("url"),
        "image_url": _pick_image(raw.get("images") or []),
    }


def fetch_ticketmaster(api_key: str) -> list[dict]:
    # Keyed by external_id: paging can return the same event on two pages,
    # and a duplicate would break the unique constraint on insert.
    events: dict[str, dict] = {}
    skipped = 0
    with httpx.Client(timeout=20) as client:
        page = 0
        while page < MAX_PAGES:
            resp = client.get(
                TM_URL,
                params={
                    "apikey": api_key,
                    "countryCode": "PL",
                    "classificationName": "music",
                    "size": PAGE_SIZE,
                    "page": page,
                    "sort": "date,asc",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            for raw in data.get("_embedded", {}).get("events", []):
                try:
                    parsed = _parse_tm_event(raw)
                except (KeyError, TypeError, ValueError):
                    parsed = None  # malformed record: skip it, don't abort the import
                if parsed:
                    events[parsed["external_id"]] = parsed
                else:
                    skipped += 1
            total_pages = data.get("page", {}).get("totalPages", 0)
            page += 1
            if page >= total_pages:
                break
    print(f"Ticketmaster: {len(events)} events fetched, {skipped} skipped (cancelled/incomplete)")
    return list(events.values())


# Big festivals Ticketmaster doesn't sell (their tickets go through other
# shops), added on every import. Dates are the first festival day, checked
# against the organisers' announcements in Nov 2026; venues/coordinates are
# approximate. Only editions with confirmed dates belong here. Also the
# fallback data when there is no Ticketmaster key.
FESTIVALS = [
    ("fest:mystic-2027", "Mystic Festival 2027", "Gdańsk", "Polsat Plus Arena Gdańsk (Letnica)", "Metal", "2027-06-10", 54.3897, 18.6401, "https://www.mysticfestival.pl"),
    ("fest:opener-2027", "Open'er Festival 2027", "Gdynia", "Lotnisko Gdynia-Kosakowo", "Alternative", "2027-06-30", 54.5302, 18.4952, "https://opener.pl"),
    ("fest:polandrock-2027", "Pol'and'Rock Festival 2027", "Czaplinek", "Lotnisko Broczyno", "Rock", "2027-07-29", 53.5600, 16.2400, "https://polandrockfestival.pl"),
    ("fest:orange-warsaw-2027", "Orange Warsaw Festival 2027", "Warszawa", "Tor Wyścigów Konnych Służewiec", "Pop", "2027-08-13", 52.1700, 21.0120, "https://orangewarsawfestival.pl"),
]


def seed_events() -> list[dict]:
    return [
        {
            "external_id": ext_id,
            "name": name,
            "city": city,
            "venue": venue,
            "genre": genre,
            "event_date": date.fromisoformat(day),
            "latitude": lat,
            "longitude": lng,
            "url": url,
            "image_url": None,
        }
        for ext_id, name, city, venue, genre, day, lat, lng, url in FESTIVALS
    ]


def upsert(events: list[dict]) -> tuple[int, int]:
    created = updated = 0
    with Session(engine) as session:
        existing = {e.external_id: e for e in session.exec(select(Event)).all()}
        for fields in events:
            row = existing.get(fields["external_id"])
            if row is None:
                session.add(Event(**fields))
                created += 1
            else:
                for key, value in fields.items():
                    setattr(row, key, value)
                session.add(row)
                updated += 1
        session.commit()
    return created, updated


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", action="store_true", help="load the built-in seed instead of Ticketmaster")
    args = parser.parse_args()

    init_db()
    if args.seed or not settings.ticketmaster_api_key:
        if not args.seed:
            print("TICKETMASTER_API_KEY not set; loading built-in seed.")
        events = seed_events()
    else:
        try:
            events = fetch_ticketmaster(settings.ticketmaster_api_key)
        except httpx.HTTPError as exc:
            # Don't echo the request URL: it contains the API key.
            detail = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else type(exc).__name__
            print(f"Ticketmaster request failed ({detail}). Re-run with --seed to use sample data.")
            return 1
        except ValueError:
            print("Ticketmaster returned a non-JSON response. Re-run with --seed to use sample data.")
            return 1

        events += seed_events()

    created, updated = upsert(events)
    print(f"Done: {created} created, {updated} updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

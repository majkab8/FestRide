# FestRide

Carpooling to concerts and festivals in Poland. Pick a gig, find a car that's going, and see how well
you'd get along with the driver before you ask for a seat: a match score built from your music taste,
how you like to ride (quiet, chatty, party) and smoking. Drivers get the same score for every passenger
who asks.

Search works in plain language: type *"z Łodzi na techno do Krakowa w grudniu, max 50 zł"* and it turns
into filters you can see and adjust. The whole UI switches between Polish and English, and has a light
and a dark theme.

## What's inside

- **Events** imported from the Ticketmaster Discovery API (or a built-in sample of 8 Polish festivals)
- **Rides**: drivers offer seats to an event; passengers ask, drivers accept or decline; the first
  "yes" takes the seat and the passenger's other requests to the same event close automatically
- **Match score** (0–100 %): music 60 % (shared genres, related genre families), ride style 25 %,
  smoking 15 %, with a label from "great match" to "different vibes"
- **AI (Google Gemini)**, marked with a "✶ AI" badge wherever it is used, each with a no-AI fallback:
  - sentence search: a sentence becomes filters (rule-based parser without a key, which also recognises known event names)
  - offer a ride in one sentence: *"jadę z Łodzi na Föllakzoid 4 grudnia o 10, 3 miejsca po 35 zł"* fills the whole form
  - "✶ Write it for me": a short note for passengers, written in the driver's voice from the ride and their profile
  - one line on why you'd get along with a driver or passenger
- **Map** of the routes (Leaflet + OpenStreetMap), limited to Poland
- **Responsive**: phones get a pinned map with the focused ride, swipeable suggestions, hamburger menus

**Stack:** FastAPI · SQLModel/SQLite · JWT auth · React 19 + TypeScript + Vite · Leaflet ·
Gemini (optional) · pytest

## Quick start (about 5 minutes, no API keys needed)

You need **Python 3.11+** and **Node 20+**. Two terminals: one for the backend, one for the frontend.

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # Windows (cmd): copy .env.example .env

python import_events.py           # loads events (Ticketmaster if a key is set, else 8 sample festivals)
python seed_demo.py               # demo users, rides and requests
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and log in with **`demo@example.com` / `festride-demo`**.

## A two-minute tour

1. **Landing page** (logged out): the line-up of upcoming shows, how it works, an example match.
2. **Log in** with the demo account → **Start**: your next ride (a wristband card), the requests still
   waiting for a "yes", and suggestions picked for you.
3. **Szukaj / Find**: type a sentence, e.g. *z Łodzi na techno* — the chips show how it was understood.
   The showcase event has six drivers, one at every match level (green star, circle, square, hexagon).
4. Open a ride: the score breakdown, the route, and the seats; ask for a seat.
5. **Kierowca / Drive**: your own ride as a driver, with two passengers waiting to be accepted.
   **+ Zaproponuj przejazd / Offer a ride**: describe the ride in one sentence and press *Wypełnij*,
   then *✶ Napisz za mnie* for the note (with a Gemini key; without one, simpler fallbacks).
6. Switch **PL / EN** and the theme in the account menu (top right).

## Optional: real events and AI

Put keys in `backend/.env`:

| Key | What it adds | Without it |
|---|---|---|
| `TICKETMASTER_API_KEY` ([get one](https://developer.ticketmaster.com)) | ~500+ real upcoming events from Ticketmaster | 8 sample festivals (2027) |
| `GEMINI_API_KEY` ([free key](https://aistudio.google.com)) | AI sentence search, ride offer from one sentence, "write it for me" notes, one-line "why you'd get along" | rule-based search and offer parsing, a template note; match % and labels still work |

After adding the Ticketmaster key, run `python import_events.py` again, then `python seed_demo.py --reset`.

## Demo data

```bash
python seed_demo.py --reset                  # wipe *@example.com demo data and create it again
python seed_demo.py --reset --lead-days 3    # demo events at least 3 days out (default 7)
```

Every demo event is at least `--lead-days` after the day you run it, so the data stays "upcoming"
for about a week. Re-seed before showing the app if it is older than that. All demo accounts end in
`@example.com` and share the password `festride-demo`.

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q tests        # in-memory DB, doesn't touch festride.db
```

`npm run build` in `frontend/` type-checks and builds to `frontend/dist/`.

## Project layout

```
backend/
  app/
    main.py          FastAPI app, CORS
    models.py        User, Event, Ride, RideRequest (SQLModel)
    matching.py      match score and labels
    search.py, ai.py sentence search (Gemini + rule-based fallback), match explanations
    routers/         auth, events, rides, ai
  import_events.py   Ticketmaster import / sample seed
  seed_demo.py       demo users, rides and requests
  tests/
frontend/
  src/
    pages/           Landing, Home, Search, RideDetail, MyRides, Drive, OfferRide, Events, Auth
    components/      layout (header, menus, footer), map, shared UI
    i18n.tsx         Polish / English strings
    poland.ts        Poland's border (Natural Earth, public domain) for the map
```

## Trying it on a phone

Run both servers so the local network can reach them (replace `192.168.1.10` with your computer's IP):

```bash
# backend
FRONTEND_ORIGIN="http://localhost:5173,http://192.168.1.10:5173" uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# frontend
VITE_API_URL="http://192.168.1.10:8000" npm run dev -- --host
```

Then open `http://192.168.1.10:5173` on a phone on the same Wi-Fi. (On Windows PowerShell, set the
variables with `$env:FRONTEND_ORIGIN="..."` before the command.) Allow Python and Node through the
firewall on private networks if asked.

## Notes

- **No migrations** in this MVP. If a pull changed the models and you see `no such column`, delete
  `backend/festride.db` and run `python import_events.py` and `python seed_demo.py` again.
- On Windows the frontend calls the API at `http://127.0.0.1:8000` rather than `localhost`, which
  can add ~2 s per request (IPv6 lookup first).
- Festival photos on the landing page: Krzysztof Popławski, CC BY 4.0 (credited on the page).

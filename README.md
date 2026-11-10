# FestRide

Carpooling to concerts and festivals in Poland, with AI-assisted search and
passenger–driver matching.

## Backend (FastAPI + SQLite)

Requires Python 3.11+.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # then fill in the values (see comments in the file)
```

### Import events

```bash
python import_events.py          # Ticketmaster (needs TICKETMASTER_API_KEY), else built-in seed
python import_events.py --seed   # always use the 8-event sample seed
```

The import upserts by event id, so re-running it refreshes events without
duplicates. It is additive: events that disappear from Ticketmaster are kept.

### Demo data (optional)

```bash
python seed_demo.py           # demo users, rides and join requests on real upcoming events
python seed_demo.py --reset   # recreate it
```

Log in as `demo@example.com` / `festride-demo`. The script prints a showcase event with five
drivers (ranked by match for the demo user) and the demo user's own ride with two pending
requests.

### Run the API

```bash
uvicorn app.main:app --reload --port 8000
```

- Health check: http://localhost:8000/health
- Interactive API docs: http://localhost:8000/docs

### AI features (optional)

With `GEMINI_API_KEY` set (free key from https://aistudio.google.com):

- `POST /ai/search` turns a sentence like *"z Łodzi na techno do Krakowa w grudniu, max 50 zł"*
  into `GET /rides` filters plus a preview of how it was understood.
- `POST /ai/explain` writes a one-line "why you'd get along" for up to 5 rides or requests.

Without a key, or when the free tier is overloaded, search falls back to a simple rule-based
parser (`"source": "rules"`) and explanations are just omitted; match % and labels always work.
After a failure the app pauses AI calls for 30 s, so searches fall back instantly.

> On Windows, call the API at `http://127.0.0.1:8000` rather than `localhost`, which can add
> ~2 s per request (IPv6 lookup first).

### Tests

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests     # in-memory DB, doesn't touch festride.db
```

## Frontend (React + Vite + TypeScript)

Requires Node 20+. Start the backend first (above), then:

```bash
cd frontend
npm install
cp .env.example .env    # optional: VITE_API_URL, defaults to http://127.0.0.1:8000
npm run dev             # http://localhost:5173
```

- Polish / English switch in the header (remembered per browser); light and dark theme.
- Log in with the demo account from `seed_demo.py` (`demo@example.com` / `festride-demo`)
  to see rides ranked by match, AI explanations, and the driver dashboard.
- The map uses Leaflet with OpenStreetMap tiles (no API key).
- `npm run build` type-checks and builds to `frontend/dist/`.

> **Schema changes:** there are no migrations in this MVP. If you pulled a
> version that changed the models and see errors like `no such column`, delete
> `backend/festride.db` and re-run `python import_events.py`.

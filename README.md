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

### Run the API

```bash
uvicorn app.main:app --reload --port 8000
```

- Health check: http://localhost:8000/health
- Interactive API docs: http://localhost:8000/docs

> **Schema changes:** there are no migrations in this MVP. If you pulled a
> version that changed the models and see errors like `no such column`, delete
> `backend/festride.db` and re-run `python import_events.py`.

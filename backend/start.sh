#!/bin/sh
python import_events.py || python import_events.py --seed
python seed_demo.py --reset || echo "Demo data was not created"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"

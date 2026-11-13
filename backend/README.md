# FestRide: backend

API w FastAPI + SQLModel z bazą SQLite. Jak uruchomić cały projekt, opisuje [Szybki start w głównym README](../README.md#-szybki-start).

Po uruchomieniu serwera dokumentacja wszystkich endpointów, z możliwością ich wypróbowania, jest pod http://127.0.0.1:8000/docs.

## Polecenia

Z katalogu `backend/`, w aktywnym środowisku `.venv`:

| Polecenie | Co robi |
|---|---|
| `uvicorn app.main:app --reload --port 8000` | serwer deweloperski |
| `python import_events.py` | wydarzenia z Ticketmastera i duże festiwale (bez klucza: same festiwale) |
| `python import_events.py --seed` | tylko wbudowana lista festiwali |
| `python seed_demo.py --reset` | dane demo od nowa: Mateusz, kierowcy, przejazdy i prośby |
| `python -m pytest -q` | testy |

## Ustawienia (`.env`)

Skopiuj `.env.example` do `.env`. Żadne ustawienie nie jest wymagane do pracy lokalnej.

| Zmienna | Domyślnie | Do czego |
|---|---|---|
| `SECRET_KEY` | `dev-secret-change-me` | podpis tokenów logowania; na produkcji obowiązkowo długi losowy tekst |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 dni) | ważność tokena |
| `DATABASE_URL` | `sqlite:///./festride.db` | plik bazy |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | adresy frontendu dopuszczone przez CORS, po przecinku |
| `GEMINI_API_KEY` | pusty | AI; bez klucza wyszukiwanie działa na regułach, a notka kierowcy na szablonie |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | modele Flash-Lite | model główny i zapasowy |
| `TICKETMASTER_API_KEY` | pusty | prawdziwe koncerty w `import_events.py` |
| `API_PREFIX` | pusty | na produkcji `/api`, żeby adresy API nie kolidowały ze stronami |
| `STATIC_DIR` | pusty | folder ze zbudowanym frontendem, który serwer ma serwować |

## Struktura

| Plik / folder | Zawartość |
|---|---|
| `app/main.py` | tworzenie aplikacji, CORS, API pod prefiksem, serwowanie frontendu |
| `app/config.py` | ustawienia z `.env` |
| `app/models.py` | tabele: użytkownik, wydarzenie, przejazd, prośba, powiadomienie |
| `app/schemas.py` | kształt danych przyjmowanych i zwracanych przez API |
| `app/database.py` | połączenie z bazą i funkcja `fold` w SQLite |
| `app/security.py`, `app/deps.py` | hasła (bcrypt), tokeny JWT, zalogowany użytkownik |
| `app/routers/` | endpointy: konta, wydarzenia, przejazdy i prośby, powiadomienia, AI |
| `app/matching.py` | wynik dopasowania: muzyka 60%, styl jazdy 25%, palenie 15% |
| `app/search.py` | wyszukiwanie jednym zdaniem bez AI |
| `app/ai.py` | wywołania Gemini z planem B, gdy AI nie działa |
| `app/cities.py` | nazwy miast i porównywanie tekstu bez polskich znaków |
| `app/clock.py` | czas polski, niezależnie od strefy serwera |
| `import_events.py`, `seed_demo.py` | dane: wydarzenia i konto demo |
| `start.sh` | start na Railway: import, dane demo, serwer |
| `tests/` | testy API, dopasowania, wyszukiwania, AI i serwowania frontendu |

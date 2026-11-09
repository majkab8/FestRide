# FestRide — decyzje projektowe

Dokument powstaje w trakcie "grillowania" planu (skill grill-me). Każda pozycja to jedna zapadła decyzja wraz z uzasadnieniem.

- **Q0 Stack:** Frontend React + Vite + **TypeScript**, backend Python + FastAPI, baza SQLite (przez SQLModel/SQLAlchemy). — TS łapie błędy integracji z API i wygląda lepiej na rekrutacji; narzut mały przy tej skali.
- **Q1 Czas / zakres:** Deadline koniec niedzieli (2026-11-15), ale cel to skończyć szybciej → budujemy wąskie MVP bez przerostu: 2 funkcje AI, minimalny solidny UI. — Krótszy czas = mniejszy zakres i mniej ryzyka.
- **Q2 Provider AI:** Gemini (`gemini-2.5-flash`, darmowy tier). Wywołania LLM odizolowane w `backend/app/ai.py` (provider-agnostic), z fallbackiem na zwykłe filtry gdy brak klucza / API nie odpowiada. Klucz w `.env`, do repo tylko `.env.example`. — Darmowy, wymusza poprawny JSON (`response_schema`), stabilny w demo; abstrakcja zostawia furtkę na inne modele (np. HuggingFace).
- **Q3 Źródło eventów:** Ticketmaster Discovery API jako główne źródło, importowane raz skryptem `import_events.py` do bazy SQLite (snapshot); aplikacja czyta z bazy, nie z live API. Fallback: mały seed, gdy brak klucza Ticketmaster. — Test na żywo: 574 eventy muzyczne w PL, realne nazwy/miasta/daty, 20/20 ze współrzędnymi. Import do bazy = niezależność od limitów i dostępności API w demo. Klucz Ticketmaster w `.env`.
- **Q4 Auth:** Uproszczony: rejestracja/logowanie e-mail + hasło (hash bcrypt), JWT w headerze Authorization. Bez resetu hasła, OAuth, weryfikacji e-maila. — Pokazuje poprawny auth (hashowanie, ochrona endpointów) bez przepalania czasu na OAuth/mailing.
- **Q5 Dane profilu (do dopasowania):** gatunki muzyczne (multi-select), styl jazdy (cicho/rozmownie/impreza), palenie (tak/nie), płeć (opcjonalnie). Dopasowanie łączy to z trasą i datą przejazdu. — Mały profil, a wystarcza na konkretne uzasadnienia dopasowania.
- **Q6 Model przejazdu i kierunek dopasowania:** Kierowca wystawia przejazd (event, data, miejsca, cena), pasażer szuka i dostaje ranking przejazdów wg dopasowania do kierowcy (% + uzasadnienie). Dołączenie = prośba, którą kierowca akceptuje/odrzuca; kierowca widzi to samo dopasowanie przy prośbie. — Obustronne dopasowanie z jednej funkcji liczącej; prosty, demonstrowalny flow.
- **Q8 Wyszukiwanie zdaniem:** AI parsuje swobodne zdanie do filtrów (event/artysta, miasto wyjazdu, data, maks. cena, liczba miejsc, preferencje), filtry lecą jako zapytanie do bazy. Pokazujemy podgląd interpretacji zdania. Fallback: zwykły formularz z filtrami gdy brak klucza / parsowanie padnie. — Przejrzyste, demonstrowalne, zawsze działa.
- **Q7 Liczenie dopasowania:** Procent liczy deterministyczny algorytm w kodzie; AI generuje tylko jednozdaniowe uzasadnienie dla kilku topowych wyników. Podobieństwo gatunków metodą grup/rodzin (ten sam gatunek = 1.0, ta sama rodzina np. elektronika/rock/miejskie = 0.5, inna = 0.0, wynik = średnia najlepszych dopasowań). Całość = ważona suma: ~60% muzyka + 25% styl jazdy + 15% palenie. — Powtarzalne i testowalne, realistyczne (techno↔house ≠ 0), szybkie/darmowe, ranking działa też bez klucza API (znika tylko opis).
- **Q9 Język:** UI, kod, komentarze i README po angielsku; dane (eventy z Ticketmaster) po polsku; `docs/decisions.md` po polsku (notatka robocza). — Nieznany język sprawdzającego; angielski = bezpieczny standard i uniwersalność.
- **Q11 Mapa:** Must-have. Leaflet + OpenStreetMap (bez klucza): pinezki eventów na widoku przeglądania + mapka lokalizacji na szczegółach eventu/przejazdu (venue + miasto wyjazdu). Rysowanie trasy linią (OSRM) opcjonalne na koniec. — Mocny wizualnie element dla aplikacji transportowej; dane mają współrzędne (20/20 w teście).
- **Q10 Uruchamianie:** Lokalnie, z jasnym README (osobno backend i frontend). CORS skonfigurowany od początku (`CORSMiddleware` w FastAPI, dozwolony origin frontendu z `.env`). Deploy poza zakresem MVP (wzmianka w README jako rozszerzenie). — Front (Vite :5173) i back (FastAPI :8000) to różne originy, więc CORS konieczny nawet lokalnie.
- **Q12 Bonus #3 (AI-generated ogłoszenia):** Stretch na koniec — kierowca wpisuje skrót, AI tworzy ładny opis ogłoszenia (reużywa `ai.py`). Robimy tylko jeśli rdzeń działa i zostanie czas. — Tani dodatek, ale nie-krytyczny; rdzeń ma priorytet.

---

## Podsumowanie zakresu MVP (rdzeń)

1. **Auth** — rejestracja/logowanie (e-mail + hasło bcrypt, JWT).
2. **Profil** — gatunki muzyczne, styl jazdy, palenie, płeć (opcjonalnie).
3. **Eventy** — import z Ticketmaster do SQLite + fallback seed; przeglądanie, mapa z pinezkami.
4. **Przejazdy** — kierowca wystawia (event, data, miejsca, cena); pasażer przegląda/szuka.
5. **Wyszukiwanie zdaniem (AI #1)** — zdanie → filtry + podgląd interpretacji + fallback formularz.
6. **Dopasowanie (AI #2)** — deterministyczny % (grupy gatunków + styl + palenie) + uzasadnienie od AI; widoczne dla pasażera i kierowcy.
7. **Dołączanie** — prośba o dołączenie, kierowca akceptuje/odrzuca.
8. **Mapa** — Leaflet/OSM, pinezki eventów + lokalizacja na szczegółach.

**Stretch (jeśli czas):** AI-generated ogłoszenia (#3), rysowanie trasy (OSRM), `docker-compose`.

**Przekrojowo:** provider AI w `ai.py` (Gemini) z fallbackiem bez klucza; sekrety w `.env` (klucze Gemini + Ticketmaster); UI/kod po angielsku; CORS od początku.

# FestRide: frontend

Aplikacja w React + Vite + TypeScript, która rozmawia z backendem FastAPI. Jak uruchomić cały projekt, opisuje [Szybki start w głównym README](../README.md#-szybki-start).

## Polecenia

| Polecenie | Co robi |
|---|---|
| `npm run dev` | serwer deweloperski na http://localhost:5173 |
| `npm run build` | sprawdzenie typów (`tsc -b`) i build do `dist/` |
| `npm run lint` | ESLint |
| `npx prettier --write "src/**/*.{css,ts,tsx}"` | formatowanie kodu |

## Adres API

Frontend czyta adres backendu ze zmiennej `VITE_API_URL`, wpisywanej w czasie builda:

- lokalnie nie trzeba jej ustawiać, domyślnie to `http://127.0.0.1:8000`,
- na produkcji (Railway) to `/api`, bo zbudowany frontend serwuje ten sam serwer co API.

## Struktura `src/`

| Plik / folder | Zawartość |
|---|---|
| `main.tsx`, `App.tsx` | start aplikacji, motyw jasny/ciemny, ścieżki stron |
| `pages/Landing.tsx` | strona główna dla gości: wyszukiwarka, line-up, płyta winylowa |
| `pages/Events.tsx` | lista wydarzeń z mapą |
| `pages/Search.tsx` | wyszukiwanie jednym zdaniem, filtry, mapa tras |
| `pages/RideDetail.tsx` | szczegóły przejazdu, wynik dopasowania, prośba o miejsce |
| `pages/Home.tsx` | Start po zalogowaniu: najbliższy przejazd, prośby, propozycje |
| `pages/MyRides.tsx` | wszystkie przejazdy pasażera |
| `pages/Drive.tsx` | panel kierowcy: miejsca w aucie i prośby pasażerów |
| `pages/OfferRide.tsx` | dodawanie przejazdu, także jednym zdaniem |
| `pages/Auth.tsx` | logowanie, rejestracja i edycja profilu |
| `components/` | nagłówek i stopka, mapa (Leaflet), wiersze list, komunikaty, drobne elementy UI |
| `api.ts` | typowany klient API i obsługa błędów |
| `auth.tsx` | zalogowany użytkownik dla całej aplikacji |
| `i18n.tsx` | teksty PL/EN, daty i odmiana liczebników |
| `hooks.ts` | pobieranie danych i dopasowanie podpowiedzi do szerokości pola |
| `geo.ts`, `poland.ts` | współrzędne miast, rodziny gatunków, kontur Polski na mapę |
| `styles.css` | kolory, czcionki i wspólne elementy, jasny i ciemny motyw |
| `app.css` | ekrany po zalogowaniu |
| `pages/landing.css` | strona główna |
| `motion.css` | animacje |

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "pl" | "en";

const pl = {
  "nav.myRides": "Moje przejazdy",
  "bell.label": "Powiadomienia",
  "bell.unread": "Powiadomienia, nowe: {n}",
  "bell.empty": "Na razie nic się nie wydarzyło.",
  "bell.request": "{name} prosi o miejsce: {event}",
  "bell.withdrew": "{name} rezygnuje z przejazdu: {event}",
  "bell.accepted": "{name} bierze cię do auta: {event}",
  "bell.declined": "{name} nie ma dla ciebie miejsca: {event}",
  "bell.removed": "{name} usuwa cię z przejazdu: {event}",
  "bell.called_off": "{name} odwołuje przejazd: {event}",
  "bell.now": "przed chwilą",
  "bell.min": "{n} min temu",
  "bell.h": "{n} godz. temu",
  "bell.d": "{n} dni temu",
  "home.nextLine": "{event} {when}. {driver} rusza z: {from} o {time}.",
  "home.trySentence": "Spróbuj napisać tak",
  "mine.title": "Moje przejazdy",
  "mine.going": "Jedziesz",
  "mine.waiting": "Czekasz na odpowiedź",
  "mine.past": "Minione i odrzucone",
  "mine.none": "Nie prosiłeś jeszcze o miejsce w żadnym aucie.",
  "search.again": "Szukaj ponownie",
  "search.addFilter": "+ dodaj filtr",
  "ride.carsTo": "{cars} na {event}",
  "ride.drives": "styl jazdy: {style}",
  "ride.carStyle.quiet": "cichy przejazd",
  "ride.carStyle.chatty": "pogaduchy w trasie",
  "ride.carStyle.party": "impreza w aucie",
  "ride.lineFor": "Kilka słów dla: {name}",
  "ride.askName": "Poproś o miejsce: {name}",
  "ride.askedOthers":
    "Na to wydarzenie prosisz też inne auta ({n}). Pierwsze „tak” wygrywa, a reszta próśb zamknie się sama.",
  "drive.seatsTaken": "{taken}/{total} miejsc",
  "drive.fresh": "nowe: {n}",
  "drive.perSeat": "{n} zł za miejsce",
  "drive.title": "{from} → {event}",
  "nav.menu": "Menu",
  "nav.home": "Start",
  "nav.find": "Znajdź przejazd",
  "nav.findShort": "Szukaj",
  "nav.myRidesShort": "Moje",
  "nav.events": "Wydarzenia",
  "nav.drive": "Kierowca",
  "nav.login": "Zaloguj się",
  "nav.signup": "Załóż konto",
  "nav.logout": "Wyloguj się",
  "nav.signedIn": "Zalogowano jako",
  "lang.label": "Język",
  "theme.label": "Motyw",
  "theme.light": "Jasny motyw",
  "theme.dark": "Ciemny motyw",
  "theme.toLight": "Włącz jasny motyw",
  "theme.toDark": "Włącz ciemny motyw",
  "menu.open": "Menu konta",

  "landing.ask": "Opisz swoją trasę",
  "landing.example": "z Łodzi na techno do Krakowa w grudniu, max 50 zł",
  "landing.exampleShort":
    "z Łodzi na techno do Krakowa w grudniu|z Łodzi na techno do Krakowa|z Łodzi na techno",

  "landing.allEvents": "Wszystkie wydarzenia na mapie",

  "landing.music": "muzyka",
  "landing.style": "styl jazdy",
  "landing.smoking": "palenie",

  "footer.title": "Do zobaczenia pod bramą.",
  "footer.note":
    "FestRide · dane wydarzeń z Ticketmaster · mapa © OpenStreetMap",

  "events.title": "Nadchodzące koncerty",
  "events.all": "Wszystkie daty",
  "events.search": "Szukaj wydarzenia lub miejsca",
  "events.showRides": "Pokaż przejazdy",
  "events.empty": "Brak wydarzeń dla tych filtrów",
  "events.more": "Pokaż więcej",

  "search.cta": "Szukaj",
  "search.ai": "odczytane przez AI",
  "search.aiHint": "AI zamienia twoje zdanie na filtry wyszukiwania",
  "search.rules": "uproszczona interpretacja",
  "search.rulesNote":
    "AI jest teraz niedostępne, więc zdanie odczytaliśmy prościej. Sprawdź filtry poniżej.",
  "search.notUnderstood":
    "Nie udało się odczytać zdania. Ustaw filtry ręcznie.",
  "search.edit": "Edytuj filtry",
  "search.hideEdit": "Ukryj filtry",
  "search.apply": "Zastosuj",
  "search.clear": "Wyczyść",
  "search.remove": "Usuń filtr",
  "search.sortedMatch": "Od najlepszego dopasowania",
  "search.sortedTime": "Od najbliższego wyjazdu",
  "search.loginForMatch":
    "Zaloguj się, żeby zobaczyć dopasowanie do kierowców.",
  "search.empty": "Brak przejazdów dla tych filtrów",
  "search.emptyHint": "Usuń któryś filtr albo zaproponuj własny przejazd.",

  "f.from": "Skąd",
  "f.to": "Dokąd",
  "f.q": "Wydarzenie",
  "f.genre": "Gatunek",
  "f.dateFrom": "Od dnia",
  "f.dateTo": "Do dnia",
  "f.price": "Max cena",
  "f.seats": "Miejsca",
  "f.smoke": "Bez palenia",
  "f.free": "Za darmo",
  "f.maxPrice": "do {n} zł",

  "match.great": "świetne dopasowanie",
  "match.good": "dobre dopasowanie",
  "match.some": "coś was łączy",
  "match.diff": "różne klimaty",
  "style.quiet": "cicho",
  "style.chatty": "rozmownie",
  "style.party": "impreza",
  "styleT.quiet": "Cicho",
  "styleT.chatty": "Rozmownie",
  "styleT.party": "Impreza",
  "styleD.quiet": "Słuchawki na uszach, mało gadania.",
  "styleD.chatty": "Chętnie pogadam całą drogę.",
  "styleD.party": "Głośna muzyka i śpiewanie.",
  "smoke.bothNo": "oboje nie palicie",
  "smoke.bothYes": "oboje palicie",
  "smoke.youOnly": "ty palisz, {name} nie",
  "smoke.driverOnly": "{name} pali, ty nie",
  "ride.smokingOk": "można palić",
  "ride.noSmoking": "bez palenia",
  "ride.with": "{name} za kierownicą",
  "ride.why": "Skąd {n}%",
  "ride.route": "Trasa",
  "ride.perSeat": "za miejsce, dzielimy paliwo",
  "ride.seatsAria": "zajęte miejsca: {taken} z {total}",
  "ride.taken": "zajęte",
  "ride.you": "ty?",
  "ride.yourSeat": "zajęte (ty)",
  "ride.free": "wolne",
  "ride.messagePh": "Np. mam mały plecak, chętnie podzielę się playlistą.",
  "ride.loginToAsk": "Zaloguj się, żeby poprosić o miejsce",
  "ride.own": "To twój przejazd",
  "ride.manage": "Zarządzaj przejazdem",
  "ride.status.pending": "prośba wysłana",
  "ride.status.accepted": "jedziesz!",
  "ride.status.declined": "odrzucono",
  "ride.status.cancelled": "wycofane",
  "ride.status.removed": "usunięto cię z auta",
  "ride.status.called_off": "przejazd odwołany",
  "ride.calledOffNote":
    "Kierowca odwołał ten przejazd. Poszukaj innego auta na ten koncert.",
  "err.calledOff": "Kierowca odwołał ten przejazd.",
  "drive.callOff": "Odwołaj przejazd",
  "drive.callOffSure": "Odwołać ten przejazd?",
  "drive.callOffSureWith":
    "Odwołać? Osoby, które prosiły o miejsce, zobaczą, że przejazd jest odwołany.",
  "drive.callOffYes": "Tak, odwołaj",
  "drive.callOffNo": "Nie",
  "ride.withdraw": "Wycofaj prośbę",
  "ride.giveUp": "Rezygnuję z miejsca",
  "ride.withdrawSure": "Wycofać prośbę?",
  "ride.giveUpSure": "Na pewno zwolnić miejsce?",
  "ride.sureYes": "Tak",
  "ride.sureNo": "Nie",
  "ride.removedNote":
    "Kierowca usunął cię z tego przejazdu. Poszukaj innego auta na ten koncert.",
  "ride.multi":
    "Możesz poprosić kilka aut na ten sam event. Pierwsze „tak” wygrywa, reszta próśb zamknie się sama.",
  "ride.full": "Brak wolnych miejsc",
  "ride.left": "Ten przejazd już wyjechał",
  "ride.back": "Wróć do wyników",
  "ride.notFound": "Nie ma takiego przejazdu.",
  "ride.sent": "Prośba wysłana. Damy znać, gdy kierowca odpowie.",

  "home.morning": "Dzień dobry, {name}.",
  "home.afternoon": "Cześć, {name}.",
  "home.evening": "Dobry wieczór, {name}.",
  "home.noRide": "Nie masz jeszcze zaplanowanego przejazdu.",
  "home.noRideCta": "Znajdź auto na koncert albo sam zaproponuj przejazd.",
  "home.next": "Twój najbliższy przejazd",
  "home.details": "Szczegóły przejazdu",
  "home.waiting": "Czekasz na „tak”: {event}",
  "home.askedN": "poproszono aut: {n}",
  "home.firstYes":
    "Pierwszy kierowca, który się zgodzi, zabiera cię. Pozostałe prośby zamkną się same.",
  "home.feed": "Propozycje dla ciebie",
  "home.feedRides": "Auta, które do ciebie pasują",
  "home.trySentenceGenre": "na {genre}, max 60 zł",
  "home.forSound": "Dla twojego brzmienia",
  "home.findRide": "Znajdź przejazd",
  "home.offer": "Zaproponuj przejazd",

  "drive.yours": "Przejazdy, które oferujesz",
  "drive.new": "+ Zaproponuj przejazd",
  "drive.none": "Nie oferujesz jeszcze żadnego przejazdu.",
  "drive.fill": "pełne auto: {n} zł na paliwo",
  "drive.seatN": "miejsce {n}",
  "drive.seatFree": "miejsce {n} wolne",
  "drive.want": "{n} {verb} jechać",
  "drive.wantOne": "chce",
  "drive.wantFew": "chcą",
  "drive.noRequests": "Na razie nikt nie poprosił o miejsce.",
  "drive.take": "Zabierz: {name}",
  "drive.notNow": "Nie tym razem",
  "drive.done": "zakończony",
  "drive.full": "Auto jest pełne",
  "drive.decided": "Podjęte decyzje",
  "drive.withdrew": "Zrezygnowali",
  "drive.removed": "Usunięci z auta",
  "drive.remove": "Usuń z przejazdu: {name}",
  "drive.removeSure": "usunąć: {name}?",
  "drive.yes": "tak",
  "drive.no": "nie",

  "offer.title": "Zaproponuj przejazd",
  "offer.event": "Na jakie wydarzenie?",
  "offer.eventPh": "Wpisz nazwę, miasto albo miejsce",
  "offer.change": "Zmień",
  "offer.origin": "Skąd wyjeżdżasz?",
  "offer.originPh": "np. Łódź",
  "offer.aiLabel": "Opisz przejazd jednym zdaniem",
  "offer.aiPh":
    "np. jadę z Łodzi na Föllakzoid 4 grudnia o 10, 3 miejsca po 35 zł, bez palenia",
  "offer.aiFill": "Wypełnij",
  "offer.aiBusy": "Czytam…",
  "offer.ai.ai":
    "Wypełniliśmy formularz ze zdania. Sprawdź i popraw, jeśli trzeba.",
  "offer.ai.rules":
    "AI jest teraz niedostępne, więc zdanie odczytaliśmy prościej. Sprawdź pola poniżej.",
  "offer.ai.none":
    "Nie udało się nic odczytać. Spróbuj podać wydarzenie, miasto i godzinę.",
  "offer.ai.error": "Coś poszło nie tak. Wypełnij formularz ręcznie.",
  "offer.writeForMe": "Napisz za mnie",
  "offer.writing": "Piszę…",
  "offer.noteByAi": "napisane przez AI, możesz poprawić",
  "offer.noteByTemplate": "AI niedostępne, wstawiliśmy prosty opis",
  "offer.when": "Wyjazd",
  "offer.seats": "Wolne miejsca",
  "offer.price": "Cena za miejsce (zł)",
  "offer.smoking": "W aucie można palić",
  "offer.note": "Kilka słów dla pasażerów (opcjonalnie)",
  "offer.notePh": "Np. ruszam spod dworca, wracam po koncercie.",
  "offer.submit": "Opublikuj przejazd",
  "offer.needEvent": "Wybierz wydarzenie z listy.",

  "auth.loginTitle": "Witaj z powrotem.",
  "auth.email": "E-mail",
  "auth.password": "Hasło",
  "auth.login": "Zaloguj się",
  "auth.noAccount": "Nie masz konta?",
  "auth.haveAccount": "Masz już konto?",
  "auth.badLogin": "Nieprawidłowy e-mail lub hasło.",
  "auth.demo": "Konto demo: demo@example.com / festride-demo",
  "su.step": "Krok {n} z 2",
  "su.h1a": "Załóż konto",
  "su.name": "Jak masz na imię?",
  "su.next": "Dalej",
  "su.later": "Konto powstanie po następnym kroku.",
  "su.pwHint": "Minimum 8 znaków.",
  "su.h1b": "Jaki masz klimat w trasie?",
  "su.subB": "Na tej podstawie dopasujemy cię do kierowców i pasażerów.",
  "su.listen": "Czego słuchasz?",
  "su.selected": "wybrano: {n} · minimum 1",
  "su.other": "Inny gatunek",
  "su.add": "Dodaj",
  "su.style": "Styl jazdy",
  "su.smoking": "Palenie",
  "su.noSmoke": "Nie palę",
  "su.smoke": "Palę",
  "su.gender": "Płeć",
  "su.optional": "(opcjonalnie)",
  "su.gNone": "Wolę nie mówić",
  "su.gF": "Kobieta",
  "su.gM": "Mężczyzna",
  "su.gX": "Osoba niebinarna",
  "su.back": "Wstecz",
  "su.create": "Załóż konto",
  "su.taken": "Ten e-mail jest już zarejestrowany.",
  "su.invalid": "Sprawdź pola formularza.",

  "common.loading": "Ładowanie…",
  "common.error": "Coś poszło nie tak. Spróbuj ponownie.",
  "common.offline": "Brak połączenia z serwerem FestRide.",
  "common.retry": "Spróbuj ponownie",
  "err.full": "W tym aucie nie ma już wolnych miejsc.",
  "err.duplicate": "Już poprosiłeś o miejsce w tym aucie.",
  "err.alreadyGoing": "Masz już potwierdzony przejazd na to wydarzenie.",
  "err.time": "Sprawdź datę i godzinę wyjazdu.",
  "err.own": "To twój własny przejazd.",
  "err.twoRides": "Masz już przejazd na to wydarzenie.",
  "offer.haveOne":
    "Masz już przejazd na to wydarzenie. Jedno auto na wydarzenie wystarczy.",
  "offer.manageIt": "Zobacz swój przejazd",
  "err.decided": "Ta prośba ma już odpowiedź.",
  "nav.main": "Główna nawigacja",
  "nav.footer": "Stopka",
  "su.stepsAria": "Postęp rejestracji",
  "nav.profile": "Edytuj profil",
  "pf.eyebrow": "Twój profil",
  "pf.title": "Edytuj profil",
  "pf.sub":
    "Od tych odpowiedzi zależy, jak dopasujemy cię do kierowców i pasażerów.",
  "pf.name": "Imię",
  "pf.emailNote": "E-mail: {email} (nie można go zmienić)",
  "pf.save": "Zapisz zmiany",
  "pf.saved": "Profil zapisany",
  "pf.cancel": "Anuluj",
};

type Dict = typeof pl;
export type Key = keyof Dict;

const en: Dict = {
  "nav.myRides": "My rides",
  "bell.label": "Notifications",
  "bell.unread": "Notifications, {n} new",
  "bell.empty": "Nothing has happened yet.",
  "bell.request": "{name} asks for a seat: {event}",
  "bell.withdrew": "{name} withdrew from your ride: {event}",
  "bell.accepted": "{name} has a seat for you: {event}",
  "bell.declined": "{name} has no seat for you: {event}",
  "bell.removed": "{name} took you off the ride: {event}",
  "bell.called_off": "{name} called off the ride: {event}",
  "bell.now": "just now",
  "bell.min": "{n} min ago",
  "bell.h": "{n} h ago",
  "bell.d": "{n} d ago",
  "home.nextLine": "{event} is {when}. {driver} leaves {from} at {time}.",
  "home.trySentence": "Try typing this",
  "mine.title": "My rides",
  "mine.going": "You're going",
  "mine.waiting": "Waiting for a yes",
  "mine.past": "Past and declined",
  "mine.none": "You haven't asked any car for a seat yet.",
  "search.again": "Search again",
  "search.addFilter": "+ add filter",
  "ride.carsTo": "{cars} to {event}",
  "ride.drives": "drives {style}",
  "ride.carStyle.quiet": "quiet car",
  "ride.carStyle.chatty": "chatty car",
  "ride.carStyle.party": "party car",
  "ride.lineFor": "A line for {name}",
  "ride.askName": "Ask {name} for a seat",
  "ride.askedOthers":
    "You've asked {n} other cars for this event. The first yes wins and the others close on their own.",
  "drive.seatsTaken": "{taken}/{total} seats",
  "drive.fresh": "{n} new",
  "drive.perSeat": "{n} zł a seat",
  "drive.title": "{from} to {event}",
  "nav.menu": "Menu",
  "nav.home": "Home",
  "nav.find": "Find a ride",
  "nav.findShort": "Find",
  "nav.myRidesShort": "My rides",
  "nav.events": "Events",
  "nav.drive": "Drive",
  "nav.login": "Log in",
  "nav.signup": "Sign up",
  "nav.logout": "Log out",
  "nav.signedIn": "Signed in as",
  "lang.label": "Language",
  "theme.label": "Theme",
  "theme.light": "Light theme",
  "theme.dark": "Dark theme",
  "theme.toLight": "Switch to light theme",
  "theme.toDark": "Switch to dark theme",
  "menu.open": "Account menu",

  "landing.ask": "Describe your trip",
  "landing.example": "from Łódź to techno in Kraków in December, max 50 zł",
  "landing.exampleShort":
    "from Łódź to techno in Kraków in December|from Łódź to techno in Kraków|techno in Kraków",

  "landing.allEvents": "All events on the map",

  "landing.music": "music",
  "landing.style": "ride style",
  "landing.smoking": "smoking",

  "footer.title": "See you at the gate.",
  "footer.note":
    "FestRide · event data from Ticketmaster · map © OpenStreetMap",

  "events.title": "Upcoming shows",
  "events.all": "All dates",
  "events.search": "Search an event or venue",
  "events.showRides": "Show rides",
  "events.empty": "No events for these filters",
  "events.more": "Show more",

  "search.cta": "Search",
  "search.ai": "read by AI",
  "search.aiHint": "AI turns your sentence into search filters",
  "search.rules": "simplified reading",
  "search.rulesNote":
    "AI is unavailable right now, so we used a simpler reading of your sentence. Check the filters below.",
  "search.notUnderstood":
    "We couldn't read that sentence. Set the filters by hand.",
  "search.edit": "Edit filters",
  "search.hideEdit": "Hide filters",
  "search.apply": "Apply",
  "search.clear": "Clear",
  "search.remove": "Remove filter",
  "search.sortedMatch": "Best match first",
  "search.sortedTime": "Soonest departure first",
  "search.loginForMatch": "Log in to see how well you match each driver.",
  "search.empty": "No rides for these filters",
  "search.emptyHint": "Remove a filter, or offer a ride yourself.",

  "f.from": "From",
  "f.to": "To",
  "f.q": "Event",
  "f.genre": "Genre",
  "f.dateFrom": "From day",
  "f.dateTo": "To day",
  "f.price": "Max price",
  "f.seats": "Seats",
  "f.smoke": "No smoking",
  "f.free": "Free",
  "f.maxPrice": "up to {n} zł",

  "match.great": "great match",
  "match.good": "good match",
  "match.some": "something in common",
  "match.diff": "different vibes",
  "style.quiet": "quiet",
  "style.chatty": "chatty",
  "style.party": "party",
  "styleT.quiet": "Quiet",
  "styleT.chatty": "Chatty",
  "styleT.party": "Party",
  "styleD.quiet": "Headphones on, little talk.",
  "styleD.chatty": "Happy to talk the whole way.",
  "styleD.party": "Music loud, singing along.",
  "smoke.bothNo": "neither of you smokes",
  "smoke.bothYes": "you both smoke",
  "smoke.youOnly": "you smoke, {name} doesn't",
  "smoke.driverOnly": "{name} smokes, you don't",
  "ride.smokingOk": "smoking allowed",
  "ride.noSmoking": "no smoking",
  "ride.with": "Ride with {name}",
  "ride.why": "Why {n}%",
  "ride.route": "The route",
  "ride.perSeat": "per seat, fuel split",
  "ride.seatsAria": "{taken} of {total} seats taken",
  "ride.taken": "taken",
  "ride.you": "you?",
  "ride.yourSeat": "taken (you)",
  "ride.free": "free",
  "ride.messagePh": "E.g. one small backpack, happy to share the playlist.",
  "ride.loginToAsk": "Log in to ask for a seat",
  "ride.own": "This is your ride",
  "ride.manage": "Manage this ride",
  "ride.status.pending": "request sent",
  "ride.status.accepted": "you're in!",
  "ride.status.declined": "declined",
  "ride.status.cancelled": "withdrawn",
  "ride.status.removed": "removed by the driver",
  "ride.status.called_off": "ride called off",
  "ride.calledOffNote":
    "The driver called off this ride. Look for another car to this show.",
  "err.calledOff": "The driver called off this ride.",
  "drive.callOff": "Call off this ride",
  "drive.callOffSure": "Call off this ride?",
  "drive.callOffSureWith":
    "Call it off? Everyone who asked for a seat will see it's off.",
  "drive.callOffYes": "Yes, call it off",
  "drive.callOffNo": "No",
  "ride.withdraw": "Withdraw request",
  "ride.giveUp": "Give up my seat",
  "ride.withdrawSure": "Withdraw the request?",
  "ride.giveUpSure": "Free up your seat?",
  "ride.sureYes": "Yes",
  "ride.sureNo": "No",
  "ride.removedNote":
    "The driver took you off this ride. Look for another car to this show.",
  "ride.multi":
    "You can ask a few cars for the same event. The first yes wins and the others close on their own.",
  "ride.full": "No seats left",
  "ride.left": "This ride has already left",
  "ride.back": "Back to results",
  "ride.notFound": "This ride doesn't exist.",
  "ride.sent": "Request sent. We'll let you know when the driver answers.",

  "home.morning": "Morning, {name}.",
  "home.afternoon": "Hi, {name}.",
  "home.evening": "Evening, {name}.",
  "home.noRide": "No ride planned yet.",
  "home.noRideCta": "Find a car to a show, or offer a ride yourself.",
  "home.next": "Your next ride",
  "home.details": "Ride details",
  "home.waiting": "Waiting for a yes: {event}",
  "home.askedN": "asked {n} cars",
  "home.firstYes":
    "The first driver who says yes gets you. The other requests close on their own.",
  "home.feed": "Picked for you",
  "home.feedRides": "Cars that match you",
  "home.trySentenceGenre": "{genre}, max 60 zł",
  "home.forSound": "For your sound",
  "home.findRide": "Find a ride",
  "home.offer": "Offer a ride",

  "drive.yours": "Rides you offer",
  "drive.new": "+ Offer a new ride",
  "drive.none": "You're not offering any rides yet.",
  "drive.fill": "fill it: {n} zł for fuel",
  "drive.seatN": "seat {n}",
  "drive.seatFree": "seat {n} free",
  "drive.want": "{n} {verb} in",
  "drive.wantOne": "wants",
  "drive.wantFew": "want",
  "drive.noRequests": "Nobody has asked for a seat yet.",
  "drive.take": "Take {name}",
  "drive.notNow": "Not this time",
  "drive.done": "done",
  "drive.full": "Your car is full",
  "drive.decided": "Decided",
  "drive.withdrew": "Withdrew",
  "drive.removed": "Removed",
  "drive.remove": "Remove {name} from the ride",
  "drive.removeSure": "remove {name}?",
  "drive.yes": "yes",
  "drive.no": "no",

  "offer.title": "Offer a ride",
  "offer.event": "Which event?",
  "offer.eventPh": "Type a name, city or venue",
  "offer.change": "Change",
  "offer.origin": "Leaving from",
  "offer.originPh": "e.g. Łódź",
  "offer.aiLabel": "Describe the ride in one sentence",
  "offer.aiPh":
    "e.g. driving from Łódź to Föllakzoid on 4 December at 10, 3 seats at 35 zł, no smoking",
  "offer.aiFill": "Fill in",
  "offer.aiBusy": "Reading…",
  "offer.ai.ai":
    "We filled in the form from your sentence. Check it and fix anything that's off.",
  "offer.ai.rules":
    "AI is unavailable right now, so we read the sentence more simply. Check the fields below.",
  "offer.ai.none":
    "Couldn't read anything. Try naming the event, the city and the time.",
  "offer.ai.error": "Something went wrong. Please fill in the form yourself.",
  "offer.writeForMe": "Write it for me",
  "offer.writing": "Writing…",
  "offer.noteByAi": "written by AI, edit as you like",
  "offer.noteByTemplate": "AI unavailable, here's a simple note",
  "offer.when": "Departure",
  "offer.seats": "Free seats",
  "offer.price": "Price per seat (zł)",
  "offer.smoking": "Smoking allowed in the car",
  "offer.note": "A few words for passengers (optional)",
  "offer.notePh": "E.g. leaving from the station, driving back after the show.",
  "offer.submit": "Publish ride",
  "offer.needEvent": "Pick an event from the list.",

  "auth.loginTitle": "Welcome back.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.login": "Log in",
  "auth.noAccount": "No account yet?",
  "auth.haveAccount": "Already have an account?",
  "auth.badLogin": "Wrong email or password.",
  "auth.demo": "Demo account: demo@example.com / festride-demo",
  "su.step": "Step {n} of 2",
  "su.h1a": "Create your account",
  "su.name": "What's your name?",
  "su.next": "Continue",
  "su.later": "Your account is created after the next step.",
  "su.pwHint": "At least 8 characters.",
  "su.h1b": "What's your vibe on the road?",
  "su.subB": "We use this to match you with drivers and passengers.",
  "su.listen": "What do you listen to?",
  "su.selected": "{n} selected · pick at least 1",
  "su.other": "Another genre",
  "su.add": "Add",
  "su.style": "Ride style",
  "su.smoking": "Smoking",
  "su.noSmoke": "I don't smoke",
  "su.smoke": "I smoke",
  "su.gender": "Gender",
  "su.optional": "(optional)",
  "su.gNone": "Prefer not to say",
  "su.gF": "Woman",
  "su.gM": "Man",
  "su.gX": "Non-binary",
  "su.back": "Back",
  "su.create": "Create account",
  "su.taken": "This email is already registered.",
  "su.invalid": "Check the form fields.",

  "common.loading": "Loading…",
  "common.error": "Something went wrong. Try again.",
  "common.offline": "Can't reach the FestRide server.",
  "common.retry": "Try again",
  "err.full": "This car has no free seats left.",
  "err.duplicate": "You already asked this car for a seat.",
  "err.alreadyGoing": "You already have a confirmed ride to this event.",
  "err.time": "Check the departure date and time.",
  "err.own": "This is your own ride.",
  "err.twoRides": "You already offer a ride to this event.",
  "offer.haveOne":
    "You already offer a ride to this event. One car per event is enough.",
  "offer.manageIt": "See your ride",
  "err.decided": "This request has already been answered.",
  "nav.main": "Main navigation",
  "nav.footer": "Footer",
  "su.stepsAria": "Sign-up progress",
  "nav.profile": "Edit profile",
  "pf.eyebrow": "Your profile",
  "pf.title": "Edit profile",
  "pf.sub":
    "These answers decide how we match you with drivers and passengers.",
  "pf.name": "Name",
  "pf.emailNote": "Email: {email} (can't be changed)",
  "pf.save": "Save changes",
  "pf.saved": "Profile saved",
  "pf.cancel": "Cancel",
};
const DICTS: Record<Lang, Dict> = { pl, en };

const NOUNS = {
  ride: {
    pl: {
      one: "przejazd",
      few: "przejazdy",
      many: "przejazdów",
      other: "przejazdu",
    },
    en: { one: "ride", other: "rides" },
  },
  car: {
    pl: { one: "auto", few: "auta", many: "aut", other: "auta" },
    en: { one: "car", other: "cars" },
  },
  seatLeft: {
    pl: {
      one: "wolne miejsce",
      few: "wolne miejsca",
      many: "wolnych miejsc",
      other: "wolnego miejsca",
    },
    en: { one: "seat left", other: "seats left" },
  },
  event: {
    pl: {
      one: "wydarzenie",
      few: "wydarzenia",
      many: "wydarzeń",
      other: "wydarzenia",
    },
    en: { one: "event", other: "events" },
  },
  person: {
    pl: { one: "osoba", few: "osoby", many: "osób", other: "osoby" },
    en: { one: "person", other: "people" },
  },
  request: {
    pl: { one: "prośba", few: "prośby", many: "próśb", other: "prośby" },
    en: { one: "request", other: "requests" },
  },
} as const;
export type Noun = keyof typeof NOUNS;

interface I18n {
  lang: Lang;
  setLang: (language: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  plural: (count: number, noun: Noun) => string;
  day: (iso: string) => string;
  dayLong: (iso: string) => string;
  dayTime: (iso: string) => string;
  time: (iso: string) => string;
  month: (iso: string) => string;
  relDay: (iso: string) => string;
}

const Ctx = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("festride-lang");
    if (saved === "pl" || saved === "en") return saved;
  } catch {
    /* storage blocked */
  }
  return navigator.language?.toLowerCase().startsWith("pl") ? "pl" : "en";
}

export function parseLocal(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((language: Lang) => {
    setLangState(language);
    try {
      localStorage.setItem("festride-lang", language);
    } catch {
      /* storage blocked */
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const loc = lang === "pl" ? "pl-PL" : "en-GB";
    const dict = DICTS[lang];
    const dateFormat = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(loc, options);
    const fDay = dateFormat({
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const fDayLong = dateFormat({
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const fTime = dateFormat({ hour: "2-digit", minute: "2-digit" });
    const fMonth = dateFormat({ month: "long", year: "numeric" });
    const relativeFormat = new Intl.RelativeTimeFormat(loc, {
      numeric: "auto",
    });
    const rules = new Intl.PluralRules(lang);
    return {
      lang,
      setLang,
      t: (key, vars) => {
        let text: string = dict[key] ?? en[key] ?? key;
        if (vars)
          for (const [name, replacement] of Object.entries(vars))
            text = text.replace(`{${name}}`, () => String(replacement));
        return text;
      },
      plural: (count, noun) => {
        const forms = NOUNS[noun][lang] as Record<string, string>;
        return `${count} ${forms[rules.select(count)] ?? forms.other}`;
      },
      day: (iso) => fDay.format(parseLocal(iso)),
      dayLong: (iso) => fDayLong.format(parseLocal(iso)),
      time: (iso) => fTime.format(parseLocal(iso)),
      dayTime: (iso) =>
        `${fDay.format(parseLocal(iso))} · ${fTime.format(parseLocal(iso))}`,
      month: (iso) => {
        const monthName = fMonth.format(parseLocal(iso));
        return monthName.charAt(0).toUpperCase() + monthName.slice(1);
      },
      relDay: (iso) => {
        const date = parseLocal(iso);
        const today = new Date();
        const days = Math.round(
          (new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
          ).getTime() -
            new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate(),
            ).getTime()) /
            86_400_000,
        );
        return relativeFormat.format(days, "day");
      },
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}

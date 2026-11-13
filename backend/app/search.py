import calendar
import re
from datetime import date, timedelta
from typing import Annotated, Optional
from pydantic import BaseModel, Field, StringConstraints, model_validator
from .cities import alias_pairs, fold, normalize_city

_Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class SearchFilters(BaseModel):
    q: Optional[_Short] = None
    event_city: Optional[_Short] = None
    origin_city: Optional[_Short] = None
    genre: Optional[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    max_price: Optional[float] = Field(default=None, ge=0, le=1000)
    min_seats: Optional[int] = Field(default=None, ge=1, le=8)
    no_smoking: bool = False

    @model_validator(mode="after")
    def _tidy(self):
        if self.q and (re.search(r"[;=<>{}\[\]\\|`$*]", self.q) or not re.search(r"[^\W\d_]", self.q)):
            self.q = None
        for name in ("event_city", "origin_city"):
            value = getattr(self, name)
            if value:
                setattr(self, name, normalize_city(value))
        if self.date_from and self.date_to and self.date_to < self.date_from:
            self.date_from, self.date_to = self.date_to, self.date_from
        return self


def _fmt_day(d: date) -> str:
    return f"{d.day} {calendar.month_abbr[d.month]} {d.year}"


def describe(f: SearchFilters) -> list[str]:
    chips = []
    if f.origin_city:
        chips.append(f"From {f.origin_city}")
    if f.event_city:
        chips.append(f"To {f.event_city}")
    if f.q:
        chips.append(f"Event: {f.q}")
    if f.genre:
        chips.append(f.genre)
    if f.date_from and f.date_to:
        chips.append(_fmt_day(f.date_from) if f.date_from == f.date_to else f"{_fmt_day(f.date_from)} – {_fmt_day(f.date_to)}")
    elif f.date_from:
        chips.append(f"From {_fmt_day(f.date_from)}")
    elif f.date_to:
        chips.append(f"Until {_fmt_day(f.date_to)}")
    if f.max_price is not None:
        chips.append("Free" if f.max_price == 0 else f"Max {f.max_price:g} PLN")
    if f.min_seats:
        chips.append(f"{f.min_seats}+ seats")
    if f.no_smoking:
        chips.append("No smoking")
    return chips


_FROM = {"z", "ze", "from"}

_TO = {"do", "w", "we", "to", "in"}

_GENRE_STEMS = [
    ("hip hop", "hip-hop"), ("hiphop", "hip-hop"), ("rap", "rap"), ("techno", "techno"),
    ("house", "house"), ("elektron", "electronic"), ("electro", "electronic"), ("rock", "rock"),
    ("metal", "metal"), ("punk", "punk"), ("indie", "indie"), ("alternat", "alternative"),
    ("jazz", "jazz"), ("blues", "blues"), ("klasycz", "classical"), ("classical", "classical"),
    ("disco", "disco"), ("reggae", "reggae"), ("folk", "folk"), ("pop", "pop"),
]

_MONTHS = [
    (1, ("stycz",), ("january", "jan")), (2, ("luty", "lutego", "lutym"), ("february", "feb")),
    (3, ("marzec", "marca", "marcu"), ("march", "mar")), (4, ("kwiecie", "kwietni"), ("april", "apr")),
    (5, ("maj", "maja", "maju"), ("may",)), (6, ("czerwiec", "czerwca", "czerwcu"), ("june", "jun")),
    (7, ("lipiec", "lipca", "lipcu"), ("july", "jul")), (8, ("sierp",), ("august", "aug")),
    (9, ("wrzes",), ("september", "sep", "sept")), (10, ("pazdziern",), ("october", "oct")),
    (11, ("listopad",), ("november", "nov")), (12, ("grudz", "grudni"), ("december", "dec")),
]

_EXACT_PL = {"maj", "maja", "maju", "luty", "lutego", "lutym", "marzec", "marca", "marcu"}

_NUMBER_WORDS = {"jedno": 1, "jeden": 1, "one": 1, "dwa": 2, "dwie": 2, "two": 2, "trzy": 3, "three": 3,
                 "cztery": 4, "four": 4}

def _stem(city: str) -> str:
    key = fold(city)
    return key[:-1] if key[-1] in "aeiouy" and len(key) > 4 else key


def _month_of(token: str) -> Optional[int]:
    for month, pl, en in _MONTHS:
        if token in en or any(token == s if s in _EXACT_PL else token.startswith(s) for s in pl):
            return month
    return None


def _next_occurrence(month: int, day: Optional[int], today: date) -> tuple[date, date]:
    year = today.year if (month, day or 31) >= (today.month, today.day) else today.year + 1
    if day:
        d = date(year, month, min(day, calendar.monthrange(year, month)[1]))
        return d, d
    last = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


_WEEKDAYS = [("poniedz", 0), ("monday", 0), ("wtor", 1), ("tuesday", 1), ("srod", 2), ("sroda", 2),
             ("wednesday", 2), ("czwart", 3), ("thursday", 3), ("piat", 4), ("friday", 4),
             ("sobot", 5), ("saturday", 5), ("niedziel", 6), ("sunday", 6)]


def _relative_dates(folded: str, today: date) -> Optional[tuple[date, date]]:
    if re.search(r"\b(jutro|tomorrow)\b", folded):
        d = today + timedelta(days=1)
        return d, d
    if re.search(r"\b(dzis|dzisiaj|today|tonight)\b", folded):
        return today, today
    if re.search(r"\bweekend", folded):
        sat = today + timedelta(days=(5 - today.weekday()) % 7)
        return sat, sat + timedelta(days=1)
    if re.search(r"\bza tydzien\b|\bin a week\b", folded):
        d = today + timedelta(days=7)
        return d, d
    for stem, weekday in _WEEKDAYS:
        if re.search(rf"\b{stem}", folded):
            d = today + timedelta(days=(weekday - today.weekday()) % 7 or 7)  # next one, not today
            return d, d
    return None


def _event_q(folded_text: str, event_names: list[str]) -> Optional[str]:
    best: Optional[str] = None
    for name in event_names:
        main = re.split(r"\s[|–-]\s|:\s|\s\|", name)[0].strip() or name
        for cand in {name.strip(), main, re.sub(r"\s+(19|20)\d\d$", "", main)}:
            f = fold(cand).strip()
            if (len(f) >= 6 or " " in f) and re.search(rf"(?<![a-z0-9]){re.escape(f)}(?![a-z0-9])", folded_text):
                if best is None or len(cand) > len(best):
                    best = cand
    return best


def parse_rules(text: str, today: date, cities: list[str], event_names: Optional[list[str]] = None) -> SearchFilters:
    folded = fold(text)
    tokens = re.findall(r"[a-z0-9']+", folded)
    found: dict = {}
    pairs = [(_stem(c), c) for c in cities] + alias_pairs()
    stems = sorted(pairs, key=lambda sc: -len(sc[0]))
    bare: list[str] = []
    for i, tok in enumerate(tokens):
        city = next((c for s, c in stems if len(s) >= 4 and tok.startswith(s)), None)
        if not city:
            continue
        prev = tokens[i - 1] if i else ""
        if prev in _FROM:
            found.setdefault("origin_city", city)
        elif prev in _TO:
            found.setdefault("event_city", city)
        elif city not in bare:
            bare.append(city)

    for slot, city in zip(["origin_city", "event_city"] if len(bare) > 1 else ["event_city"], bare):
        if slot not in found and city not in found.values():
            found[slot] = city

    for stem, genre in _GENRE_STEMS:
        if re.search(rf"\b{re.escape(stem)}", folded):
            found["genre"] = genre
            break

    price = re.search(r"\b(?:max|maks|maksymalnie|under|below|ponizej|up to)\s*(\d{1,4})", folded)
    price = price or re.search(r"(\d{1,4})\s*(?:zl|pln|zlotych)\b", folded)
    if price:
        found["max_price"] = min(float(price.group(1)), 1000)
    elif re.search(r"\b(za darmo|darmo|free|gratis)\b", folded):
        found["max_price"] = 0

    seats = re.search(r"(\d|" + "|".join(_NUMBER_WORDS) + r")\s*(?:wolne\s*)?(?:miejsc|osob|seat|people|person)", folded)
    if seats:
        n = seats.group(1)
        found["min_seats"] = min(int(n) if n.isdigit() else _NUMBER_WORDS[n], 8) or None

    if re.search(r"niepal|bez palenia|non.?smok|no smok|nie pal", folded):
        found["no_smoking"] = True

    for i, tok in enumerate(tokens):
        month = _month_of(tok) if len(tok) >= 3 and not tok.isdigit() else None
        if month:
            day = int(tokens[i - 1]) if i and tokens[i - 1].isdigit() and 1 <= int(tokens[i - 1]) <= 31 else None
            found["date_from"], found["date_to"] = _next_occurrence(month, day, today)
            break
    else:
        relative = _relative_dates(folded, today)
        if relative:
            found["date_from"], found["date_to"] = relative

    if event_names:
        q = _event_q(folded, event_names)
        if q:
            found["q"] = q
    return SearchFilters(**found)

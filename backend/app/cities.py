"""City-name normalisation.

Ticketmaster returns a mix of English/ASCII names ("Warsaw", "Krakow") and
Polish ones ("Łódź "). We store canonical Polish names so the UI, filters and
AI search all see one spelling per city.
"""

import unicodedata

# Keys are fold()ed names. Identity-looking entries ("warszawa") are intentional:
# they restore the canonical casing/diacritics for input like "WARSZAWA".
_ALIASES = {
    "warsaw": "Warszawa",
    "warszawa": "Warszawa",
    "krakow": "Kraków",
    "cracow": "Kraków",
    "poznan": "Poznań",
    "gdansk": "Gdańsk",
    "wroclaw": "Wrocław",
    "lodz": "Łódź",
    "bialystok": "Białystok",
    "rzeszow": "Rzeszów",
    "torun": "Toruń",
    "gdansk/sopot": "Gdańsk/Sopot",
}

def fold(text: str) -> str:
    """Lowercase and strip diacritics ("Łódź" -> "lodz", "Café" -> "cafe"),
    for case/diacritic-insensitive lookups and comparisons."""
    # ł/Ł have no Unicode decomposition, so NFKD alone would keep them.
    text = text.strip().replace("ł", "l").replace("Ł", "L")
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def normalize_city(name: str) -> str:
    """Return the canonical (Polish) spelling of a city name."""
    cleaned = " ".join(name.split())
    return _ALIASES.get(fold(cleaned), cleaned)


def alias_pairs() -> list[tuple[str, str]]:
    """(fold()ed alias, canonical name), e.g. ("warsaw", "Warszawa")."""
    return list(_ALIASES.items())


def genre_clause(session, column, genre: str):
    """WHERE clause for a genre filter on Event.genre: substring match, or any
    stored genre of the same family ("techno" -> "Dance/Electronic")."""
    from sqlalchemy import func, or_
    from sqlmodel import select

    from .matching import same_family  # local import: matching imports this module

    stored = [g for g in session.exec(select(column).distinct()).all() if g]
    return or_(
        func.fold(column).like(contains_pattern(genre), escape="\\"),
        column.in_(same_family(genre, stored)),
    )


def contains_pattern(text: str) -> str:
    """LIKE pattern for a case/diacritic-insensitive substring match against
    fold(column), used with escape="\\". User-typed % and _ match literally."""
    escaped = fold(text).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"

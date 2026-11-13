import unicodedata

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
    text = text.strip().replace("ł", "l").replace("Ł", "L")
    for apostrophe in "'’`":
        text = text.replace(apostrophe, "")
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).lower()


def normalize_city(name: str) -> str:
    cleaned = " ".join(name.split())
    return _ALIASES.get(fold(cleaned), cleaned)


def alias_pairs() -> list[tuple[str, str]]:
    return list(_ALIASES.items())


def genre_clause(session, column, genre: str):
    from sqlalchemy import func, or_
    from sqlmodel import select
    from .matching import same_family # local import: matching imports this module)

    stored = [genre for genre in session.exec(select(column).distinct()).all() if genre]
    return or_(
        func.fold(column).like(contains_pattern(genre), escape="\\"),
        column.in_(same_family(genre, stored)),
    )


def contains_pattern(text: str) -> str:
    escaped = fold(text).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"

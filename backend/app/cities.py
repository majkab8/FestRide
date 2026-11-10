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

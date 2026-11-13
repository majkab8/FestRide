import re
from dataclasses import dataclass
from .cities import fold
from .models import DrivingStyle

WEIGHT_MUSIC = 0.60
WEIGHT_STYLE = 0.25
WEIGHT_SMOKING = 0.15

SAME_GENRE = 1.0
SAME_FAMILY = 0.5
NEIGHBOUR_FAMILY = 0.25


_FAMILIES: dict[str, set[str]] = {
    "electronic": {
        "electronic", "dance/electronic", "dance", "edm", "techno", "house", "deep house",
        "tech house", "trance", "drum and bass", "dnb", "d and b", "dubstep", "ambient",
        "minimal", "electro", "hardstyle", "garage", "lo-fi", "elektronika",
        "muzyka elektroniczna",
    },
    "rock": {
        "rock", "alternative", "alternatywa", "indie", "indie rock", "punk", "punk rock",
        "hard rock", "grunge", "emo", "post-rock", "rock and roll", "psychedelic rock",
        "progressive rock", "metal", "heavy metal", "death metal", "black metal",
        "thrash metal", "progressive metal", "metalcore", "hardcore",
    },
    "urban": {
        "hip-hop", "hiphop", "rap", "hip-hop/rap", "trap", "drill", "r&b", "rnb", "soul",
        "funk", "neo soul", "polski rap",
    },
    "pop": {
        "pop", "dance pop", "indie pop", "k-pop", "kpop", "synthpop", "disco", "disco polo",
        "italo disco",
    },
    "jazz_blues": {"jazz", "blues", "swing", "smooth jazz", "gospel"},
    "classical": {
        "classical", "classical/vocal", "opera", "symphonic", "orchestral", "chamber",
        "klasyczna", "muzyka klasyczna", "opera/operetka",
    },
    "folk_world": {
        "folk", "world", "country", "reggae", "latin", "ska", "celtic", "folk rock",
        "muzyka ludowa", "szanty",
    },
}

def _norm(genre: str) -> str:
    text = fold(genre).replace("&", " and ")
    return " ".join(re.sub(r"[-/]", " ", text).split())


_FAMILY_OF: dict[str, str] = {_norm(g): fam for fam, genres in _FAMILIES.items() for g in genres}

_NEIGHBOURS = {frozenset({"pop", "electronic"}), frozenset({"pop", "urban"})}

_LABELS = [(85, "Great match"), (60, "Good match"), (30, "Something in common"), (0, "Different vibes")]

_STYLE_ORDER = [DrivingStyle.quiet, DrivingStyle.chatty, DrivingStyle.party]


@dataclass(frozen=True)
class Match:
    percent: int
    label: str
    music: float
    style: float
    smoking: float
    shared_genres: list[str]


def _unique(genres: list[str]) -> list[str]:
    return list(dict.fromkeys(_norm(g) for g in genres))


def genre_similarity(a: str, b: str) -> float:
    a, b = _norm(a), _norm(b)
    if a == b:
        return SAME_GENRE
    fam_a, fam_b = _FAMILY_OF.get(a), _FAMILY_OF.get(b)
    if fam_a is None or fam_b is None:
        return 0.0
    if fam_a == fam_b:
        return SAME_FAMILY
    if frozenset({fam_a, fam_b}) in _NEIGHBOURS:
        return NEIGHBOUR_FAMILY
    return 0.0


def _directional(src: list[str], dst: list[str]) -> float:
    return sum(max(genre_similarity(g, h) for h in dst) for g in src) / len(src)


def music_similarity(a: list[str], b: list[str]) -> float:
    a, b = _unique(a), _unique(b)
    if not a or not b:
        return 0.0
    return (_directional(a, b) + _directional(b, a)) / 2


def style_similarity(a: DrivingStyle, b: DrivingStyle) -> float:
    distance = abs(_STYLE_ORDER.index(DrivingStyle(a)) - _STYLE_ORDER.index(DrivingStyle(b)))
    return {0: 1.0, 1: 0.5}.get(distance, 0.0)


def smoking_similarity(a: bool, b: bool) -> float:
    return 1.0 if a == b else 0.0


def family_of(genre: str) -> str | None:
    return _FAMILY_OF.get(_norm(genre))


def same_family(genre: str, candidates: list[str]) -> list[str]:
    family = family_of(genre)
    return [c for c in candidates if family is not None and family_of(c) == family]


def label_for(percent: int) -> str:
    return next(label for threshold, label in _LABELS if percent >= threshold)


def match(a, b) -> Match:
    music = music_similarity(a.music_genres, b.music_genres)
    style = style_similarity(a.driving_style, b.driving_style)
    smoking = smoking_similarity(a.smoker, b.smoker)
    total = WEIGHT_MUSIC * music + WEIGHT_STYLE * style + WEIGHT_SMOKING * smoking

    b_keys = set(_unique(b.music_genres))
    shared = sorted({_norm(g): g for g in a.music_genres if _norm(g) in b_keys}.values())
    percent = round(total * 100)
    return Match(
        percent=percent,
        label=label_for(percent),
        music=round(music, 3),
        style=style,
        smoking=smoking,
        shared_genres=shared,
    )

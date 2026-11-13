from types import SimpleNamespace
import pytest
from app.matching import genre_similarity, label_for, match, music_similarity, style_similarity
from app.models import DrivingStyle


def person(genres, style=DrivingStyle.chatty, smoker=False):
    return SimpleNamespace(music_genres=genres, driving_style=style, smoker=smoker)


# --- genres -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ("techno", "techno", 1.0),
        ("Techno", " techno ", 1.0),  # case/whitespace-insensitive
        ("techno", "house", 0.5),  # same family
        ("techno", "Dance/Electronic", 0.5),  # user genre vs Ticketmaster genre
        ("rock", "metal", 0.5),
        ("rap", "Hip-Hop/Rap", 0.5),
        ("elektronika", "techno", 0.5),  # Polish name
        ("techno", "jazz", 0.0),
        ("pop", "house", 0.25),  # neighbouring families
        ("disco", "rap", 0.25),
        ("rock", "pop", 0.0),  # not neighbours
        ("shoegaze", "shoegaze", 1.0),  # unknown genre still matches itself
        ("shoegaze", "rock", 0.0),  # ...but has no family
    ],
)
def test_genre_similarity(a, b, expected):
    assert genre_similarity(a, b) == expected


def test_music_is_symmetric():
    a, b = ["techno", "rock", "jazz"], ["house"]
    assert music_similarity(a, b) == music_similarity(b, a)


def test_music_both_directions_count():
    # One-way, "techno" would fully match ["techno", ...]. Both ways, the
    # extra unrelated genres on the other side pull the score down.
    assert music_similarity(["techno"], ["techno"]) == 1.0
    assert music_similarity(["techno"], ["techno", "jazz", "classical"]) == pytest.approx((1 + 1 / 3) / 2)


@pytest.mark.parametrize(
    ("a", "b"),
    [("hip-hop", "hip hop"), ("r&b", "R & B"), ("Dance/Electronic", "dance / electronic"), ("drum & bass", "drum and bass")],
)
def test_separator_variants_are_the_same_genre(a, b):
    assert genre_similarity(a, b) == 1.0


def test_soul_is_with_rnb():
    assert genre_similarity("soul", "r&b") == 0.5


def test_duplicates_after_normalisation_count_once():
    assert music_similarity(["Électro", "electro", "rock"], ["electro"]) == music_similarity(["electro", "rock"], ["electro"])


def test_shared_genres_keep_user_spelling():
    assert match(person(["Hip-Hop"]), person(["hip hop"])).shared_genres == ["Hip-Hop"]


def test_music_empty_is_zero():
    assert music_similarity([], ["rock"]) == 0.0


# --- style / smoking ----------------------------------------------------------


def test_style_neighbours_are_half():
    q, c, p = DrivingStyle.quiet, DrivingStyle.chatty, DrivingStyle.party
    assert style_similarity(q, q) == 1.0
    assert style_similarity(q, c) == style_similarity(c, p) == 0.5
    assert style_similarity(q, p) == 0.0


# --- totals -------------------------------------------------------------------


def test_identical_profiles_are_100():
    a = person(["techno", "house"], DrivingStyle.party, smoker=True)
    assert match(a, a).percent == 100


def test_opposites_are_0():
    a = person(["techno"], DrivingStyle.quiet, smoker=False)
    b = person(["opera"], DrivingStyle.party, smoker=True)
    assert match(a, b).percent == 0


def test_weights():
    base = person(["techno"], DrivingStyle.quiet, smoker=False)
    only_music = person(["techno"], DrivingStyle.party, smoker=True)
    only_style = person(["jazz"], DrivingStyle.quiet, smoker=True)
    only_smoking = person(["jazz"], DrivingStyle.party, smoker=False)
    assert match(base, only_music).percent == 60
    assert match(base, only_style).percent == 25
    assert match(base, only_smoking).percent == 15


def test_match_is_symmetric_and_reports_shared_genres():
    a = person(["Techno", "rock"], DrivingStyle.chatty)
    b = person(["techno", "house"], DrivingStyle.party, smoker=True)
    ab, ba = match(a, b), match(b, a)
    # Scores are symmetric; shared_genres uses the first person's spelling.
    assert (ab.percent, ab.music, ab.style, ab.smoking) == (ba.percent, ba.music, ba.style, ba.smoking)
    assert ab.shared_genres == ["Techno"] and ba.shared_genres == ["techno"]


@pytest.mark.parametrize(
    ("percent", "label"),
    [(0, "Different vibes"), (29, "Different vibes"), (30, "Something in common"),
     (59, "Something in common"), (60, "Good match"), (84, "Good match"), (85, "Great match"), (100, "Great match")],
)
def test_labels(percent, label):
    assert label_for(percent) == label


def test_ranking_is_sensible():
    me = person(["techno"], DrivingStyle.chatty)
    same_genre = person(["techno"], DrivingStyle.chatty)
    same_family = person(["house"], DrivingStyle.chatty)
    other = person(["jazz"], DrivingStyle.chatty)
    scores = [match(me, d).percent for d in (same_genre, same_family, other)]
    assert scores == sorted(scores, reverse=True) and len(set(scores)) == 3

"""Rule-based sentence parser (the no-AI fallback for search) and the chips preview."""

from datetime import date

import pytest

from app.search import SearchFilters, describe, parse_rules

TODAY = date(2026, 11, 10)
CITIES = ["Warszawa", "Kraków", "Łódź", "Gdańsk", "Poznań", "Wrocław", "Katowice", "Lublin", "Gdynia"]


def parse(text):
    return parse_rules(text, TODAY, CITIES)


def test_typical_polish_sentence():
    f = parse("jadę z łodzi na techno do krakowa w grudniu, max 50 zł, 2 miejsca")
    assert f == SearchFilters(
        origin_city="Łódź", event_city="Kraków", genre="techno",
        date_from=date(2026, 12, 1), date_to=date(2026, 12, 31), max_price=50, min_seats=2,
    )


def test_event_name_and_no_smoking():
    f = parse("szukam przejazdu z warszawy na open'er, tylko niepalący")
    assert (f.origin_city, f.q, f.no_smoking) == ("Warszawa", "open'er", True)


def test_specific_day_and_adjective_genre():
    f = parse("z Poznania do Wrocławia na koncert rockowy 21 listopada")
    assert (f.origin_city, f.event_city, f.genre) == ("Poznań", "Wrocław", "rock")
    assert f.date_from == f.date_to == date(2026, 11, 21)
    assert f.q is None  # "koncert" is generic, not an event name


def test_english_with_aliases():
    f = parse("need a ride to Kamelot from Warsaw, under 30 zł")
    assert (f.origin_city, f.q, f.max_price) == ("Warszawa", "kamelot", 30)


@pytest.mark.parametrize(
    ("text", "origin", "dest"),
    [("Kraków -> Katowice", "Kraków", "Katowice"), ("cokolwiek do Lublina", None, "Lublin"), ("Gdynia", None, "Gdynia")],
)
def test_bare_cities(text, origin, dest):
    f = parse(text)
    assert (f.origin_city, f.event_city) == (origin, dest)


def test_past_month_means_next_year_and_free():
    f = parse("na festiwal w Gdyni w lipcu dla 3 osób za darmo")
    assert (f.date_from, f.date_to) == (date(2027, 7, 1), date(2027, 7, 31))
    assert (f.max_price, f.min_seats, f.event_city) == (0, 3, "Gdynia")


@pytest.mark.parametrize(
    ("text", "start", "end"),
    [("Kraków jutro", date(2026, 11, 11), date(2026, 11, 11)),
     ("coś fajnego w weekend", date(2026, 11, 14), date(2026, 11, 15)),  # 2026-11-10 is a Tuesday
     ("w piątek do Lublina", date(2026, 11, 13), date(2026, 11, 13)),
     ("we wtorek", date(2026, 11, 17), date(2026, 11, 17)),  # next Tuesday, not today
     ("za tydzień", date(2026, 11, 17), date(2026, 11, 17))],
)
def test_relative_dates(text, start, end):
    f = parse(text)
    assert (f.date_from, f.date_to) == (start, end)


def test_event_name_drops_trailing_date_words():
    assert parse("na Kamelot za tydzien do 40 zl").q == "kamelot"


@pytest.mark.parametrize("q", ["; DROP TABLE user;--", "99999", "<script>"])
def test_junk_event_names_are_dropped(q):
    assert SearchFilters(q=q).q is None


@pytest.mark.parametrize("text", ["z Markiem do Lublina", "Janusz jedzie do Lublina", "Lutosławski w Lublinie", "czerwony samochód do Lublina"])
def test_names_are_not_months(text):
    f = parse(text)
    assert (f.date_from, f.event_city) == (None, "Lublin")


def test_do_with_date_is_not_a_price():
    f = parse("do Krakowa do 30 listopada")
    assert (f.max_price, f.date_from, f.event_city) == (None, date(2026, 11, 30), "Kraków")
    assert parse("do 40 zł").max_price == 40


def test_nonsense_finds_nothing():
    f = parse("asdf qwerty")
    assert f == SearchFilters() and describe(f) == []


def test_describe_chips():
    f = SearchFilters(origin_city="lodz", event_city="Krakow", date_from=date(2026, 12, 1),
                      date_to=date(2026, 12, 31), max_price=0, min_seats=2, no_smoking=True)
    assert describe(f) == ["From Łódź", "To Kraków", "1 Dec 2026 – 31 Dec 2026", "Free", "2+ seats", "No smoking"]


def test_filters_swap_reversed_dates():
    f = SearchFilters(date_from=date(2026, 12, 31), date_to=date(2026, 12, 1))
    assert (f.date_from, f.date_to) == (date(2026, 12, 1), date(2026, 12, 31))

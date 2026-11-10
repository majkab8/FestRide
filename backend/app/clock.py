"""Polish local time, independent of the server's timezone.

Event dates (Ticketmaster `localDate`) and ride departure times are Polish
wall-clock values, stored naive. Comparing them against `datetime.now()` would
silently depend on where the server runs (e.g. a UTC host), so use these.
"""

from datetime import date, datetime

from zoneinfo import ZoneInfo

PL_TZ = ZoneInfo("Europe/Warsaw")  # needs the `tzdata` package on Windows


def now_pl() -> datetime:
    """Current Polish local time, naive (comparable with stored values)."""
    return datetime.now(PL_TZ).replace(tzinfo=None)


def today_pl() -> date:
    return now_pl().date()


def to_pl_naive(value: datetime) -> datetime:
    """Naive input is taken as Polish time; aware input is converted to it."""
    return value.astimezone(PL_TZ).replace(tzinfo=None) if value.tzinfo else value

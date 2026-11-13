from datetime import date, datetime
from zoneinfo import ZoneInfo

PL_TZ = ZoneInfo("Europe/Warsaw")


def now_pl() -> datetime:
    return datetime.now(PL_TZ).replace(tzinfo=None)


def today_pl() -> date:
    return now_pl().date()


def to_pl_naive(value: datetime) -> datetime:
    return value.astimezone(PL_TZ).replace(tzinfo=None) if value.tzinfo else value

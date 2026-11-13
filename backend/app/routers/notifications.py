from datetime import datetime
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.orm import aliased
from sqlmodel import Session, col, select
from ..database import get_session
from ..deps import get_current_user
from ..models import Event, Notification, NotificationKind, Ride, User

router = APIRouter(prefix="/notifications", tags=["notifications"])

_LIMIT = 30


def notify(session: Session, user_id: int, actor_id: int, ride_id: int, kind: NotificationKind) -> None:
    session.add(Notification(user_id=user_id, actor_id=actor_id, ride_id=ride_id, kind=kind))


class NotificationRead(BaseModel):
    id: int
    kind: NotificationKind
    read: bool
    created_at: datetime
    ride_id: int
    event_name: str
    actor_name: str


class NotificationList(BaseModel):
    unread: int
    items: list[NotificationRead]


@router.get("", response_model=NotificationList)
def my_notifications(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> NotificationList:
    actor = aliased(User)
    rows = session.exec(
        select(Notification, Event.name, actor.display_name)
        .join(Ride, Ride.id == Notification.ride_id)
        .join(Event, Event.id == Ride.event_id)
        .join(actor, actor.id == Notification.actor_id)
        .where(Notification.user_id == current_user.id)
        .order_by(col(Notification.created_at).desc(), col(Notification.id).desc())
        .limit(_LIMIT)
    ).all()
    unread = len(session.exec(
        select(Notification.id).where(Notification.user_id == current_user.id, Notification.read == False)
    ).all())
    return NotificationList(
        unread=unread,
        items=[
            NotificationRead(
                id=n.id, kind=n.kind, read=n.read, created_at=n.created_at,
                ride_id=n.ride_id, event_name=event_name, actor_name=actor_name,
            )
            for n, event_name, actor_name in rows
        ],
    )


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    session.exec(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.read == False)
        .values(read=True)
    )
    session.commit()

import hashlib
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, joinedload

from .auth import get_current_user, require_roles
from .database import get_db
from .models import ActivityLog, Invitation, Notification, Quiz, QuizAttempt, Task, TaskComment, User, utc_now
from .schemas import AdminInviteCreate, RoleUpdate, TaskCommentCreate, TaskCreate, TaskStatus, TaskStatusUpdate, TaskUpdate, UserActivationUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"])
admin_user = Depends(require_roles("ADMIN", "SUPER_ADMIN"))


def _task_payload(task: Task):
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "status": task.status,
        "deadline": task.deadline,
        "project": task.project,
        "requirements": task.requirements,
        "difficulty": task.difficulty,
        "is_published": task.is_published,
        "assignee": (
            {"id": task.assignee.id, "display_name": task.assignee.display_name, "email": task.assignee.email}
            if task.assignee else None
        ),
        "creator": {"id": task.creator.id, "display_name": task.creator.display_name},
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "comment_count": len(task.comments),
    }


def _load_task(db: Session, task_id: int) -> Task:
    task = (
        db.query(Task)
        .options(
            joinedload(Task.assignee),
            joinedload(Task.creator),
            joinedload(Task.comments),
        )
        .filter(Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(404, "Task not found")
    return task


def _ensure_task_access(task: Task, user: User):
    if user.role not in {"ADMIN", "SUPER_ADMIN"}:
        if task.assignee_id != user.id or not task.is_published:
            raise HTTPException(404, "Task not found")


def _record_activity(db: Session, actor: User, task: Task, action: str, details: str = ""):
    db.add(
        ActivityLog(
            actor_id=actor.id,
            entity_type="task",
            entity_id=task.id,
            action=action,
            details=details[:1000],
        )
    )


def _notify(db: Session, recipient_id: int | None, kind: str, title: str, message: str):
    if recipient_id is not None:
        db.add(
            Notification(
                recipient_id=recipient_id,
                kind=kind,
                title=title,
                message=message[:1000],
            )
        )


def _validate_assignee(db: Session, assignee_id: int | None) -> User | None:
    if assignee_id is None:
        return None
    assignee = db.query(User).filter(User.id == assignee_id, User.is_active.is_(True)).first()
    if not assignee:
        raise HTTPException(400, "Assignee does not exist or is inactive")
    return assignee


@router.get("")
def list_tasks(
    status: TaskStatus | None = None,
    project: str | None = None,
    search: str | None = Query(default=None, max_length=200),
    assignee_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Task).options(
        joinedload(Task.assignee), joinedload(Task.creator), joinedload(Task.comments)
    )
    if user.role not in {"ADMIN", "SUPER_ADMIN"}:
        query = query.filter(Task.assignee_id == user.id, Task.is_published.is_(True))
        if assignee_id is not None and assignee_id != user.id:
            raise HTTPException(403, "You can only view your own assigned tasks")
    elif assignee_id is not None:
        query = query.filter(Task.assignee_id == assignee_id)
    if status:
        query = query.filter(Task.status == status.upper())
    if project:
        query = query.filter(Task.project == project)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(Task.title.ilike(term), Task.description.ilike(term)))
    return [_task_payload(task) for task in query.order_by(Task.deadline.asc(), Task.id.desc()).offset(offset).limit(limit).all()]


@router.post("", status_code=201)
def create_task(payload: TaskCreate, user: User = admin_user, db: Session = Depends(get_db)):
    assignee = _validate_assignee(db, payload.assignee_id)
    task = Task(**payload.model_dump(), creator_id=user.id)
    db.add(task)
    db.flush()
    _record_activity(db, user, task, "created", task.title)
    if assignee:
        _notify(db, assignee.id, "task_assigned", "Task assigned", f"You were assigned: {task.title}")
    db.commit()
    return _task_payload(_load_task(db, task.id))


@router.get("/{task_id}")
def get_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = _load_task(db, task_id)
    _ensure_task_access(task, user)
    return _task_payload(task)


@router.put("/{task_id}")
def update_task(
    task_id: int,
    payload: TaskUpdate,
    user: User = admin_user,
    db: Session = Depends(get_db),
):
    task = _load_task(db, task_id)
    changes = payload.model_dump(exclude_unset=True)
    previous_assignee_id = task.assignee_id
    new_assignee = None
    if "assignee_id" in changes:
        new_assignee = _validate_assignee(db, changes["assignee_id"])
    for key, value in changes.items():
        setattr(task, key, value.strip() if isinstance(value, str) else value)
    task.updated_at = utc_now()
    _record_activity(db, user, task, "updated", ", ".join(changes.keys()))
    if "status" in changes:
        _notify(db, task.assignee_id, "task_status", "Task status changed", f"{task.title}: {task.status}")
    if new_assignee and new_assignee.id != previous_assignee_id:
        _notify(db, new_assignee.id, "task_assigned", "Task assigned", f"You were assigned: {task.title}")
    db.commit()
    return _task_payload(_load_task(db, task.id))


@router.patch("/{task_id}/status")
def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _load_task(db, task_id)
    _ensure_task_access(task, user)
    if task.status == payload.status:
        return _task_payload(task)
    task.status = payload.status
    task.updated_at = utc_now()
    _record_activity(db, user, task, "status_changed", payload.status)
    if task.creator_id != user.id:
        _notify(db, task.creator_id, "task_status", "Task status changed", f"{task.title}: {task.status}")
    db.commit()
    return _task_payload(_load_task(db, task.id))


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, user: User = admin_user, db: Session = Depends(get_db)):
    task = _load_task(db, task_id)
    _record_activity(db, user, task, "deleted", task.title)
    if task.assignee_id:
        _notify(db, task.assignee_id, "task_deleted", "Task removed", f"Task removed: {task.title}")
    db.delete(task)
    db.commit()


@router.get("/{task_id}/comments")
def list_comments(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = _load_task(db, task_id)
    _ensure_task_access(task, user)
    return [
        {
            "id": comment.id,
            "author_id": comment.author_id,
            "author": comment.author.display_name,
            "content": comment.content,
            "created_at": comment.created_at,
        }
        for comment in db.query(TaskComment)
        .options(joinedload(TaskComment.author))
        .filter(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at)
        .all()
    ]


@router.post("/{task_id}/comments", status_code=201)
def add_comment(
    task_id: int,
    payload: TaskCommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _load_task(db, task_id)
    _ensure_task_access(task, user)
    comment = TaskComment(task_id=task.id, author_id=user.id, content=payload.content.strip())
    db.add(comment)
    db.flush()
    _record_activity(db, user, task, "commented")
    recipient_id = task.creator_id if user.id != task.creator_id else task.assignee_id
    _notify(db, recipient_id, "task_comment", "Task update", f"New comment on: {task.title}")
    db.commit()
    return {
        "id": comment.id,
        "author_id": user.id,
        "author": user.display_name,
        "content": comment.content,
        "created_at": comment.created_at,
    }


notifications_router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@notifications_router.get("")
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notifications = (
        db.query(Notification)
        .filter(Notification.recipient_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": item.id,
            "kind": item.kind,
            "title": item.title,
            "message": item.message,
            "read_at": item.read_at,
            "created_at": item.created_at,
        }
        for item in notifications
    ]


@notifications_router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.recipient_id == user.id)
        .first()
    )
    if not notification:
        raise HTTPException(404, "Notification not found")
    notification.read_at = utc_now()
    db.commit()
    return {"id": notification.id, "read_at": notification.read_at}


admin_router = APIRouter(prefix="/api/admin", tags=["administration"])
super_admin_user = Depends(require_roles("SUPER_ADMIN"))


@admin_router.get("/users")
def list_users(user: User = admin_user, db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.id).limit(500).all()
    return [
        {
            "id": item.id,
            "email": item.email,
            "display_name": item.display_name,
            "role": item.role,
            "is_active": item.is_active,
        }
        for item in users
    ]


@admin_router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    payload: RoleUpdate,
    user: User = super_admin_user,
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    active_super_admins = db.query(User.id).filter(
        User.role == "SUPER_ADMIN", User.is_active.is_(True)
    ).count()
    if target.role == "SUPER_ADMIN" and payload.role != "SUPER_ADMIN" and active_super_admins <= 1:
        raise HTTPException(409, "You cannot remove the last active Super Admin")
    target.role = payload.role
    db.add(
        ActivityLog(
            actor_id=user.id,
            entity_type="user",
            entity_id=target.id,
            action="role_changed",
            details=payload.role,
        )
    )
    db.commit()
    return {"id": target.id, "email": target.email, "display_name": target.display_name, "role": target.role}


@admin_router.post("/invitations", status_code=201)
def create_member_invitation(
    payload: AdminInviteCreate,
    user: User = admin_user,
    db: Session = Depends(get_db),
):
    email = str(payload.email).lower().strip()
    if db.query(User.id).filter(func.lower(User.email) == email).first():
        raise HTTPException(409, "An account with this email already exists")
    pending = db.query(Invitation.id).filter(
        func.lower(Invitation.email) == email,
        Invitation.accepted_at.is_(None),
        Invitation.expires_at > utc_now(),
    ).first()
    if pending:
        raise HTTPException(409, "A valid invitation already exists for this email")

    invitation_code = secrets.token_urlsafe(32)
    invitation = Invitation(
        email=email,
        token_hash=hashlib.sha256(invitation_code.encode()).hexdigest(),
        invited_by_id=user.id,
        expires_at=utc_now() + timedelta(days=7),
    )
    db.add(invitation)
    db.flush()
    db.add(
        ActivityLog(
            actor_id=user.id,
            entity_type="invitation",
            entity_id=invitation.id,
            action="created",
            details=email,
        )
    )
    db.commit()
    return {"email": email, "invitation_code": invitation_code, "expires_at": invitation.expires_at}


@admin_router.put("/users/{user_id}/active")
def update_user_activation(
    user_id: int,
    payload: UserActivationUpdate,
    user: User = super_admin_user,
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    if user.id == target.id and not payload.is_active:
        raise HTTPException(409, "You cannot deactivate your own account")
    active_super_admins = db.query(User.id).filter(
        User.role == "SUPER_ADMIN", User.is_active.is_(True)
    ).count()
    if target.role == "SUPER_ADMIN" and target.is_active and not payload.is_active and active_super_admins <= 1:
        raise HTTPException(409, "You cannot deactivate the last active Super Admin")
    target.is_active = payload.is_active
    db.add(
        ActivityLog(
            actor_id=user.id,
            entity_type="user",
            entity_id=target.id,
            action="activated" if payload.is_active else "deactivated",
        )
    )
    db.commit()
    return {
        "id": target.id,
        "email": target.email,
        "display_name": target.display_name,
        "role": target.role,
        "is_active": target.is_active,
    }


@admin_router.get("/report")
def admin_report(user: User = admin_user, db: Session = Depends(get_db)):
    tasks = db.query(Task.status, func.count(Task.id)).group_by(Task.status).all()
    quiz_count = db.query(func.count(QuizAttempt.id)).filter(QuizAttempt.submitted_at.is_not(None)).scalar() or 0
    overdue = db.query(func.count(Task.id)).filter(
        Task.deadline < utc_now(), Task.status != "COMPLETED"
    ).scalar() or 0
    recent = (
        db.query(ActivityLog)
        .order_by(ActivityLog.created_at.desc())
        .limit(50)
        .all()
    )
    quiz_participation = (
        db.query(
            Quiz.id,
            Quiz.title,
            Quiz.is_published,
            func.count(QuizAttempt.id).label("attempts"),
        )
        .outerjoin(QuizAttempt, (QuizAttempt.quiz_id == Quiz.id) & QuizAttempt.submitted_at.is_not(None))
        .group_by(Quiz.id, Quiz.title, Quiz.is_published)
        .order_by(Quiz.id.desc())
        .all()
    )
    member_progress = (
        db.query(
            User.id,
            User.display_name,
            func.count(Task.id).label("assigned"),
            func.sum(case((Task.status == "COMPLETED", 1), else_=0)).label("completed"),
        )
        .join(Task, Task.assignee_id == User.id)
        .group_by(User.id, User.display_name)
        .order_by(User.display_name)
        .all()
    )
    return {
        "task_counts": {status: count for status, count in tasks},
        "overdue_tasks": overdue,
        "quiz_attempts": quiz_count,
        "quiz_participation": [
            {
                "quiz_id": item.id,
                "title": item.title,
                "is_published": item.is_published,
                "attempts": int(item.attempts),
            }
            for item in quiz_participation
        ],
        "member_progress": [
            {
                "user_id": item.id,
                "display_name": item.display_name,
                "assigned": int(item.assigned),
                "completed": int(item.completed or 0),
            }
            for item in member_progress
        ],
        "recent_activity": [
            {
                "id": event.id,
                "actor_id": event.actor_id,
                "entity_type": event.entity_type,
                "entity_id": event.entity_id,
                "action": event.action,
                "details": event.details,
                "created_at": event.created_at,
            }
            for event in recent
        ],
    }

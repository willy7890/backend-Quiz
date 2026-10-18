import re
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .auth import get_current_user, require_roles
from .database import get_db
from .models import Book, LearningPath, LearningProgress, Lesson, Quiz, Task, User, utc_now
from .schemas import BookInput, LearningPathInput, LearningProgressInput, LessonInput


router = APIRouter(tags=["learning content"])
admin = Depends(require_roles("ADMIN", "SUPER_ADMIN"))


def _path_payload(path: LearningPath, include_lessons: bool = False):
    result = {
        "id": path.id,
        "slug": path.slug,
        "title": path.title,
        "description": path.description,
        "language": path.language,
        "framework": path.framework,
        "difficulty": path.difficulty,
        "prerequisites": path.prerequisites,
        "objectives": path.objectives,
        "recommended_order": path.recommended_order,
        "status": path.status,
        "created_at": path.created_at,
        "updated_at": path.updated_at,
        "lesson_count": sum(lesson.status == "PUBLISHED" for lesson in path.lessons),
    }
    if include_lessons:
        result["lessons"] = [_lesson_payload(lesson) for lesson in sorted(
            path.lessons, key=lambda item: (item.recommended_order, item.id)
        ) if lesson.status == "PUBLISHED"]
    return result


def _lesson_payload(lesson: Lesson):
    return {
        "id": lesson.id,
        "learning_path_id": lesson.learning_path_id,
        "module_title": lesson.module_title,
        "topic": lesson.topic,
        "title": lesson.title,
        "content": lesson.content,
        "video_url": lesson.video_url,
        "video_embed_url": _youtube_embed_url(lesson.video_url),
        "explanation": lesson.explanation,
        "objectives": lesson.objectives,
        "difficulty": lesson.difficulty,
        "recommended_order": lesson.recommended_order,
        "status": lesson.status,
        "created_at": lesson.created_at,
        "updated_at": lesson.updated_at,
    }


def _youtube_embed_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlsplit(value)
    video_id = None
    if parsed.hostname == "youtu.be":
        video_id = parsed.path.strip("/").split("/", 1)[0]
    elif parsed.hostname in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [None])[0]
        else:
            match = re.fullmatch(r"/(?:embed|shorts)/([A-Za-z0-9_-]{11})", parsed.path)
            video_id = match.group(1) if match else None
    if video_id and re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        return f"https://www.youtube-nocookie.com/embed/{video_id}"
    return None


def _book_payload(book: Book):
    parsed = urlsplit(book.resource_url)
    match = re.fullmatch(r"/file/d/([A-Za-z0-9_-]+)/(?:view|preview)", parsed.path)
    preview_url = f"https://drive.google.com/file/d/{match.group(1)}/preview" if parsed.hostname == "drive.google.com" and match else None
    return {
        "id": book.id,
        "title": book.title,
        "author": book.author,
        "description": book.description,
        "technology": book.technology,
        "difficulty": book.difficulty,
        "cover_url": book.cover_url,
        "format": book.format,
        "resource_url": book.resource_url,
        "preview_url": preview_url,
        "reference_url": book.reference_url,
        "status": book.status,
        "created_at": book.created_at,
        "updated_at": book.updated_at,
    }


@router.get("/api/learning/paths")
def learning_paths(db: Session = Depends(get_db)):
    paths = db.query(LearningPath).filter(LearningPath.status == "PUBLISHED").order_by(
        LearningPath.recommended_order, LearningPath.id
    ).all()
    return [_path_payload(path, include_lessons=True) for path in paths]


@router.get("/api/learning/books")
def learning_books(
    search: str | None = Query(default=None, max_length=200),
    technology: str | None = Query(default=None, max_length=120),
    db: Session = Depends(get_db),
):
    query = db.query(Book).filter(Book.status == "PUBLISHED")
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(Book.title.ilike(term) | Book.author.ilike(term) | Book.technology.ilike(term))
    if technology:
        query = query.filter(Book.technology.ilike(f"%{technology.strip()}%"))
    return [_book_payload(book) for book in query.order_by(Book.title, Book.id).all()]


@router.get("/api/learning/progress")
def learning_progress(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(LearningProgress).join(Lesson).filter(
        LearningProgress.user_id == user.id, Lesson.status == "PUBLISHED"
    ).all()
    return [
        {
            "lesson_id": row.lesson_id,
            "completed": row.completed,
            "last_position": row.last_position,
            "updated_at": row.updated_at,
        }
        for row in rows
    ]


@router.put("/api/learning/progress/{lesson_id}")
def update_learning_progress(
    lesson_id: int,
    payload: LearningProgressInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lesson = db.query(Lesson).filter(
        Lesson.id == lesson_id, Lesson.status == "PUBLISHED"
    ).first()
    if not lesson:
        raise HTTPException(404, "Published lesson not found")
    progress = db.query(LearningProgress).filter(
        LearningProgress.user_id == user.id, LearningProgress.lesson_id == lesson_id
    ).first()
    if progress is None:
        progress = LearningProgress(user_id=user.id, lesson_id=lesson_id)
        db.add(progress)
    progress.completed = payload.completed
    progress.last_position = payload.last_position
    progress.updated_at = utc_now()
    db.commit()
    return {
        "lesson_id": progress.lesson_id,
        "completed": progress.completed,
        "last_position": progress.last_position,
        "updated_at": progress.updated_at,
    }


@router.get("/api/admin/dashboard", dependencies=[admin])
def admin_dashboard(db: Session = Depends(get_db)):
    recent = []
    for item in db.query(LearningPath).order_by(LearningPath.updated_at.desc()).limit(5):
        recent.append({"type": "Learning path", "title": item.title, "status": item.status, "updated_at": item.updated_at})
    for item in db.query(Lesson).order_by(Lesson.updated_at.desc()).limit(5):
        recent.append({"type": "Lesson", "title": item.title, "status": item.status, "updated_at": item.updated_at})
    for item in db.query(Book).order_by(Book.updated_at.desc()).limit(5):
        recent.append({"type": "Book", "title": item.title, "status": item.status, "updated_at": item.updated_at})
    recent.sort(key=lambda item: item["updated_at"], reverse=True)
    return {
        "users": db.query(func.count(User.id)).scalar() or 0,
        "learning_paths": db.query(func.count(LearningPath.id)).filter(LearningPath.status == "PUBLISHED").scalar() or 0,
        "lessons": db.query(func.count(Lesson.id)).scalar() or 0,
        "published_lessons": db.query(func.count(Lesson.id)).filter(Lesson.status == "PUBLISHED").scalar() or 0,
        "books": db.query(func.count(Book.id)).scalar() or 0,
        "published_books": db.query(func.count(Book.id)).filter(Book.status == "PUBLISHED").scalar() or 0,
        "quizzes": db.query(func.count(Quiz.id)).filter(Quiz.is_published.is_(True)).scalar() or 0,
        "projects": db.query(func.count(Task.id)).scalar() or 0,
        "recent_content": recent[:10],
    }


@router.get("/api/admin/learning-paths", dependencies=[admin])
def admin_learning_paths(db: Session = Depends(get_db)):
    return [_path_payload(path, include_lessons=True) for path in db.query(LearningPath).order_by(
        LearningPath.recommended_order, LearningPath.id
    ).all()]


@router.post("/api/admin/learning-paths", status_code=201, dependencies=[admin])
def create_learning_path(payload: LearningPathInput, db: Session = Depends(get_db)):
    if db.query(LearningPath.id).filter(LearningPath.slug == payload.slug).first():
        raise HTTPException(409, "A learning path already uses this slug")
    path = LearningPath(**payload.model_dump())
    db.add(path)
    db.commit()
    db.refresh(path)
    return _path_payload(path)


@router.put("/api/admin/learning-paths/{path_id}", dependencies=[admin])
def update_learning_path(path_id: int, payload: LearningPathInput, db: Session = Depends(get_db)):
    path = db.query(LearningPath).filter(LearningPath.id == path_id).first()
    if not path:
        raise HTTPException(404, "Learning path not found")
    duplicate = db.query(LearningPath.id).filter(
        LearningPath.slug == payload.slug, LearningPath.id != path_id
    ).first()
    if duplicate:
        raise HTTPException(409, "A learning path already uses this slug")
    for key, value in payload.model_dump().items():
        setattr(path, key, value)
    path.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(path)
    return _path_payload(path)


@router.get("/api/admin/lessons", dependencies=[admin])
def admin_lessons(db: Session = Depends(get_db)):
    return [_lesson_payload(lesson) for lesson in db.query(Lesson).order_by(
        Lesson.learning_path_id, Lesson.recommended_order, Lesson.id
    ).all()]


@router.post("/api/admin/lessons", status_code=201, dependencies=[admin])
def create_lesson(payload: LessonInput, db: Session = Depends(get_db)):
    if not db.query(LearningPath.id).filter(LearningPath.id == payload.learning_path_id).first():
        raise HTTPException(400, "Choose an existing learning path")
    lesson = Lesson(**payload.model_dump())
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return _lesson_payload(lesson)


@router.put("/api/admin/lessons/{lesson_id}", dependencies=[admin])
def update_lesson(lesson_id: int, payload: LessonInput, db: Session = Depends(get_db)):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    if not db.query(LearningPath.id).filter(LearningPath.id == payload.learning_path_id).first():
        raise HTTPException(400, "Choose an existing learning path")
    for key, value in payload.model_dump().items():
        setattr(lesson, key, value)
    lesson.updated_at = utc_now()
    db.commit()
    db.refresh(lesson)
    return _lesson_payload(lesson)


@router.get("/api/admin/books", dependencies=[admin])
def admin_books(
    search: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, pattern="^(DRAFT|PUBLISHED|ARCHIVED)$"),
    db: Session = Depends(get_db),
):
    query = db.query(Book)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(Book.title.ilike(term) | Book.author.ilike(term) | Book.technology.ilike(term))
    if status:
        query = query.filter(Book.status == status)
    return [_book_payload(book) for book in query.order_by(Book.title, Book.id).all()]


@router.post("/api/admin/books", status_code=201, dependencies=[admin])
def create_book(payload: BookInput, db: Session = Depends(get_db)):
    book = Book(**payload.model_dump())
    db.add(book)
    db.commit()
    db.refresh(book)
    return _book_payload(book)


@router.put("/api/admin/books/{book_id}", dependencies=[admin])
def update_book(book_id: int, payload: BookInput, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    for key, value in payload.model_dump().items():
        setattr(book, key, value)
    book.updated_at = utc_now()
    db.commit()
    db.refresh(book)
    return _book_payload(book)


@router.delete("/api/admin/books/{book_id}", status_code=204, dependencies=[admin])
def delete_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    db.delete(book)
    db.commit()

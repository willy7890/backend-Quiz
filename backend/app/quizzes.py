from datetime import timedelta, timezone
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .auth import get_current_user, get_optional_user, require_roles
from .database import get_db
from .models import ActivityLog, Notification, Option, Quiz, QuizAnswer, QuizAttempt, Question, User, Vote, WinnerAnnouncement, utc_now
from .schemas import QuizCreate, QuizPublish, QuizSubmit, QuizUpdate
from .rewards import COMPUTER_REWARD_POINTS

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])
admin_user = Depends(require_roles("ADMIN", "SUPER_ADMIN"))


def _record_activity(db: Session, user: User, quiz: Quiz, action: str):
    db.add(
        ActivityLog(
            actor_id=user.id,
            entity_type="quiz",
            entity_id=quiz.id,
            action=action,
            details=quiz.title[:1000],
        )
    )


def _is_open(quiz: Quiz) -> bool:
    now = utc_now()
    available = quiz.available_at
    closes = quiz.closes_at
    if available and available.tzinfo is None:
        available = available.replace(tzinfo=timezone.utc)
    if closes and closes.tzinfo is None:
        closes = closes.replace(tzinfo=timezone.utc)
    closed = quiz.closed_at
    if closed and closed.tzinfo is None:
        closed = closed.replace(tzinfo=timezone.utc)
    return (not available or available <= now) and (not closes or closes > now) and not closed


def _normalise_question_title(title: str) -> str:
    return re.sub(r"[\W_]+", " ", title.casefold()).strip()


def _validate_question_uniqueness(db: Session, titles: list[str], exclude_quiz_id: int | None = None):
    submitted = [_normalise_question_title(title) for title in titles]
    if len(submitted) != len(set(submitted)):
        raise HTTPException(409, "A quiz cannot contain the same question more than once")

    existing_questions = db.query(Question.title, Question.quiz_id).all()
    existing_titles = {
        _normalise_question_title(title)
        for title, quiz_id in existing_questions
        if exclude_quiz_id is None or quiz_id != exclude_quiz_id
    }
    if duplicate := next((title for title, normalized in zip(titles, submitted) if normalized in existing_titles), None):
        raise HTTPException(
            409,
            f"This question already exists in Practice or another quiz: {duplicate}",
        )


def _quiz_payload(quiz: Quiz, user_id: int | None = None, include_questions: bool = False):
    attempt = next((attempt for attempt in quiz.attempts if attempt.user_id == user_id), None) if user_id else None
    completed_attempt = attempt if attempt and attempt.submitted_at else None
    result = {
        "id": quiz.id,
        "title": quiz.title,
        "description": quiz.description,
        "category": quiz.category,
        "difficulty": quiz.difficulty,
        "time_limit_seconds": quiz.time_limit_seconds,
        "is_published": quiz.is_published,
        "available_at": quiz.available_at,
        "closes_at": quiz.closes_at,
        "closed_at": quiz.closed_at,
        "winner_announced": bool(quiz.winner_announcement),
        "question_count": len(quiz.questions),
        "max_score": sum(question.points for question in quiz.questions),
        "attempt_count": sum(1 for item in quiz.attempts if item.submitted_at is not None),
        "has_attempted": completed_attempt is not None,
        "attempt_score": completed_attempt.score if completed_attempt else None,
    }
    if include_questions:
        result["questions"] = [
            {
                "id": question.id,
                "title": question.title,
                "explanation": question.explanation,
                "points": question.points,
                "options": [
                    {"id": option.id, "label": option.label, "text": option.text}
                    for option in sorted(question.options, key=lambda item: item.id)
                ],
            }
            for question in sorted(quiz.questions, key=lambda item: item.id)
        ]
    return result


def _add_questions(db: Session, quiz: Quiz, payload: QuizCreate | QuizUpdate):
    for question_input in payload.questions or []:
        question = Question(
            title=question_input.title.strip(),
            topic=quiz.category,
            explanation=question_input.explanation.strip(),
            correct_option_id=0,
            quiz=quiz,
            difficulty=quiz.difficulty,
            points=question_input.points,
            is_published=quiz.is_published,
        )
        db.add(question)
        db.flush()
        options = [
            Option(question_id=question.id, label=chr(65 + index), text=text.strip())
            for index, text in enumerate(question_input.options)
        ]
        db.add_all(options)
        db.flush()
        question.correct_option_id = options[question_input.correct_option_index].id


def _attempt_payload(attempt: QuizAttempt, reveal: bool = True):
    started_at = attempt.started_at
    submitted_at = attempt.submitted_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    if submitted_at and submitted_at.tzinfo is None:
        submitted_at = submitted_at.replace(tzinfo=timezone.utc)
    data = {
        "id": attempt.id,
        "quiz_id": attempt.quiz_id,
        "user_id": attempt.user_id,
        "score": attempt.score,
        "max_score": attempt.max_score,
        "started_at": started_at,
        "submitted_at": submitted_at,
    }
    if reveal:
        data["answers"] = [
            {
                "question_id": answer.question_id,
                "option_id": answer.option_id,
                "is_correct": answer.is_correct,
                "points_earned": answer.points_earned,
            }
            for answer in attempt.answers
        ]
    return data


def _winner_payload(announcement: WinnerAnnouncement):
    return {
        "id": announcement.id,
        "quiz_id": announcement.quiz_id,
        "challenge_title": announcement.quiz.title,
        "winner": {
            "id": announcement.winner.id,
            "name": announcement.winner.display_name,
            "avatar_data": announcement.winner.avatar_data,
        },
        "final_score": announcement.final_score,
        "ranking": announcement.ranking,
        "total_points": announcement.winner_total_points,
        "computers_earned": announcement.computers_earned,
        "computer_reward_points": announcement.computer_reward_points,
        "tie_breaking_rule": announcement.tie_breaking_rule,
        "status": announcement.status,
        "result_period_start": announcement.result_period_start,
        "result_period_end": announcement.result_period_end,
        "created_at": announcement.created_at,
        "published_at": announcement.published_at,
    }


def _finalize_winner_announcement(
    db: Session,
    quiz: Quiz,
    actor_id: int | None,
    now,
) -> WinnerAnnouncement | None:
    existing = db.query(WinnerAnnouncement).filter_by(quiz_id=quiz.id).first()
    if existing:
        return existing

    quiz.closed_at = quiz.closed_at or now
    closes_at = quiz.closes_at
    if closes_at and closes_at.tzinfo is None:
        closes_at = closes_at.replace(tzinfo=timezone.utc)
    if closes_at is None or closes_at > now:
        quiz.closes_at = now

    attempts = (
        db.query(QuizAttempt)
        .options(joinedload(QuizAttempt.user), joinedload(QuizAttempt.answers))
        .join(User, User.id == QuizAttempt.user_id)
        .filter(
            QuizAttempt.quiz_id == quiz.id,
            QuizAttempt.submitted_at.is_not(None),
            User.is_active.is_(True),
        )
        .all()
    )
    if not attempts:
        return None

    attempts.sort(key=lambda attempt: (
        -attempt.score,
        -sum(answer.is_correct for answer in attempt.answers),
        attempt.submitted_at,
        attempt.user_id,
    ))
    winner_attempt = attempts[0]
    practice_points = db.query(func.coalesce(func.sum(Vote.points), 0)).filter(
        Vote.user_id == winner_attempt.user_id
    ).scalar()
    quiz_points = db.query(func.coalesce(func.sum(QuizAttempt.score), 0)).filter(
        QuizAttempt.user_id == winner_attempt.user_id
    ).scalar()
    winner_total_points = int(practice_points or 0) + int(quiz_points or 0)
    announcement = WinnerAnnouncement(
        quiz_id=quiz.id,
        winner_user_id=winner_attempt.user_id,
        final_score=winner_attempt.score,
        winner_total_points=winner_total_points,
        computer_reward_points=COMPUTER_REWARD_POINTS,
        computers_earned=winner_total_points // COMPUTER_REWARD_POINTS,
        ranking=1,
        tie_breaking_rule="score DESC, correct answers DESC, submitted_at ASC, user_id ASC",
        result_period_start=min(attempt.started_at for attempt in attempts),
        result_period_end=max(attempt.submitted_at for attempt in attempts),
        created_at=now,
        published_at=now,
    )
    db.add(announcement)
    db.add(
        ActivityLog(
            actor_id=actor_id,
            entity_type="quiz",
            entity_id=quiz.id,
            action="winner_announced",
            details=f"{quiz.title[:900]} · {winner_attempt.user.display_name[:80]}",
        )
    )
    for recipient in db.query(User).filter(User.is_active.is_(True)).all():
        db.add(
            Notification(
                recipient_id=recipient.id,
                kind="winner_announcement",
                title="Quiz winner announced",
                message=f"{winner_attempt.user.display_name} won {quiz.title}.",
            )
        )
    return announcement


@router.get("")
def list_quizzes(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    # Public listings contain published quizzes; private drafts are returned by the admin endpoint.
    quizzes = (
        db.query(Quiz)
        .options(joinedload(Quiz.questions), joinedload(Quiz.attempts))
        .filter(Quiz.is_published.is_(True))
        .order_by(Quiz.created_at.desc())
        .all()
    )
    return [_quiz_payload(quiz, user.id if user else None) for quiz in quizzes if _is_open(quiz)]


@router.get("/winner-announcements")
def list_winner_announcements(db: Session = Depends(get_db)):
    now = utc_now()
    expired_quizzes = db.query(Quiz).filter(
        Quiz.is_published.is_(True),
        Quiz.closes_at.is_not(None),
        Quiz.closes_at <= now,
    ).all()
    changed = False
    for quiz in expired_quizzes:
        if not quiz.closed_at:
            quiz.closed_at = now
            changed = True
        if not db.query(WinnerAnnouncement.id).filter_by(quiz_id=quiz.id).first():
            if _finalize_winner_announcement(db, quiz, actor_id=None, now=now):
                changed = True
    if changed:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()

    announcements = (
        db.query(WinnerAnnouncement)
        .options(joinedload(WinnerAnnouncement.quiz), joinedload(WinnerAnnouncement.winner))
        .filter(WinnerAnnouncement.status == "PUBLISHED")
        .order_by(WinnerAnnouncement.published_at.desc(), WinnerAnnouncement.id.desc())
        .all()
    )
    return [_winner_payload(announcement) for announcement in announcements]


@router.post("/{quiz_id}/winner-announcement", status_code=201)
def publish_winner_announcement(
    quiz_id: int,
    user: User = admin_user,
    db: Session = Depends(get_db),
):
    quiz = (
        db.query(Quiz)
        .options(joinedload(Quiz.attempts))
        .filter(Quiz.id == quiz_id)
        .with_for_update()
        .first()
    )
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if not quiz.is_published:
        raise HTTPException(409, "Publish the quiz before announcing its winner")

    now = utc_now()
    announcement = _finalize_winner_announcement(db, quiz, actor_id=user.id, now=now)
    if not announcement:
        db.commit()
        raise HTTPException(409, "The quiz is closed, but there are no submitted attempts to announce")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(WinnerAnnouncement).filter_by(quiz_id=quiz.id).first()
        if not existing:
            raise
        return _winner_payload(existing)
    db.refresh(announcement)
    return _winner_payload(announcement)


@router.get("/admin")
def list_all_quizzes(user: User = admin_user, db: Session = Depends(get_db)):
    quizzes = (
        db.query(Quiz)
        .options(joinedload(Quiz.questions), joinedload(Quiz.attempts))
        .order_by(Quiz.created_at.desc())
        .all()
    )
    return [_quiz_payload(quiz, user.id) for quiz in quizzes]


@router.get("/me/attempts")
def list_my_attempts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attempts = (
        db.query(QuizAttempt)
        .options(joinedload(QuizAttempt.quiz), joinedload(QuizAttempt.answers))
        .filter(QuizAttempt.user_id == user.id)
        .filter(QuizAttempt.submitted_at.is_not(None))
        .order_by(QuizAttempt.submitted_at.desc())
        .all()
    )
    return [
        {**_attempt_payload(attempt), "quiz_title": attempt.quiz.title}
        for attempt in attempts
    ]


@router.post("", status_code=201)
def create_quiz(payload: QuizCreate, user: User = admin_user, db: Session = Depends(get_db)):
    _validate_question_uniqueness(db, [question.title for question in payload.questions])
    quiz = Quiz(
        title=payload.title.strip(),
        description=payload.description.strip(),
        category=payload.category.strip(),
        difficulty=payload.difficulty,
        time_limit_seconds=payload.time_limit_seconds,
        available_at=payload.available_at,
        closes_at=payload.closes_at,
        creator_id=user.id,
    )
    db.add(quiz)
    db.flush()
    _add_questions(db, quiz, payload)
    _record_activity(db, user, quiz, "created")
    db.commit()
    db.refresh(quiz)
    return _quiz_payload(quiz, user.id, include_questions=True)


@router.get("/{quiz_id}")
def get_quiz(
    quiz_id: int,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    quiz = (
        db.query(Quiz)
        .options(joinedload(Quiz.questions).joinedload(Question.options), joinedload(Quiz.attempts))
        .filter(Quiz.id == quiz_id)
        .first()
    )
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if not quiz.is_published or not _is_open(quiz):
        raise HTTPException(404, "Quiz is not available")
    return _quiz_payload(quiz, user.id if user else None, include_questions=True)


@router.get("/{quiz_id}/preview")
def preview_quiz(quiz_id: int, user: User = admin_user, db: Session = Depends(get_db)):
    quiz = (
        db.query(Quiz)
        .options(joinedload(Quiz.questions).joinedload(Question.options), joinedload(Quiz.attempts))
        .filter(Quiz.id == quiz_id)
        .first()
    )
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    result = _quiz_payload(quiz, user.id, include_questions=True)
    for question_data, question in zip(result["questions"], sorted(quiz.questions, key=lambda item: item.id)):
        question_data["correct_option_id"] = question.correct_option_id
    return result


@router.put("/{quiz_id}")
def update_quiz(
    quiz_id: int,
    payload: QuizUpdate,
    user: User = admin_user,
    db: Session = Depends(get_db),
):
    quiz = db.query(Quiz).options(joinedload(Quiz.questions).joinedload(Question.options)).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if quiz.closed_at or quiz.winner_announcement:
        raise HTTPException(409, "Closed quizzes and their final results cannot be modified")
    values = payload.model_dump(exclude_unset=True, exclude={"questions"})
    available_at = values.get("available_at", quiz.available_at)
    closes_at = values.get("closes_at", quiz.closes_at)
    if available_at and closes_at and closes_at <= available_at:
        raise HTTPException(422, "closes_at must be later than available_at")
    for key, value in values.items():
        setattr(quiz, key, value.strip() if isinstance(value, str) else value)
    if payload.questions is not None:
        if quiz.attempts:
            raise HTTPException(409, "Quiz questions cannot change after a quiz has attempts")
        _validate_question_uniqueness(
            db,
            [question.title for question in payload.questions],
            exclude_quiz_id=quiz_id,
        )
        quiz.questions.clear()
        db.flush()
        _add_questions(db, quiz, payload)
    _record_activity(db, user, quiz, "updated")
    db.commit()
    db.refresh(quiz)
    return _quiz_payload(quiz, user.id, include_questions=True)


@router.patch("/{quiz_id}/publish")
def publish_quiz(
    quiz_id: int,
    payload: QuizPublish,
    user: User = admin_user,
    db: Session = Depends(get_db),
):
    quiz = db.query(Quiz).options(joinedload(Quiz.questions)).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if quiz.closed_at and quiz.is_published != payload.is_published:
        raise HTTPException(409, "A closed quiz cannot be republished or unpublished")
    if payload.is_published and not quiz.questions:
        raise HTTPException(400, "Add at least one question before publishing")
    if payload.is_published:
        _validate_question_uniqueness(
            db,
            [question.title for question in quiz.questions],
            exclude_quiz_id=quiz_id,
        )
    quiz.is_published = payload.is_published
    for question in quiz.questions:
        question.is_published = payload.is_published
    _record_activity(db, user, quiz, "published" if payload.is_published else "unpublished")
    db.commit()
    return _quiz_payload(quiz, user.id)


@router.delete("/{quiz_id}", status_code=204)
def delete_quiz(quiz_id: int, user: User = admin_user, db: Session = Depends(get_db)):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if quiz.attempts:
        raise HTTPException(409, "Quizzes with saved attempts cannot be deleted")
    _record_activity(db, user, quiz, "deleted")
    db.delete(quiz)
    db.commit()


@router.post("/{quiz_id}/start", status_code=201)
def start_quiz(
    quiz_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz or not quiz.is_published or not _is_open(quiz):
        raise HTTPException(404, "Quiz is not available")
    attempt = db.query(QuizAttempt).filter_by(quiz_id=quiz_id, user_id=user.id).first()
    if attempt:
        if attempt.submitted_at:
            raise HTTPException(409, "You have already submitted this quiz")
        return _attempt_payload(attempt, reveal=False)
    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=user.id,
        score=0,
        max_score=db.query(func.sum(Question.points)).filter(Question.quiz_id == quiz.id).scalar() or 0,
    )
    db.add(attempt)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A quiz attempt has already been started")
    db.refresh(attempt)
    return _attempt_payload(attempt, reveal=False)


@router.post("/{quiz_id}/submit", status_code=201)
def submit_quiz(
    quiz_id: int,
    payload: QuizSubmit,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quiz = (
        db.query(Quiz)
        .options(joinedload(Quiz.questions).joinedload(Question.options))
        .filter(Quiz.id == quiz_id)
        .first()
    )
    if not quiz or not quiz.is_published or not _is_open(quiz):
        raise HTTPException(404, "Quiz is not available")
    attempt = db.query(QuizAttempt).filter_by(quiz_id=quiz_id, user_id=user.id).with_for_update().first()
    if not attempt:
        raise HTTPException(409, "Start the quiz before submitting answers")
    if attempt.submitted_at:
        raise HTTPException(409, "You have already submitted this quiz")
    if quiz.time_limit_seconds is not None:
        started_at = attempt.started_at
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        if utc_now() > started_at + timedelta(seconds=quiz.time_limit_seconds):
            attempt.submitted_at = utc_now()
            db.commit()
            raise HTTPException(410, "The quiz time limit has expired")
    submitted_question_ids = [answer.question_id for answer in payload.answers]
    quiz_question_ids = {question.id for question in quiz.questions}
    if len(submitted_question_ids) != len(set(submitted_question_ids)) or set(submitted_question_ids) != quiz_question_ids:
        raise HTTPException(400, "Submit exactly one answer for every quiz question")

    question_by_id = {question.id: question for question in quiz.questions}
    for submitted in payload.answers:
        question = question_by_id[submitted.question_id]
        option_ids = {option.id for option in question.options}
        if submitted.option_id not in option_ids:
            raise HTTPException(400, "An answer option does not belong to its question")
        correct = submitted.option_id == question.correct_option_id
        points_earned = question.points if correct else 0
        attempt.score += points_earned
        db.add(
            QuizAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                option_id=submitted.option_id,
                is_correct=correct,
                points_earned=points_earned,
            )
        )
    attempt.submitted_at = utc_now()
    db.add(
        Notification(
            recipient_id=user.id,
            kind="quiz_result",
            title="Quiz results are ready",
            message=f"You scored {attempt.score} of {attempt.max_score} points on {quiz.title}.",
        )
    )
    db.commit()
    db.refresh(attempt)
    return _attempt_payload(attempt)


@router.get("/{quiz_id}/attempts")
def list_quiz_attempts(quiz_id: int, user: User = admin_user, db: Session = Depends(get_db)):
    if not db.query(Quiz.id).filter_by(id=quiz_id).first():
        raise HTTPException(404, "Quiz not found")
    attempts = (
        db.query(QuizAttempt)
        .options(joinedload(QuizAttempt.answers), joinedload(QuizAttempt.user))
        .filter(QuizAttempt.quiz_id == quiz_id, QuizAttempt.submitted_at.is_not(None))
        .order_by(QuizAttempt.submitted_at.desc())
        .all()
    )
    return [
        {**_attempt_payload(attempt), "user": {"id": attempt.user.id, "email": attempt.user.email, "display_name": attempt.user.display_name}}
        for attempt in attempts
    ]

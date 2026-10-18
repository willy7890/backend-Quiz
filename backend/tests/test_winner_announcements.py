from datetime import timedelta

from app.auth import make_token
from app.database import SessionLocal
from app.models import (
    Quiz,
    QuizAnswer,
    QuizAttempt,
    Question,
    Option,
    User,
    Vote,
    WinnerAnnouncement,
    utc_now,
)


def create_user(db, email, name, role="MEMBER", avatar_data=None):
    user = User(
        email=email,
        display_name=name,
        role=role,
        avatar_data=avatar_data,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def create_quiz(db, creator, title, closes_at=None):
    quiz = Quiz(
        title=title,
        description="Winner calculation fixture",
        category="Backend",
        difficulty="BEGINNER",
        is_published=True,
        closes_at=closes_at,
        creator_id=creator.id,
    )
    db.add(quiz)
    db.flush()
    questions = []
    for index in range(3):
        question = Question(
            title=f"{title} question {index + 1}",
            topic="Backend",
            explanation="Fixture explanation",
            correct_option_id=0,
            quiz_id=quiz.id,
            points=10,
            is_published=True,
        )
        db.add(question)
        db.flush()
        options = [
            Option(question_id=question.id, label="A", text="Correct"),
            Option(question_id=question.id, label="B", text="Incorrect"),
        ]
        db.add_all(options)
        db.flush()
        question.correct_option_id = options[0].id
        questions.append((question, options))
    return quiz, questions


def add_attempt(db, quiz, user, question_options, score, correct_count, minutes_ago):
    started_at = utc_now() - timedelta(minutes=minutes_ago + 2)
    submitted_at = utc_now() - timedelta(minutes=minutes_ago)
    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=user.id,
        score=score,
        max_score=30,
        started_at=started_at,
        submitted_at=submitted_at,
    )
    db.add(attempt)
    db.flush()
    for index, (question, options) in enumerate(question_options):
        is_correct = index < correct_count
        db.add(
            QuizAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                option_id=options[0 if is_correct else 1].id,
                is_correct=is_correct,
                points_earned=10 if is_correct else 0,
            )
        )
    return attempt


def add_accounts_and_tokens(db):
    admin = create_user(db, "admin@example.test", "Challenge Admin", "ADMIN")
    winner = create_user(db, "winner@example.test", "Real Quiz Winner", avatar_data="data:image/png;base64,cHJvZmlsZQ==")
    other = create_user(db, "other@example.test", "Other Participant")
    db.commit()
    return admin, winner, other, {
        "admin": {"Authorization": f"Bearer {make_token(admin)}"},
        "winner": {"Authorization": f"Bearer {make_token(winner)}"},
    }


def test_admin_publishes_one_deterministic_announcement(client):
    db = SessionLocal()
    try:
        admin, winner, other, headers = add_accounts_and_tokens(db)
        quiz, questions = create_quiz(db, admin, "FastAPI Finals")
        add_attempt(db, quiz, other, questions, score=20, correct_count=1, minutes_ago=2)
        add_attempt(db, quiz, winner, questions, score=20, correct_count=2, minutes_ago=1)

        practice_question = db.query(Question).filter(Question.quiz_id.is_(None)).first()
        practice_option = db.query(Option).filter(Option.question_id == practice_question.id).first()
        db.add(
            Vote(
                question_id=practice_question.id,
                user_id=winner.id,
                participant_name=winner.display_name,
                option_id=practice_option.id,
                is_correct=1,
                points=10,
            )
        )
        db.commit()

        forbidden = client.post(
            f"/api/quizzes/{quiz.id}/winner-announcement",
            headers=headers["winner"],
        )
        assert forbidden.status_code == 403

        response = client.post(
            f"/api/quizzes/{quiz.id}/winner-announcement",
            headers=headers["admin"],
        )
        assert response.status_code == 201
        announcement = response.json()
        assert announcement["winner"]["id"] == winner.id
        assert announcement["winner"]["name"] == "Real Quiz Winner"
        assert announcement["winner"]["avatar_data"] == "data:image/png;base64,cHJvZmlsZQ=="
        assert announcement["challenge_title"] == "FastAPI Finals"
        assert announcement["final_score"] == 20
        assert announcement["total_points"] == 30
        assert announcement["computer_reward_points"] == 20
        assert announcement["computers_earned"] == 1
        assert announcement["tie_breaking_rule"] == (
            "score DESC, correct answers DESC, submitted_at ASC, user_id ASC"
        )

        repeated = client.post(
            f"/api/quizzes/{quiz.id}/winner-announcement",
            headers=headers["admin"],
        )
        refreshed = client.get("/api/quizzes/winner-announcements")
        assert repeated.status_code == 201
        assert repeated.json()["id"] == announcement["id"]
        assert len(refreshed.json()) == 1
        assert db.query(WinnerAnnouncement).filter_by(quiz_id=quiz.id).count() == 1
        db.expire_all()
        assert db.query(Quiz).filter_by(id=quiz.id).one().closed_at is not None
    finally:
        db.close()


def test_automatic_close_announces_submitted_quiz_results(client):
    db = SessionLocal()
    try:
        admin, participant, _, _ = add_accounts_and_tokens(db)
        quiz, questions = create_quiz(
            db,
            admin,
            "Timed Backend Challenge",
            closes_at=utc_now() - timedelta(minutes=1),
        )
        add_attempt(db, quiz, participant, questions, score=30, correct_count=3, minutes_ago=3)
        db.commit()

        response = client.get("/api/quizzes/winner-announcements")
        assert response.status_code == 200
        announcement = response.json()[0]
        assert announcement["challenge_title"] == quiz.title
        assert announcement["winner"]["id"] == participant.id
        assert announcement["final_score"] == 30
        db.expire_all()
        assert db.query(Quiz).filter_by(id=quiz.id).one().closed_at is not None
        assert db.query(WinnerAnnouncement).filter_by(quiz_id=quiz.id).count() == 1
    finally:
        db.close()


def test_empty_quiz_closes_without_fabricating_a_winner(client):
    db = SessionLocal()
    try:
        admin, _, _, headers = add_accounts_and_tokens(db)
        quiz, _ = create_quiz(db, admin, "No Submissions")
        db.commit()

        response = client.post(
            f"/api/quizzes/{quiz.id}/winner-announcement",
            headers=headers["admin"],
        )
        assert response.status_code == 409
        assert "no submitted attempts" in response.json()["detail"]
        assert client.get("/api/quizzes/winner-announcements").json() == []
        assert db.query(WinnerAnnouncement).filter_by(quiz_id=quiz.id).count() == 0
        db.expire_all()
        assert db.query(Quiz).filter_by(id=quiz.id).one().closed_at is not None
    finally:
        db.close()

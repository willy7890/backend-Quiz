from contextlib import asynccontextmanager
from datetime import timedelta
import hashlib
import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from .database import get_db
from .models import Invitation, QuizAttempt, QuizAnswer, Question, Option, Vote, User, utc_now
from .schemas import VoteCreate, VoteOut, RegisterRequest, LoginRequest, GoogleLoginRequest, ProfileUpdate
from .auth import get_optional_user, password_hash, make_token, user_payload, get_current_user, verify_google_credential, require_secret
from .quizzes import router as quizzes_router
from .tasks import admin_router, notifications_router, router as tasks_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    with next(get_db()) as db:
        if db.query(Question).filter(Question.quiz_id.is_(None)).count() == 0:
            seed_questions(db)
    yield

app = FastAPI(title="FastQuiz API", description="Interactive FastAPI and Python backend quiz", version="1.0.0", lifespan=lifespan)
allowed_origins = [
    origin.strip() for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",") if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(quizzes_router)
app.include_router(tasks_router)
app.include_router(notifications_router)
app.include_router(admin_router)

def seed_questions(db: Session):
    items = [
        ("Which of the following is primarily a backend framework for Python?", "FastAPI", "FastAPI is a modern Python framework for building APIs.", ["React", "FastAPI", "CSS", "HTML"], 1),
        ("Which command runs a FastAPI app called app in main.py with Uvicorn?", "FastAPI", "The format is module:application_object.", ["npm start", "uvicorn main:app --reload", "git run main.py", "python install fastapi"], 1),
        ("Which HTTP method is normally used to retrieve data?", "REST APIs", "GET requests are commonly used to retrieve a resource.", ["POST", "DELETE", "GET", "PATCH"], 2),
        ("What is Pydantic commonly used for in FastAPI?", "Validation", "Pydantic models validate and serialize data.", ["Styling pages", "Data validation", "Managing Git branches", "Hosting images"], 1),
        ("What does HTTP status code 404 mean?", "HTTP", "404 means the requested resource was not found.", ["Request successful", "Resource not found", "Server error", "Resource created"], 1),
        ("Which one is a relational database?", "Databases", "PostgreSQL is a relational database system.", ["PostgreSQL", "HTML", "Uvicorn", "React"], 0),
        ("What does CRUD stand for?", "Databases", "CRUD means Create, Read, Update and Delete.", ["Create, Read, Update, Delete", "Copy, Run, Upload, Download", "Connect, Return, Use, Deploy", "Create, Return, Undo, Debug"], 0),
        ("What is authentication?", "Security", "Authentication verifies who a user is.", ["Verifying who a user is", "Choosing a button color", "Creating a database table", "Deploying frontend files"], 0),
        ("Why should secrets not be committed to a public repository?", "Security", "Exposed credentials can be stolen and misused.", ["They may be exposed and misused", "Git cannot store Python", "They slow down Python", "They prevent all requests"], 0),
        ("What is FastAPI dependency injection useful for?", "FastAPI", "Dependencies let routes reuse shared logic such as DB sessions and authentication.", ["Providing reusable dependencies to endpoints", "Designing frontend pages", "Replacing all functions", "Deleting every database record"], 0),
    ]
    for title, topic, explanation, texts, correct_idx in items:
        q = Question(title=title, topic=topic, explanation=explanation, correct_option_id=0)
        db.add(q)
        db.flush()
        created_options = []
        for i, text in enumerate(texts):
            option = Option(question_id=q.id, label=chr(65+i), text=text)
            db.add(option)
            created_options.append(option)
        db.flush()
        q.correct_option_id = created_options[correct_idx].id
    db.commit()

def question_payload(db: Session, q: Question, user_id: int | None = None, reveal: bool = False):
    votes = db.query(Vote).filter(Vote.question_id == q.id).all()
    counts = {o.id: 0 for o in q.options}
    for vote in votes:
        counts[vote.option_id] = counts.get(vote.option_id, 0) + 1
    total = len(votes)
    options = []
    for o in sorted(q.options, key=lambda x: x.id):
        options.append({
            "id": o.id, "label": o.label, "text": o.text,
            "votes": counts.get(o.id, 0),
            "percentage": round(counts.get(o.id, 0) * 100 / total, 1) if total else 0
        })
    has_voted = bool(user_id and any(v.user_id == user_id for v in votes))
    data = {"id": q.id, "title": q.title, "topic": q.topic, "explanation": q.explanation,
            "options": options, "total_votes": total, "user_has_voted": has_voted}
    if reveal:
        data["correct_option_id"] = q.correct_option_id
    return data

@app.get("/")
def root():
    return {"name": "FastQuiz API", "status": "running", "docs": "/docs"}

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.post("/api/auth/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    require_secret()
    email = payload.email.lower().strip()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(409, "An account with this email already exists")
    invitation = None
    if payload.invitation_code:
        token_hash = hashlib.sha256(payload.invitation_code.encode()).hexdigest()
        invitation = db.query(Invitation).filter(
            Invitation.token_hash == token_hash,
            func.lower(Invitation.email) == email,
            Invitation.accepted_at.is_(None),
            Invitation.expires_at > utc_now(),
        ).first()
        if not invitation:
            raise HTTPException(400, "Invitation code is invalid, expired, or for a different email")
    user = User(email=email, display_name=payload.display_name.strip(), password_hash=password_hash.hash(payload.password))
    db.add(user)
    if invitation:
        invitation.accepted_at = utc_now()
    db.commit()
    db.refresh(user)
    return {"access_token": make_token(user), "token_type": "bearer", "user": user_payload(user)}

@app.post("/api/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    require_secret()
    user = db.query(User).filter(
        func.lower(User.email) == payload.email.lower().strip(),
        User.is_active.is_(True),
    ).first()
    if not user or not user.password_hash or not password_hash.verify(payload.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    return {"access_token": make_token(user), "token_type": "bearer", "user": user_payload(user)}

@app.post("/api/auth/google")
def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    require_secret()
    info = verify_google_credential(payload.credential)
    email = info["email"].lower().strip()
    google_sub = info["sub"]
    user = db.query(User).filter(User.google_sub == google_sub).first()
    if not user:
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if user:
            user.google_sub = google_sub
        else:
            user = User(email=email, display_name=(info.get("name") or email.split("@")[0])[:80], google_sub=google_sub)
            db.add(user)
        db.commit()
        db.refresh(user)
    if not user.is_active:
        raise HTTPException(401, "User account is not available")
    return {"access_token": make_token(user), "token_type": "bearer", "user": user_payload(user)}

@app.get("/api/auth/me")
def auth_me(user: User = Depends(get_current_user)):
    return user_payload(user)

@app.patch("/api/auth/me")
def update_profile(payload: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.display_name = payload.display_name.strip()
    db.commit()
    db.refresh(user)
    return user_payload(user)

@app.get("/api/questions")
def list_questions(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    questions = (
        db.query(Question)
        .options(joinedload(Question.options))
        .filter(Question.quiz_id.is_(None), Question.is_published.is_(True))
        .order_by(Question.id)
        .all()
    )
    return [question_payload(db, q, user.id if user else None, reveal=False) for q in questions]

@app.get("/api/questions/{question_id}")
def get_question(question_id: int, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    q = db.query(Question).options(joinedload(Question.options)).filter(
        Question.id == question_id, Question.quiz_id.is_(None), Question.is_published.is_(True)
    ).first()
    if not q:
        raise HTTPException(404, "Question not found")
    return question_payload(db, q, user.id if user else None, reveal=False)

@app.post("/api/questions/{question_id}/vote", response_model=VoteOut)
def cast_vote(question_id: int, payload: VoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    name = user.display_name
    q = db.query(Question).options(joinedload(Question.options)).filter(Question.id == question_id).first()
    if not q or q.quiz_id is not None or not q.is_published:
        raise HTTPException(404, "Question not found")
    option = db.query(Option).filter(Option.id == payload.option_id, Option.question_id == question_id).first()
    if not option:
        raise HTTPException(400, "That option does not belong to this question")
    previous = db.query(Vote).filter(Vote.question_id == question_id, Vote.user_id == user.id).first()
    if previous:
        raise HTTPException(409, "You have already voted on this question")
    correct = option.id == q.correct_option_id
    points = q.points if correct else 0
    db.add(Vote(question_id=question_id, user_id=user.id, participant_name=name, option_id=option.id, is_correct=int(correct), points=points))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "You have already voted on this question")
    total_points = db.query(func.sum(Vote.points)).filter(Vote.user_id == user.id).scalar() or 0
    roses = total_points // 10
    return {"message": "Vote recorded", "is_correct": correct, "points_earned": points,
            "correct_option_id": q.correct_option_id, "explanation": q.explanation,
            "total_points": total_points, "roses": roses}

@app.get("/api/leaderboard")
def leaderboard(db: Session = Depends(get_db)):
    rows = db.query(
        User.id,
        User.display_name,
        func.coalesce(func.sum(Vote.points), 0).label("points"),
        func.count(Vote.id).label("answered"),
        func.coalesce(func.sum(Vote.is_correct), 0).label("correct"),
    ).join(Vote, Vote.user_id == User.id).filter(User.is_active.is_(True)).group_by(User.id, User.display_name).all()
    scores = {
        row.id: {"name": row.display_name, "points": int(row.points), "answered": int(row.answered), "correct": int(row.correct)}
        for row in rows
    }
    quiz_rows = db.query(
        QuizAttempt.user_id,
        User.display_name,
        func.sum(QuizAttempt.score).label("points"),
    ).join(User, User.id == QuizAttempt.user_id).filter(User.is_active.is_(True)).group_by(QuizAttempt.user_id, User.display_name).all()
    for row in quiz_rows:
        score = scores.setdefault(row.user_id, {"name": row.display_name, "points": 0, "answered": 0, "correct": 0})
        score["points"] += int(row.points or 0)
    quiz_answer_rows = db.query(
        QuizAttempt.user_id,
        func.count(QuizAnswer.id).label("answered"),
        func.coalesce(func.sum(QuizAnswer.is_correct), 0).label("correct"),
    ).join(QuizAnswer, QuizAnswer.attempt_id == QuizAttempt.id).group_by(QuizAttempt.user_id).all()
    for row in quiz_answer_rows:
        score = scores.get(row.user_id)
        if score:
            score["answered"] += int(row.answered or 0)
            score["correct"] += int(row.correct or 0)
    return [
        {**score, "roses": score["points"] // 10}
        for score in sorted(scores.values(), key=lambda item: (item["points"], item["correct"]), reverse=True)[:20]
    ]

@app.get("/api/me/stats")
def my_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    points = (db.query(func.sum(Vote.points)).filter(Vote.user_id == user.id).scalar() or 0) + (
        db.query(func.sum(QuizAttempt.score)).filter(QuizAttempt.user_id == user.id).scalar() or 0
    )
    answered = (db.query(func.count(Vote.id)).filter(Vote.user_id == user.id).scalar() or 0) + (
        db.query(func.count(QuizAnswer.id))
        .join(QuizAttempt, QuizAttempt.id == QuizAnswer.attempt_id)
        .filter(QuizAttempt.user_id == user.id)
        .scalar() or 0
    )
    correct = (db.query(func.sum(Vote.is_correct)).filter(Vote.user_id == user.id).scalar() or 0) + (
        db.query(func.sum(QuizAnswer.is_correct))
        .join(QuizAttempt, QuizAttempt.id == QuizAnswer.attempt_id)
        .filter(QuizAttempt.user_id == user.id)
        .scalar() or 0
    )
    return {"user": user_payload(user), "points": int(points), "answered": int(answered), "correct": int(correct), "roses": int(points // 10)}

@app.get("/api/results/{question_id}")
def question_results(question_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Question).options(joinedload(Question.options)).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question not found")
    if q.quiz_id is not None:
        raise HTTPException(404, "Question not found")
    if user.role not in {"ADMIN", "SUPER_ADMIN"}:
        vote = db.query(Vote.id).filter(Vote.question_id == question_id, Vote.user_id == user.id).first()
        if not vote:
            raise HTTPException(403, "Submit your answer before viewing results")
    return question_payload(db, q, reveal=True)

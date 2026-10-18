from datetime import datetime
import re
from typing import Literal
from urllib.parse import parse_qs, urlsplit

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


RoleName = Literal["SUPER_ADMIN", "ADMIN", "MEMBER"]
TaskStatus = Literal["TO_DO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED"]
TaskPriority = Literal["LOW", "MEDIUM", "HIGH", "URGENT"]
ContentStatus = Literal["DRAFT", "PUBLISHED", "ARCHIVED"]
ContentDifficulty = Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"]

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=80)
    invitation_code: str | None = Field(default=None, min_length=20, max_length=128)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=20)


class RoleUpdate(BaseModel):
    role: RoleName


class UserActivationUpdate(BaseModel):
    is_active: bool


class AdminInviteCreate(BaseModel):
    email: EmailStr


class ProfileUpdate(BaseModel):
    display_name: str = Field(min_length=2, max_length=80)
    avatar_data: str | None = Field(default=None, max_length=1_500_000)


class VoteCreate(BaseModel):
    option_id: int

class OptionOut(BaseModel):
    id: int
    label: str
    text: str
    votes: int = 0
    percentage: float = 0
    model_config = ConfigDict(from_attributes=True)

class QuestionOut(BaseModel):
    id: int
    title: str
    topic: str
    explanation: str
    options: list[OptionOut]
    total_votes: int
    user_has_voted: bool = False
    correct_option_id: int | None = None
    model_config = ConfigDict(from_attributes=True)

class VoteOut(BaseModel):
    message: str
    is_correct: bool
    points_earned: int
    correct_option_id: int
    explanation: str
    total_points: int
    computers: int


class QuizQuestionInput(BaseModel):
    title: str = Field(min_length=3, max_length=500)
    explanation: str = Field(default="", max_length=1000)
    points: int = Field(default=10, ge=1, le=1000)
    options: list[str] = Field(min_length=2, max_length=8)
    correct_option_index: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_correct_option(self):
        if self.correct_option_index >= len(self.options):
            raise ValueError("correct_option_index must refer to an existing option")
        if any(not option.strip() or len(option) > 300 for option in self.options):
            raise ValueError("Options must contain 1 to 300 characters")
        return self


class QuizCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=2000)
    category: str = Field(default="General", min_length=1, max_length=100)
    difficulty: Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"] = "BEGINNER"
    time_limit_seconds: int | None = Field(default=None, ge=30, le=86400)
    available_at: datetime | None = None
    closes_at: datetime | None = None
    questions: list[QuizQuestionInput] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_availability(self):
        if self.available_at and self.closes_at and self.closes_at <= self.available_at:
            raise ValueError("closes_at must be later than available_at")
        return self


class QuizUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    difficulty: Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"] | None = None
    time_limit_seconds: int | None = Field(default=None, ge=30, le=86400)
    available_at: datetime | None = None
    closes_at: datetime | None = None
    questions: list[QuizQuestionInput] | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_availability(self):
        if self.available_at and self.closes_at and self.closes_at <= self.available_at:
            raise ValueError("closes_at must be later than available_at")
        return self


class QuizAnswerInput(BaseModel):
    question_id: int
    option_id: int


class QuizSubmit(BaseModel):
    answers: list[QuizAnswerInput] = Field(min_length=1, max_length=100)


class QuizPublish(BaseModel):
    is_published: bool


class TaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=10000)
    priority: TaskPriority = "MEDIUM"
    status: TaskStatus = "TO_DO"
    deadline: datetime | None = None
    project: str | None = Field(default=None, max_length=120)
    requirements: str = Field(default="", max_length=10000)
    difficulty: ContentDifficulty = "BEGINNER"
    is_published: bool = True
    assignee_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    deadline: datetime | None = None
    project: str | None = Field(default=None, max_length=120)
    requirements: str | None = Field(default=None, max_length=10000)
    difficulty: ContentDifficulty | None = None
    is_published: bool | None = None
    assignee_id: int | None = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskCommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class LearningPathInput(BaseModel):
    slug: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=10000)
    language: str = Field(default="", max_length=80)
    framework: str = Field(default="", max_length=100)
    difficulty: ContentDifficulty = "BEGINNER"
    prerequisites: str = Field(default="", max_length=5000)
    objectives: str = Field(default="", max_length=5000)
    recommended_order: int = Field(default=0, ge=0, le=10000)
    status: ContentStatus = "DRAFT"


class LessonInput(BaseModel):
    learning_path_id: int = Field(gt=0)
    module_title: str = Field(default="General", min_length=1, max_length=160)
    topic: str = Field(default="", max_length=160)
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(default="", max_length=100000)
    video_url: str | None = Field(default=None, max_length=2048)
    explanation: str = Field(default="", max_length=10000)
    objectives: str = Field(default="", max_length=5000)
    difficulty: ContentDifficulty = "BEGINNER"
    recommended_order: int = Field(default=0, ge=0, le=10000)
    status: ContentStatus = "DRAFT"

    @field_validator("video_url")
    @classmethod
    def validate_youtube_video_url(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        parsed = urlsplit(value)
        host = (parsed.hostname or "").lower()
        video_id = None
        if host == "youtu.be":
            video_id = parsed.path.strip("/").split("/", 1)[0]
        elif host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
            if parsed.path == "/watch":
                video_id = parse_qs(parsed.query).get("v", [None])[0]
            else:
                match = re.fullmatch(r"/(?:embed|shorts)/([A-Za-z0-9_-]{11})", parsed.path)
                video_id = match.group(1) if match else None
        if parsed.scheme not in {"http", "https"} or not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            raise ValueError("Enter a valid YouTube video URL")
        return value


class BookInput(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    author: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=10000)
    technology: str = Field(default="", max_length=120)
    difficulty: ContentDifficulty = "BEGINNER"
    cover_url: str | None = Field(default=None, max_length=2048)
    format: Literal["LINK", "PDF", "EPUB", "VIDEO", "OTHER"] = "LINK"
    resource_url: str = Field(min_length=8, max_length=2048)
    reference_url: str | None = Field(default=None, max_length=2048)
    status: ContentStatus = "DRAFT"

    @field_validator("cover_url", "resource_url", "reference_url")
    @classmethod
    def validate_external_urls(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("URLs must use http or https and include a hostname")
        return value


class LearningProgressInput(BaseModel):
    completed: bool
    last_position: int = Field(default=0, ge=0, le=10000000)

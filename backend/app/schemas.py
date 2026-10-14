from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


RoleName = Literal["SUPER_ADMIN", "ADMIN", "MEMBER"]
TaskStatus = Literal["TO_DO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED"]
TaskPriority = Literal["LOW", "MEDIUM", "HIGH", "URGENT"]

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
    roses: int


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
    assignee_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    deadline: datetime | None = None
    project: str | None = Field(default=None, max_length=120)
    assignee_id: int | None = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskCommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)

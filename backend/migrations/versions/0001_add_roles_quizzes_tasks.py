"""Add roles, managed quizzes, tasks, notifications, and activity history.

Revision ID: 0001_add_roles_quizzes_tasks
Revises:
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0001_add_roles_quizzes_tasks"
down_revision = None
branch_labels = None
depends_on = None


def _tables():
    return set(inspect(op.get_bind()).get_table_names())


def _columns(table):
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _indexes(table):
    return {index["name"] for index in inspect(op.get_bind()).get_indexes(table)}


def _index(table, name, columns):
    if name not in _indexes(table):
        op.create_index(name, table, columns)


def upgrade():
    tables = _tables()
    if "users" not in tables:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("display_name", sa.String(80), nullable=False),
            sa.Column("password_hash", sa.String(255), nullable=True),
            sa.Column("google_sub", sa.String(255), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.UniqueConstraint("email"),
            sa.UniqueConstraint("google_sub"),
        )
    if "quizzes" not in tables:
        op.create_table(
            "quizzes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("description", sa.String(2000), nullable=False, server_default=""),
            sa.Column("category", sa.String(100), nullable=False, server_default="General"),
            sa.Column("difficulty", sa.String(20), nullable=False, server_default="BEGINNER"),
            sa.Column("time_limit_seconds", sa.Integer(), nullable=True),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("available_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("creator_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "questions" not in tables:
        op.create_table(
            "questions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(500), nullable=False),
            sa.Column("topic", sa.String(100), nullable=False, server_default="FastAPI"),
            sa.Column("explanation", sa.String(1000), nullable=False, server_default=""),
            sa.Column("correct_option_id", sa.Integer(), nullable=False),
        )
    if "options" not in tables:
        op.create_table(
            "options",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id"), nullable=False),
            sa.Column("label", sa.String(1), nullable=False),
            sa.Column("text", sa.String(300), nullable=False),
        )
    if "votes" not in tables:
        op.create_table(
            "votes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("participant_name", sa.String(80), nullable=False),
            sa.Column("option_id", sa.Integer(), sa.ForeignKey("options.id"), nullable=False),
            sa.Column("is_correct", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("points", sa.Integer(), nullable=False, server_default="0"),
            sa.UniqueConstraint("question_id", "user_id", name="one_vote_per_question_user"),
        )

    tables = _tables()
    if "role" not in _columns("users"):
        op.add_column(
            "users",
            sa.Column("role", sa.String(20), nullable=False, server_default="MEMBER"),
        )
    question_columns = _columns("questions")
    question_additions = [
        (
            "quiz_id",
            sa.Column(
                "quiz_id",
                sa.Integer(),
                sa.ForeignKey("quizzes.id", name="fk_questions_quiz_id_quizzes"),
                nullable=True,
            ),
        ),
        ("difficulty", sa.Column("difficulty", sa.String(20), nullable=False, server_default="PRACTICE")),
        ("points", sa.Column("points", sa.Integer(), nullable=False, server_default="10")),
        ("is_published", sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true())),
        ("available_at", sa.Column("available_at", sa.DateTime(timezone=True), nullable=True)),
        ("closes_at", sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True)),
    ]
    missing_question_columns = [
        column for column_name, column in question_additions if column_name not in question_columns
    ]
    if missing_question_columns:
        with op.batch_alter_table("questions") as batch_op:
            for column in missing_question_columns:
                batch_op.add_column(column)

    tables = _tables()
    if "quiz_attempts" not in tables:
        op.create_table(
            "quiz_attempts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("quiz_id", sa.Integer(), sa.ForeignKey("quizzes.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("score", sa.Integer(), nullable=False),
            sa.Column("max_score", sa.Integer(), nullable=False),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("quiz_id", "user_id", name="one_quiz_attempt_per_user"),
        )
    if "quiz_answers" not in tables:
        op.create_table(
            "quiz_answers",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("attempt_id", sa.Integer(), sa.ForeignKey("quiz_attempts.id"), nullable=False),
            sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id"), nullable=False),
            sa.Column("option_id", sa.Integer(), sa.ForeignKey("options.id"), nullable=False),
            sa.Column("is_correct", sa.Boolean(), nullable=False),
            sa.Column("points_earned", sa.Integer(), nullable=False),
            sa.UniqueConstraint("attempt_id", "question_id", name="one_answer_per_question_attempt"),
        )
    if "tasks" not in tables:
        op.create_table(
            "tasks",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("priority", sa.String(20), nullable=False, server_default="MEDIUM"),
            sa.Column("status", sa.String(20), nullable=False, server_default="TO_DO"),
            sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
            sa.Column("project", sa.String(120), nullable=True),
            sa.Column("assignee_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("creator_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "task_comments" not in tables:
        op.create_table(
            "task_comments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=False),
            sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("content", sa.String(2000), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "notifications" not in tables:
        op.create_table(
            "notifications",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("recipient_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("kind", sa.String(40), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("message", sa.String(1000), nullable=False),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "activity_logs" not in tables:
        op.create_table(
            "activity_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("entity_type", sa.String(40), nullable=False),
            sa.Column("entity_id", sa.Integer(), nullable=False),
            sa.Column("action", sa.String(60), nullable=False),
            sa.Column("details", sa.String(1000), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    for table, index_name, columns in [
        ("users", "ix_users_email", ["email"]),
        ("users", "ix_users_id", ["id"]),
        ("questions", "ix_questions_id", ["id"]),
        ("questions", "ix_questions_quiz_id", ["quiz_id"]),
        ("quizzes", "ix_quizzes_id", ["id"]),
        ("quiz_attempts", "ix_quiz_attempts_quiz_id", ["quiz_id"]),
        ("quiz_attempts", "ix_quiz_attempts_user_id", ["user_id"]),
        ("quiz_answers", "ix_quiz_answers_attempt_id", ["attempt_id"]),
        ("tasks", "ix_tasks_id", ["id"]),
        ("tasks", "ix_tasks_status", ["status"]),
        ("tasks", "ix_tasks_deadline", ["deadline"]),
        ("tasks", "ix_tasks_project", ["project"]),
        ("tasks", "ix_tasks_assignee_id", ["assignee_id"]),
        ("task_comments", "ix_task_comments_task_id", ["task_id"]),
        ("notifications", "ix_notifications_recipient_id", ["recipient_id"]),
        ("activity_logs", "ix_activity_logs_created_at", ["created_at"]),
    ]:
        _index(table, index_name, columns)


def downgrade():
    bind = op.get_bind()
    tables = _tables()
    for table in ("activity_logs", "notifications", "task_comments", "tasks", "quiz_answers", "quiz_attempts"):
        if table in tables:
            op.drop_table(table)
    if "questions" in tables:
        for column in ("closes_at", "available_at", "is_published", "points", "difficulty", "quiz_id"):
            if column in _columns("questions"):
                op.drop_column("questions", column)
    if "users" in tables and "role" in _columns("users"):
        op.drop_column("users", "role")
    if "quizzes" in tables:
        op.drop_table("quizzes")

"""Add learning paths, lessons, books, and student progress.

Revision ID: 0004_learning_content
Revises: 0003_user_profile_photo
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from datetime import datetime, timezone


revision = "0004_learning_content"
down_revision = "0003_user_profile_photo"
branch_labels = None
depends_on = None

RESOURCE_URL = "https://drive.google.com/file/d/13iWixi3LMokV_XfDYL2IZD-wSpe6zexw/view?usp=drive_link"


def upgrade():
    inspector = inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "learning_paths" not in tables:
        op.create_table(
            "learning_paths",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("slug", sa.String(120), nullable=False, unique=True),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("language", sa.String(80), nullable=False, server_default=""),
            sa.Column("framework", sa.String(100), nullable=False, server_default=""),
            sa.Column("difficulty", sa.String(20), nullable=False, server_default="BEGINNER"),
            sa.Column("prerequisites", sa.Text(), nullable=False, server_default=""),
            sa.Column("objectives", sa.Text(), nullable=False, server_default=""),
            sa.Column("recommended_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_learning_paths_slug", "learning_paths", ["slug"])
        op.create_index("ix_learning_paths_status", "learning_paths", ["status"])

    if "lessons" not in tables:
        op.create_table(
            "lessons",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("learning_path_id", sa.Integer(), sa.ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False),
            sa.Column("module_title", sa.String(160), nullable=False, server_default="General"),
            sa.Column("topic", sa.String(160), nullable=False, server_default=""),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("content", sa.Text(), nullable=False, server_default=""),
            sa.Column("explanation", sa.Text(), nullable=False, server_default=""),
            sa.Column("objectives", sa.Text(), nullable=False, server_default=""),
            sa.Column("difficulty", sa.String(20), nullable=False, server_default="BEGINNER"),
            sa.Column("recommended_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_lessons_learning_path_id", "lessons", ["learning_path_id"])
        op.create_index("ix_lessons_status", "lessons", ["status"])

    if "books" not in tables:
        op.create_table(
            "books",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("author", sa.String(160), nullable=False, server_default=""),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("technology", sa.String(120), nullable=False, server_default=""),
            sa.Column("difficulty", sa.String(20), nullable=False, server_default="BEGINNER"),
            sa.Column("cover_url", sa.String(2048), nullable=True),
            sa.Column("format", sa.String(40), nullable=False, server_default="LINK"),
            sa.Column("resource_url", sa.String(2048), nullable=False),
            sa.Column("reference_url", sa.String(2048), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_books_title", "books", ["title"])
        op.create_index("ix_books_status", "books", ["status"])

    if "learning_progress" not in tables:
        op.create_table(
            "learning_progress",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
            sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("last_position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", "lesson_id", name="one_progress_per_user_lesson"),
        )
        op.create_index("ix_learning_progress_user_id", "learning_progress", ["user_id"])
        op.create_index("ix_learning_progress_lesson_id", "learning_progress", ["lesson_id"])

    books = sa.table(
        "books",
        sa.column("title", sa.String),
        sa.column("author", sa.String),
        sa.column("description", sa.Text),
        sa.column("technology", sa.String),
        sa.column("difficulty", sa.String),
        sa.column("format", sa.String),
        sa.column("resource_url", sa.String),
        sa.column("status", sa.String),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    existing = op.get_bind().execute(
        sa.select(books.c.resource_url).where(books.c.resource_url == RESOURCE_URL)
    ).first()
    if existing is None:
        now = datetime.now(timezone.utc)
        op.get_bind().execute(
            books.insert().values(
                title="FastAPI Learning Resource",
                author="SigniAI",
                description="FastAPI learning material hosted on Google Drive. Access depends on the file owner's sharing permissions.",
                technology="Python · FastAPI",
                difficulty="BEGINNER",
                format="LINK",
                resource_url=RESOURCE_URL,
                status="PUBLISHED",
                created_at=now,
                updated_at=now,
            )
        )

    paths = sa.table(
        "learning_paths",
        sa.column("id", sa.Integer),
        sa.column("slug", sa.String),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("language", sa.String),
        sa.column("framework", sa.String),
        sa.column("difficulty", sa.String),
        sa.column("prerequisites", sa.Text),
        sa.column("objectives", sa.Text),
        sa.column("recommended_order", sa.Integer),
        sa.column("status", sa.String),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    lessons = sa.table(
        "lessons",
        sa.column("learning_path_id", sa.Integer),
        sa.column("module_title", sa.String),
        sa.column("topic", sa.String),
        sa.column("title", sa.String),
        sa.column("content", sa.Text),
        sa.column("explanation", sa.Text),
        sa.column("objectives", sa.Text),
        sa.column("difficulty", sa.String),
        sa.column("recommended_order", sa.Integer),
        sa.column("status", sa.String),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    starter_paths = [
        ("python", "Python Backend", "Build a strong foundation, then create APIs with FastAPI.", "Python", "FastAPI", "BEGINNER", [
            ("Programming foundations", "Variables, types, conditions, loops, functions and collections."),
            ("Python essentials", "Modules, exceptions, files, virtual environments and packages."),
            ("HTTP & REST APIs", "Requests, responses, status codes, JSON and REST conventions."),
            ("FastAPI foundations", "Routes, Pydantic validation, dependency injection and API docs."),
            ("Databases", "SQL, PostgreSQL, SQLAlchemy, relationships and migrations."),
            ("Authentication & security", "Password hashing, JWT, authorization, validation and secrets."),
            ("Testing & deployment", "Pytest, environment variables, Git, CI basics and deployment."),
        ]),
        ("node", "JavaScript & Node.js", "Use JavaScript on the server and ship REST APIs with Express.", "JavaScript", "Node.js · Express", "BEGINNER", [
            ("JavaScript basics", "Variables, functions, arrays, objects, modules and async code."),
            ("Node.js runtime", "npm, package.json, environment variables and file structure."),
            ("HTTP & Express", "Routes, middleware, controllers, error handling and validation."),
            ("Database integration", "SQL basics, PostgreSQL, queries and transactions."),
            ("Authentication & security", "Sessions or JWT, password hashing, permissions and safe input."),
            ("Testing & deployment", "API tests, logging, Git workflows and production configuration."),
        ]),
        ("typescript", "TypeScript & NestJS", "Build maintainable services with types and modular architecture.", "TypeScript", "NestJS", "INTERMEDIATE", [
            ("TypeScript essentials", "Types, interfaces, generics, unions and strict mode."),
            ("Node project setup", "Modules, npm scripts, configuration and async patterns."),
            ("NestJS architecture", "Modules, controllers, providers, DTOs and dependency injection."),
            ("Data & security", "ORM patterns, validation, guards, JWT and permissions."),
            ("Quality & delivery", "Unit tests, API docs, logging and deployment."),
        ]),
        ("java", "Java & Spring Boot", "Learn enterprise backend patterns and production-ready services.", "Java", "Spring Boot", "INTERMEDIATE", [
            ("Java foundations", "Types, classes, methods, collections and exceptions."),
            ("OOP & project structure", "Encapsulation, interfaces, packages and Maven or Gradle."),
            ("Spring Boot APIs", "Controllers, services, repositories and DTO validation."),
            ("Persistence & security", "JPA, SQL, authentication, authorization and configuration."),
            ("Testing & deployment", "JUnit, integration tests, logs and deployment basics."),
        ]),
    ]
    for path_order, (slug, title, description, language, framework, difficulty, topics) in enumerate(starter_paths):
        path_row = op.get_bind().execute(sa.select(paths.c.id).where(paths.c.slug == slug)).first()
        if path_row:
            continue
        now = datetime.now(timezone.utc)
        op.get_bind().execute(paths.insert().values(
            slug=slug,
            title=title,
            description=description,
            language=language,
            framework=framework,
            difficulty=difficulty,
            prerequisites="Programming basics, Git and basic HTTP familiarity.",
            objectives=f"Build a practical backend foundation in {language} and {framework}.",
            recommended_order=path_order,
            status="PUBLISHED",
            created_at=now,
            updated_at=now,
        ))
        path_id = op.get_bind().execute(
            sa.select(paths.c.id).where(paths.c.slug == slug)
        ).scalar_one()
        op.get_bind().execute(lessons.insert(), [
            {
                "learning_path_id": path_id,
                "module_title": "Core curriculum",
                "topic": title,
                "title": lesson_title,
                "content": f"## {lesson_title}\n\n{description}\n\n### Practice\n\nBuild a small example, test a normal case and an error case, then explain what you learned.",
                "explanation": description,
                "objectives": f"Understand and practise: {description}",
                "difficulty": difficulty,
                "recommended_order": lesson_order,
                "status": "PUBLISHED",
                "created_at": now,
                "updated_at": now,
            }
            for lesson_order, (lesson_title, description) in enumerate(topics)
        ])


def downgrade():
    op.drop_index("ix_learning_progress_lesson_id", table_name="learning_progress")
    op.drop_index("ix_learning_progress_user_id", table_name="learning_progress")
    op.drop_table("learning_progress")
    op.drop_index("ix_books_status", table_name="books")
    op.drop_index("ix_books_title", table_name="books")
    op.drop_table("books")
    op.drop_index("ix_lessons_status", table_name="lessons")
    op.drop_index("ix_lessons_learning_path_id", table_name="lessons")
    op.drop_table("lessons")
    op.drop_index("ix_learning_paths_status", table_name="learning_paths")
    op.drop_index("ix_learning_paths_slug", table_name="learning_paths")
    op.drop_table("learning_paths")

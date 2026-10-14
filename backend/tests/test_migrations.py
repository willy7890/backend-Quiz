import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def test_initial_migration_preserves_existing_fastquiz_rows(tmp_path):
    backend_dir = Path(__file__).resolve().parents[1]
    database_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(database_path)
    connection.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            display_name VARCHAR(80) NOT NULL,
            password_hash VARCHAR(255),
            google_sub VARCHAR(255) UNIQUE,
            is_active BOOLEAN NOT NULL
        );
        CREATE TABLE questions (
            id INTEGER PRIMARY KEY,
            title VARCHAR(500) NOT NULL,
            topic VARCHAR(100) NOT NULL,
            explanation VARCHAR(1000) NOT NULL,
            correct_option_id INTEGER NOT NULL
        );
        CREATE TABLE options (
            id INTEGER PRIMARY KEY,
            question_id INTEGER NOT NULL REFERENCES questions(id),
            label VARCHAR(1) NOT NULL,
            text VARCHAR(300) NOT NULL
        );
        CREATE TABLE votes (
            id INTEGER PRIMARY KEY,
            question_id INTEGER NOT NULL REFERENCES questions(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            participant_name VARCHAR(80) NOT NULL,
            option_id INTEGER NOT NULL REFERENCES options(id),
            is_correct INTEGER NOT NULL,
            points INTEGER NOT NULL,
            CONSTRAINT one_vote_per_question_user UNIQUE (question_id, user_id)
        );
        INSERT INTO users VALUES (1, 'legacy@example.com', 'Legacy', NULL, NULL, 1);
        INSERT INTO questions VALUES (1, 'Legacy question', 'Testing', 'Explanation', 1);
        INSERT INTO options VALUES (1, 1, 'A', 'Answer');
        INSERT INTO votes VALUES (1, 1, 1, 'Legacy', 1, 1, 10);
        """
    )
    connection.commit()
    connection.close()

    environment = os.environ.copy()
    environment["DATABASE_URL"] = f"sqlite:///{database_path}"
    environment["JWT_SECRET"] = "migration-test-secret-" + ("z" * 40)
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_dir,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )

    connection = sqlite3.connect(database_path)
    assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM questions").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM options").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM votes").fetchone()[0] == 1
    assert connection.execute("SELECT role FROM users WHERE id=1").fetchone()[0] == "MEMBER"
    assert connection.execute("SELECT is_published FROM questions WHERE id=1").fetchone()[0] == 1
    assert connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='invitations'"
    ).fetchone()[0] == "invitations"
    connection.close()

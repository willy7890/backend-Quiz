import os
import sys
import tempfile
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
fd, _database_path = tempfile.mkstemp(prefix="fastquiz-tests-", suffix=".db")
os.close(fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_database_path}"
os.environ["JWT_SECRET"] = "test-only-secret-" + ("x" * 40)

from app.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

config = Config(str(BACKEND_DIR / "alembic.ini"))
command.upgrade(config, "head")


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client
    engine.dispose()
    Path(_database_path).unlink(missing_ok=True)
    Path(f"{_database_path}-journal").unlink(missing_ok=True)
    Path(f"{_database_path}-wal").unlink(missing_ok=True)
    Path(f"{_database_path}-shm").unlink(missing_ok=True)


@pytest.fixture
def register(client):
    def create_account(role="MEMBER"):
        import uuid

        response = client.post(
            "/api/auth/register",
            json={
                "email": f"{uuid.uuid4().hex}@example.com",
                "display_name": "Quiz User",
                "password": "valid-test-password",
            },
        )
        assert response.status_code == 200
        data = response.json()
        if role != "MEMBER":
            from app.models import User

            db = SessionLocal()
            account = db.query(User).filter_by(id=data["user"]["id"]).one()
            account.role = role
            db.commit()
            db.close()
            data["user"]["role"] = role
        return data

    return create_account


@pytest.fixture
def auth_headers(register):
    def headers(role="MEMBER"):
        data = register(role)
        return {"Authorization": f"Bearer {data['access_token']}"}, data["user"]

    return headers

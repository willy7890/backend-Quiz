import atexit
import os
import tempfile


_database_directory = tempfile.TemporaryDirectory(prefix="signiai-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_database_directory.name}/test.db"
os.environ["JWT_SECRET"] = "winner-test-secret-that-is-at-least-thirty-two-characters"
os.environ["COMPUTER_REWARD_POINTS"] = "20"

from fastapi.testclient import TestClient
import pytest

from app.database import Base, engine
from app.main import app


def _cleanup_database():
    engine.dispose()
    _database_directory.cleanup()


atexit.register(_cleanup_database)


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client

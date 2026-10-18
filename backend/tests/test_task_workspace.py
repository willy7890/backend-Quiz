from app.auth import make_token
from app.database import SessionLocal
from app.models import User


def test_task_workspace_data_endpoints_require_authenticated_user(client):
    db = SessionLocal()
    try:
        user = User(
            email="workspace@example.test",
            display_name="Workspace Member",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        headers = {"Authorization": f"Bearer {make_token(user)}"}

        assert client.get("/api/tasks", headers=headers).json() == []
        assert client.get("/api/notifications", headers=headers).json() == []
        assert client.get("/api/quizzes/me/attempts", headers=headers).json() == []
        assert client.get("/api/quizzes/me/attempts").status_code == 401
    finally:
        db.close()

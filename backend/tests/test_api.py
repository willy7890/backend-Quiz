def test_registration_and_role_protected_authoring(client, auth_headers):
    member_headers, member = auth_headers()
    assert member["role"] == "MEMBER"
    assert client.post("/api/quizzes", json={}, headers=member_headers).status_code == 403
    assert client.post("/api/tasks", json={}, headers=member_headers).status_code == 403


def test_quiz_authoring_submission_and_result_scoring(client, auth_headers):
    admin_headers, _ = auth_headers("ADMIN")
    member_headers, member = auth_headers()
    created = client.post(
        "/api/quizzes",
        headers=admin_headers,
        json={
            "title": "API Test Quiz",
            "description": "Checks trusted server scoring.",
            "category": "Testing",
            "difficulty": "BEGINNER",
            "questions": [
                {
                    "title": "Which answer is correct?",
                    "explanation": "The first answer is correct.",
                    "points": 7,
                    "options": ["Correct", "Incorrect"],
                    "correct_option_index": 0,
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    quiz_id = created.json()["id"]
    assert client.patch(f"/api/quizzes/{quiz_id}/publish", json={"is_published": True}, headers=admin_headers).status_code == 200

    public_quiz = client.get(f"/api/quizzes/{quiz_id}", headers=member_headers)
    assert public_quiz.status_code == 200
    question = public_quiz.json()["questions"][0]
    assert "correct_option_id" not in question

    started = client.post(f"/api/quizzes/{quiz_id}/start", headers=member_headers)
    assert started.status_code == 201
    result = client.post(
        f"/api/quizzes/{quiz_id}/submit",
        headers=member_headers,
        json={"answers": [{"question_id": question["id"], "option_id": question["options"][0]["id"]}]},
    )
    assert result.status_code == 201, result.text
    assert result.json()["score"] == 7
    assert result.json()["max_score"] == 7
    assert result.json()["answers"][0]["is_correct"] is True
    assert client.post(
        f"/api/quizzes/{quiz_id}/submit",
        headers=member_headers,
        json={"answers": [{"question_id": question["id"], "option_id": question["options"][0]["id"]}]},
    ).status_code == 409
    leaderboard = client.get("/api/leaderboard").json()
    assert next(player for player in leaderboard if player["name"] == member["display_name"])["points"] == 7


def test_task_assignment_progress_notifications_and_permissions(client, auth_headers):
    admin_headers, _ = auth_headers("ADMIN")
    member_headers, member = auth_headers()
    other_headers, _ = auth_headers()
    created = client.post(
        "/api/tasks",
        headers=admin_headers,
        json={
            "title": "Review API contract",
            "description": "Verify the request and response shape.",
            "priority": "HIGH",
            "project": "Backend",
            "assignee_id": member["id"],
        },
    )
    assert created.status_code == 201, created.text
    task_id = created.json()["id"]

    assert client.get(f"/api/tasks/{task_id}", headers=other_headers).status_code == 403
    task_list = client.get("/api/tasks", headers=member_headers)
    assert task_list.status_code == 200
    assert [task["id"] for task in task_list.json()] == [task_id]

    status = client.patch(
        f"/api/tasks/{task_id}/status",
        headers=member_headers,
        json={"status": "IN_PROGRESS"},
    )
    assert status.status_code == 200
    assert status.json()["status"] == "IN_PROGRESS"
    comment = client.post(
        f"/api/tasks/{task_id}/comments",
        headers=member_headers,
        json={"content": "Started reviewing the contract."},
    )
    assert comment.status_code == 201
    assert client.get(f"/api/tasks/{task_id}/comments", headers=member_headers).json()[0]["content"] == "Started reviewing the contract."
    notifications = client.get("/api/notifications", headers=member_headers).json()
    assert any(item["kind"] == "task_assigned" for item in notifications)
    assert client.get("/api/admin/report", headers=admin_headers).status_code == 200


def test_practice_answer_key_is_not_public(client, auth_headers):
    member_headers, _ = auth_headers()
    questions = client.get("/api/questions").json()
    assert questions
    question_id = questions[0]["id"]
    assert "correct_option_id" not in questions[0]
    assert client.get(f"/api/results/{question_id}").status_code == 401
    assert client.get(f"/api/results/{question_id}", headers=member_headers).status_code == 403

    from app.models import Question

    db = __import__("app.database", fromlist=["SessionLocal"]).SessionLocal()
    question = db.query(Question).filter_by(id=question_id).one()
    answer = question.correct_option_id
    db.close()
    vote = client.post(
        f"/api/questions/{question_id}/vote",
        headers=member_headers,
        json={"option_id": answer},
    )
    assert vote.status_code == 200
    results = client.get(f"/api/results/{question_id}", headers=member_headers)
    assert results.status_code == 200
    assert results.json()["correct_option_id"] == answer


def test_only_super_admin_can_assign_roles_and_last_owner_is_protected(client, auth_headers):
    admin_headers, _ = auth_headers("ADMIN")
    super_admin_headers, super_admin = auth_headers("SUPER_ADMIN")
    member_headers, member = auth_headers()

    assert client.put(
        f"/api/admin/users/{member['id']}/role",
        headers=admin_headers,
        json={"role": "ADMIN"},
    ).status_code == 403
    changed = client.put(
        f"/api/admin/users/{member['id']}/role",
        headers=super_admin_headers,
        json={"role": "ADMIN"},
    )
    assert changed.status_code == 200
    assert changed.json()["role"] == "ADMIN"
    removed_last_owner = client.put(
        f"/api/admin/users/{super_admin['id']}/role",
        headers=super_admin_headers,
        json={"role": "MEMBER"},
    )
    assert removed_last_owner.status_code == 409


def test_member_invitations_are_single_use_and_email_bound(client, auth_headers):
    admin_headers, _ = auth_headers("ADMIN")
    member_headers, _ = auth_headers()
    assert client.post(
        "/api/admin/invitations",
        headers=member_headers,
        json={"email": "invited@example.com"},
    ).status_code == 403

    response = client.post(
        "/api/admin/invitations",
        headers=admin_headers,
        json={"email": "Invited@example.com"},
    )
    assert response.status_code == 201, response.text
    invitation = response.json()
    assert invitation["email"] == "invited@example.com"

    invalid = client.post(
        "/api/auth/register",
        json={
            "email": "other@example.com",
            "display_name": "Other User",
            "password": "valid-test-password",
            "invitation_code": invitation["invitation_code"],
        },
    )
    assert invalid.status_code == 400

    registered = client.post(
        "/api/auth/register",
        json={
            "email": invitation["email"],
            "display_name": "Invited User",
            "password": "valid-test-password",
            "invitation_code": invitation["invitation_code"],
        },
    )
    assert registered.status_code == 200, registered.text
    assert registered.json()["user"]["role"] == "MEMBER"

    from app.database import SessionLocal
    from app.models import Invitation

    db = SessionLocal()
    stored_invitation = db.query(Invitation).one()
    assert stored_invitation.token_hash != invitation["invitation_code"]
    assert stored_invitation.accepted_at is not None
    db.close()


def test_only_super_admin_can_deactivate_accounts_and_last_owner_is_protected(client, auth_headers):
    admin_headers, _ = auth_headers("ADMIN")
    super_admin_headers, super_admin = auth_headers("SUPER_ADMIN")
    member_headers, member = auth_headers()

    assert client.put(
        f"/api/admin/users/{member['id']}/active",
        headers=admin_headers,
        json={"is_active": False},
    ).status_code == 403
    assert client.put(
        f"/api/admin/users/{super_admin['id']}/active",
        headers=super_admin_headers,
        json={"is_active": False},
    ).status_code == 409

    deactivated = client.put(
        f"/api/admin/users/{member['id']}/active",
        headers=super_admin_headers,
        json={"is_active": False},
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False
    assert client.get("/api/auth/me", headers=member_headers).status_code == 401

from app.auth import make_token
from app.database import SessionLocal
from app.models import User


def create_headers(client, role="MEMBER"):
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"{role.lower()}-catalog@example.com",
            "display_name": f"{role.title()} Catalog",
            "password": "catalog-test-password",
        },
    )
    assert response.status_code == 200, response.text
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == f"{role.lower()}-catalog@example.com").one()
        user.role = role
        db.commit()
        return {"Authorization": f"Bearer {make_token(user)}"}
    finally:
        db.close()


def test_learning_catalog_public_content_and_admin_permissions(client):
    member_headers = create_headers(client)
    admin_headers = create_headers(client, "ADMIN")

    assert client.get("/api/admin/learning-media").status_code == 401
    assert client.get("/api/admin/learning-media", headers=member_headers).status_code == 403

    course = client.post(
        "/api/admin/learning-paths",
        headers=admin_headers,
        json={
            "slug": "catalog-python",
            "title": "Catalog Python",
            "description": "A searchable course",
            "category": "Python Backend",
            "thumbnail_url": "https://cdn.example.test/python.jpg",
            "instructor": "SigniAI",
            "duration_minutes": 90,
            "status": "PUBLISHED",
        },
    )
    assert course.status_code == 201, course.text
    course_id = course.json()["id"]
    course_listing = client.get("/api/learning/courses?category=Python%20Backend")
    assert course_listing.status_code == 200
    assert course_listing.json()[0]["id"] == course_id
    assert course_listing.json()[0]["thumbnail_url"] == "https://cdn.example.test/python.jpg"
    lesson = client.post(
        "/api/admin/lessons",
        headers=admin_headers,
        json={
            "learning_path_id": course_id,
            "module_title": "API foundations",
            "title": "Build a route",
            "content": "Lesson notes",
            "code_example": "return {'ready': True}",
            "resources": ["https://fastapi.tiangolo.com/"],
            "recommended_order": 1,
            "status": "PUBLISHED",
        },
    )
    assert lesson.status_code == 201, lesson.text
    course_detail = client.get(f"/api/learning/courses/{course_id}")
    assert course_detail.status_code == 200
    assert course_detail.json()["lessons"][0]["code_example"] == "return {'ready': True}"
    assert course_detail.json()["lessons"][0]["resources"] == ["https://fastapi.tiangolo.com/"]

    media = {
        "kind": "COURSE_VIDEO",
        "title": "FastAPI dependency tips",
        "description": "A concise walkthrough",
        "caption": "",
        "category": "FastAPI",
        "thumbnail_url": None,
        "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "duration_seconds": 300,
        "difficulty": "BEGINNER",
        "instructor": "SigniAI",
        "creator": "",
        "notes": "Review dependency injection",
        "resources": ["https://fastapi.tiangolo.com/"],
        "tags": ["fastapi", "python"],
        "status": "PUBLISHED",
    }
    created_media = client.post(
        "/api/admin/learning-media", headers=admin_headers, json=media
    )
    assert created_media.status_code == 201, created_media.text
    video_id = created_media.json()["id"]
    videos = client.get("/api/learning/course-videos?page=1&limit=1")
    assert videos.status_code == 200
    assert videos.json()["total"] == 1
    assert videos.json()["items"][0]["id"] == video_id
    assert videos.json()["items"][0]["provider"] == "youtube"
    assert videos.json()["items"][0]["video_embed_url"].endswith("dQw4w9WgXcQ")
    assert videos.json()["items"][0]["code_example"] == ""
    assert client.get(f"/api/learning/course-videos/{video_id}").status_code == 200

    media.update(kind="SHORT", title="One-minute SQL tip", category="SQL")
    created_short = client.post(
        "/api/admin/learning-media", headers=admin_headers, json=media
    )
    assert created_short.status_code == 201, created_short.text
    shorts = client.get("/api/learning/shorts?page=1&limit=1")
    assert shorts.status_code == 200
    assert shorts.json()["total"] == 1
    assert shorts.json()["items"][0]["kind"] == "SHORT"

    draft = client.post(
        "/api/admin/learning-media",
        headers=admin_headers,
        json={**media, "title": "Draft short", "status": "DRAFT"},
    )
    assert draft.status_code == 201
    assert client.get("/api/learning/shorts").json()["total"] == 1


def test_admin_media_api_normalizes_providers_and_returns_player_metadata(client):
    admin_headers = create_headers(client, "ADMIN")
    cases = [
        (
            "https://www.tiktok.com/@creator/video/7351234567890123456?lang=en",
            "https://www.tiktok.com/@creator/video/7351234567890123456",
            "tiktok",
            "tiktok.com/player/v1/7351234567890123456",
        ),
        (
            "https://www.instagram.com/reel/ABC123_xyz/?igsh=tracking",
            "https://www.instagram.com/reel/ABC123_xyz/",
            "instagram",
            "instagram.com/reel/ABC123_xyz/embed/captioned/",
        ),
        (
            "https://www.linkedin.com/posts/creator_activity-1234567890123456789-post?utm_source=share",
            "https://www.linkedin.com/posts/creator_activity-1234567890123456789-post",
            "linkedin",
            "urn:li:activity:1234567890123456789",
        ),
        (
            "https://cdn.example.com/tutorial.mp4?signature=abc",
            "https://cdn.example.com/tutorial.mp4?signature=abc",
            "direct",
            None,
        ),
    ]
    for index, (url, normalized, provider, embed_fragment) in enumerate(cases):
        response = client.post(
            "/api/admin/learning-media",
            headers=admin_headers,
            json={
                "kind": "COURSE_VIDEO",
                "title": f"Provider API test {index}",
                "category": "Backend Concepts",
                "video_url": url,
                "code_example": "print('provider metadata')",
                "status": "PUBLISHED",
            },
        )
        assert response.status_code == 201, response.text
        result = response.json()
        assert result["video_url"] == normalized
        assert result["provider"] == provider
        assert result["code_example"] == "print('provider metadata')"
        if embed_fragment:
            assert embed_fragment in result["video_embed_url"]
        else:
            assert result["video_embed_url"] is None


def test_public_https_pdf_books_receive_an_inline_preview_url(client):
    admin_headers = create_headers(client, "ADMIN")
    response = client.post(
        "/api/admin/books",
        headers=admin_headers,
        json={
            "title": "Inline PDF preview",
            "format": "PDF",
            "resource_url": "https://cdn.example.com/resources/backend-guide.pdf?signature=public",
            "status": "PUBLISHED",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["preview_url"] == response.json()["resource_url"]


def test_learning_media_rejects_non_https_urls(client):
    admin_headers = create_headers(client, "ADMIN")
    response = client.post(
        "/api/admin/learning-media",
        headers=admin_headers,
        json={
            "kind": "SHORT",
            "title": "Unsafe URL test",
            "category": "Security",
            "video_url": "http://example.test/video.mp4",
        },
    )
    assert response.status_code == 422

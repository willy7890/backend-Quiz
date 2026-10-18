import pytest
from pydantic import ValidationError

from app.media_urls import video_metadata
from app.schemas import LearningMediaInput


@pytest.mark.parametrize(
    ("url", "provider", "embed_fragment"),
    [
        (
            "https://youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
            "youtube",
            "youtube-nocookie.com/embed/dQw4w9WgXcQ",
        ),
        (
            "https://youtube.com/shorts/dQw4w9WgXcQ",
            "youtube",
            "youtube-nocookie.com/embed/dQw4w9WgXcQ",
        ),
        (
            "https://www.tiktok.com/@creator/video/7351234567890123456",
            "tiktok",
            "tiktok.com/player/v1/7351234567890123456",
        ),
        (
            "https://www.instagram.com/reel/ABC123_xyz/",
            "instagram",
            "instagram.com/reel/ABC123_xyz/embed/captioned/",
        ),
        (
            "https://www.instagram.com/p/ABC123_xyz/",
            "instagram",
            "instagram.com/p/ABC123_xyz/embed/captioned/",
        ),
        (
            "https://www.linkedin.com/posts/creator_activity-1234567890123456789-post",
            "linkedin",
            "urn:li:activity:1234567890123456789",
        ),
        (
            "https://cdn.example.com/lesson.mp4?signature=abc#player",
            "direct",
            "",
        ),
    ],
)
def test_detects_supported_video_providers(url, provider, embed_fragment):
    result = video_metadata(url)
    assert result["provider"] == provider
    if embed_fragment:
        assert embed_fragment in result["embed_url"]
    else:
        assert result["embed_url"] is None


@pytest.mark.parametrize(
    "url",
    [
        "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=short",
        "https://www.tiktok.com/t/ZT2xShort/",
        "https://www.instagram.com/accounts/login/",
        "https://www.linkedin.com/in/someone/",
        "https://localhost/video.mp4",
        "https://127.0.0.1/video.mp4",
        "https://example.com/not-a-video",
    ],
)
def test_rejects_unsupported_or_nonpublic_video_urls(url):
    with pytest.raises(ValueError):
        video_metadata(url)


def test_learning_media_schema_normalizes_video_urls():
    media = LearningMediaInput(
        kind="COURSE_VIDEO",
        title="Provider test",
        category="FastAPI",
        video_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
    )
    assert media.video_url == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert video_metadata(media.video_url)["provider"] == "youtube"


def test_learning_media_schema_rejects_invalid_video_url():
    with pytest.raises(ValidationError):
        LearningMediaInput(
            kind="SHORT",
            title="Invalid video",
            category="Security",
            video_url="https://example.com/not-a-video",
        )

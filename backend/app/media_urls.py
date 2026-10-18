import re
from urllib.parse import parse_qs, urlsplit, urlunsplit


VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogg"}
PLATFORM_HOSTS = {
    "youtube": {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"},
    "tiktok": {"tiktok.com", "www.tiktok.com"},
    "instagram": {"instagram.com", "www.instagram.com"},
    "linkedin": {"linkedin.com", "www.linkedin.com"},
}


def _parse_public_https_url(value: str):
    try:
        parsed = urlsplit(value.strip())
        port = parsed.port
    except ValueError as error:
        raise ValueError("Enter a valid HTTPS video URL") from error
    host = (parsed.hostname or "").lower().rstrip(".")
    if (
        parsed.scheme.lower() != "https"
        or not host
        or parsed.username
        or parsed.password
        or port not in (None, 443)
        or host == "localhost"
        or host.endswith(".localhost")
        or re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host)
        or ":" in host
    ):
        raise ValueError("Video URLs must use a public HTTPS host")
    return parsed, host


def video_metadata(value: str):
    parsed, host = _parse_public_https_url(value)
    path = parsed.path.rstrip("/") or "/"
    query = parse_qs(parsed.query)
    if (
        host.endswith((".localhost", ".local", ".internal"))
        or not re.fullmatch(
            r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
            r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+",
            host,
        )
        or all(
            re.fullmatch(r"(?:\d+|0x[0-9a-f]+)", label)
            for label in host.split(".")
        )
    ):
        raise ValueError("Video URLs must use a public host")

    if host in PLATFORM_HOSTS["youtube"]:
        video_id = None
        is_short = False
        if host == "youtu.be":
            video_id = path.strip("/").split("/", 1)[0]
        elif path == "/watch":
            video_id = query.get("v", [None])[0]
        else:
            match = re.fullmatch(r"/(embed|shorts)/([A-Za-z0-9_-]{11})", path)
            if match:
                video_id = match.group(2)
                is_short = match.group(1) == "shorts"
        if not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            raise ValueError("Enter a valid YouTube video or Shorts URL")
        normalized = (
            f"https://www.youtube.com/shorts/{video_id}"
            if is_short
            else f"https://www.youtube.com/watch?v={video_id}"
        )
        return {
            "provider": "youtube",
            "normalized_url": normalized,
            "embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}",
        }

    if host in PLATFORM_HOSTS["tiktok"]:
        match = re.fullmatch(r"/@([A-Za-z0-9._-]+)/video/(\d+)", path)
        if not match:
            raise ValueError("Use a full public TikTok video URL, not a shortened link")
        username, video_id = match.groups()
        return {
            "provider": "tiktok",
            "normalized_url": f"https://www.tiktok.com/@{username}/video/{video_id}",
            "embed_url": f"https://www.tiktok.com/player/v1/{video_id}",
        }

    if host in PLATFORM_HOSTS["instagram"]:
        match = re.fullmatch(r"/(reel|p|tv)/([A-Za-z0-9_-]+)", path)
        if not match:
            raise ValueError("Enter a supported public Instagram Reel or post URL")
        post_type, post_id = match.groups()
        return {
            "provider": "instagram",
            "normalized_url": f"https://www.instagram.com/{post_type}/{post_id}/",
            "embed_url": f"https://www.instagram.com/{post_type}/{post_id}/embed/captioned/",
        }

    if host in PLATFORM_HOSTS["linkedin"]:
        if path.startswith("/feed/update/"):
            match = re.fullmatch(
                r"/feed/update/(urn:li:(?:activity|share):\d+)", path
            )
            urn = match.group(1) if match else None
        elif path.startswith("/posts/"):
            match = re.search(r"(?:^|[_-])activity-(\d+)", path)
            urn = f"urn:li:activity:{match.group(1)}" if match else None
        else:
            urn = None
        if not path.startswith(("/feed/update/", "/posts/")):
            raise ValueError("Enter a public LinkedIn post URL")
        return {
            "provider": "linkedin",
            "normalized_url": urlunsplit(("https", "www.linkedin.com", path, "", "")),
            "embed_url": (
                f"https://www.linkedin.com/embed/feed/update/{urn}?compact=1"
                if urn
                else None
            ),
        }

    extension = next(
        (extension for extension in VIDEO_EXTENSIONS if path.lower().endswith(extension)),
        None,
    )
    if extension:
        normalized = urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, ""))
        return {
            "provider": "direct",
            "normalized_url": normalized,
            "embed_url": None,
        }

    raise ValueError(
        "Use a supported YouTube, TikTok, Instagram, LinkedIn, or direct MP4/WebM/OGG URL"
    )

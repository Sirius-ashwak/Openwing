"""GitHub repository fetching: URL parsing, validation, async git clone."""
from __future__ import annotations

import asyncio
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse

# Matches: github.com/owner/repo  (with or without https://, with or without .git)
_GITHUB_RE = re.compile(
    r"^(?:https?://)?github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+?)(?:\.git)?(?:/.*)?$",
    re.IGNORECASE,
)

# Allowed characters in owner/repo names (GitHub's own rules)
_SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


class GitHubURLError(ValueError):
    pass


def parse_github_url(raw: str) -> tuple[str, str]:
    """Return (owner, repo) from a GitHub URL or raise GitHubURLError."""
    raw = raw.strip()
    if not raw:
        raise GitHubURLError("Empty URL")

    m = _GITHUB_RE.match(raw)
    if not m:
        raise GitHubURLError(
            f"Not a recognized GitHub repository URL: {raw!r}. "
            "Expected format: github.com/owner/repo"
        )

    owner, repo = m.group(1), m.group(2)

    # Paranoid: ensure no shell injection even though we never use shell=True
    if not _SAFE_NAME_RE.match(owner) or not _SAFE_NAME_RE.match(repo):
        raise GitHubURLError(f"Unsafe characters in owner={owner!r} or repo={repo!r}")

    return owner, repo


def is_github_url(raw: str) -> bool:
    try:
        parse_github_url(raw)
        return True
    except GitHubURLError:
        return False


def to_clone_url(raw: str) -> str:
    """Normalize any GitHub URL variant to https://github.com/owner/repo.git"""
    owner, repo = parse_github_url(raw)
    return f"https://github.com/{owner}/{repo}.git"


async def clone_repo(raw_url: str, *, timeout_s: int = 120) -> Path:
    """Clone a GitHub repository to a fresh temp directory.

    Returns the path to the cloned directory.
    Caller MUST call cleanup_clone(path) when done.
    Raises RuntimeError on clone failure, TimeoutError on timeout.
    """
    clone_url = to_clone_url(raw_url)
    tmp = Path(tempfile.mkdtemp(prefix="janus_clone_"))

    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "clone", "--depth=1", "--quiet", clone_url, str(tmp),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout_s
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            raise TimeoutError(
                f"git clone timed out after {timeout_s}s for {clone_url}"
            )

        if proc.returncode != 0:
            err = stderr.decode(errors="replace").strip()
            raise RuntimeError(
                f"git clone failed (exit {proc.returncode}) for {clone_url}: {err}"
            )

        return tmp

    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


def cleanup_clone(path: Path | None) -> None:
    """Remove a cloned temp directory, ignoring errors."""
    if path is not None:
        shutil.rmtree(path, ignore_errors=True)

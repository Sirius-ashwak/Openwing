"""SBOM-lite: cryptographic manifest of scanned source files."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from janus import __version__


def _file_sha256(path: Path) -> str:
    """Compute hex SHA-256 digest of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def generate_manifest(
    files: list[Path],
    *,
    run_id: str | None = None,
) -> dict[str, Any]:
    """Produce a lightweight SBOM manifest for scanned files.

    Format:
        {
            "janus_version": "0.1.0",
            "run_id": "...",
            "timestamp": "ISO8601",
            "files": [
                {"path": "relative/path.py", "sha256": "abc...", "size_bytes": 1234}
            ]
        }
    """
    run_id = run_id or uuid.uuid4().hex[:12]

    entries: list[dict[str, Any]] = []
    for f in files:
        resolved = f.resolve()
        if not resolved.is_file():
            continue
        entries.append({
            "path": str(f),
            "sha256": _file_sha256(resolved),
            "size_bytes": resolved.stat().st_size,
        })

    return {
        "janus_version": __version__,
        "run_id": run_id,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "files": entries,
    }

"""Workspace discovery helpers for batched remediation."""

from __future__ import annotations

from pathlib import Path

_SKIP_DIR_NAMES = frozenset({
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "venv",
    ".tox",
    ".mypy_cache",
    "__pycache__",
    ".pytest_cache",
    "node_modules",
    "dist",
    "build",
    ".eggs",
})


def iter_python_files(
    root: Path,
    *,
    max_files: int = 200,
) -> list[Path]:
    """Walk `root` yielding up to `max_files` ``*.py`` paths, skipping common junk."""

    root = root.resolve()
    if root.is_file():
        return [root] if root.suffix == ".py" else []

    if not root.is_dir():
        raise NotADirectoryError(str(root))

    found: list[Path] = []

    def should_skip(candidate: Path) -> bool:
        parts = candidate.parts
        return any(seg in _SKIP_DIR_NAMES for seg in parts) or any(
            seg.endswith(".egg-info") for seg in parts
        )

    for candidate in sorted(root.rglob("*.py")):
        if should_skip(candidate):
            continue
        found.append(candidate)
        if len(found) >= max_files:
            break

    return found

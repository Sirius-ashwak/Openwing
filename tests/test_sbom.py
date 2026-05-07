"""SBOM-lite manifest tests."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from janus.sbom import generate_manifest, _file_sha256


def test_file_sha256_correctness(tmp_path: Path) -> None:
    """Digest matches known hashlib output."""
    content = b"hello world\n"
    f = tmp_path / "test.txt"
    f.write_bytes(content)

    expected = hashlib.sha256(content).hexdigest()
    assert _file_sha256(f) == expected


def test_manifest_schema(tmp_path: Path) -> None:
    """Required keys are present in manifest output."""
    (tmp_path / "a.py").write_text("x = 1\n", encoding="utf-8")
    (tmp_path / "b.py").write_text("y = 2\n", encoding="utf-8")

    files = [tmp_path / "a.py", tmp_path / "b.py"]
    manifest = generate_manifest(files, run_id="test123")

    assert manifest["janus_version"] == "0.1.0"
    assert manifest["run_id"] == "test123"
    assert "timestamp" in manifest
    assert len(manifest["files"]) == 2

    for entry in manifest["files"]:
        assert "path" in entry
        assert "sha256" in entry
        assert "size_bytes" in entry
        assert len(entry["sha256"]) == 64  # hex SHA-256


def test_manifest_skips_missing_files(tmp_path: Path) -> None:
    """Non-existent files are silently skipped."""
    real = tmp_path / "real.py"
    real.write_text("z = 3\n", encoding="utf-8")
    fake = tmp_path / "does_not_exist.py"

    manifest = generate_manifest([real, fake])
    assert len(manifest["files"]) == 1


def test_manifest_serializable(tmp_path: Path) -> None:
    """Manifest can be serialized to JSON without errors."""
    (tmp_path / "x.py").write_text("pass\n", encoding="utf-8")
    manifest = generate_manifest([tmp_path / "x.py"])

    # Should not raise
    serialized = json.dumps(manifest, indent=2)
    roundtrip = json.loads(serialized)
    assert roundtrip["janus_version"] == manifest["janus_version"]

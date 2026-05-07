from pathlib import Path

from janus.discovery import iter_python_files


def test_iter_python_skips_hidden_junk(tmp_path: Path) -> None:
    (tmp_path / "good.py").write_text("# ok\n")
    noisy = tmp_path / ".git"
    noisy.mkdir()

    nested = noisy / "evil.py"

    nested.write_text("# ignored\n")

    hits = iter_python_files(tmp_path, max_files=50)

    assert len(hits) == 1
    assert hits[0].name == "good.py"

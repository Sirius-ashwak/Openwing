from __future__ import annotations

import pytest

from janus.syntax import compile_check


def test_compile_check_success() -> None:
    compile_check("x = 1\n", "<test>")


def test_compile_check_invalid() -> None:

    with pytest.raises(SyntaxError):
        compile_check("def foo(\n", "<bad>")
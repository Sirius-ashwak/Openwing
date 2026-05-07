"""Lightweight sanity checks before accepting LLM-produced Python."""

from __future__ import annotations


def compile_check(source: str, filename_hint: str) -> None:
    """Raise SyntaxError / TypeError exactly like builtin compile() failures."""

    compile(source, filename_hint, "exec", dont_inherit=True)

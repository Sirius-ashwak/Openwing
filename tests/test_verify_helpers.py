from __future__ import annotations

from janus.verify import heuristic_sqli_patterns, hybrid_clean


def sample_vulnerable(username_field: bool = True) -> str:
    base = '''import sqlite3
from flask import Flask, request
app = Flask(__name__)


@app.route("/unsafe")
def unsafe():
'''

    concat = '''    risky = "'" + USER + "'"
    cursor.execute(risky)
'''
    concat = concat.replace(
        "USER",
        'request.args["username"]' if username_field else 'username_var',
    )
    return base + concat


def test_heuristic_detects_dynamic_holder() -> None:
    src = sample_vulnerable()
    hits = heuristic_sqli_patterns(src)
    assert hits, "Expected heuristic to escalate dynamic holder usage"


def test_hybrid_overrides_llm_clean_flag() -> None:
    insecure_src = sample_vulnerable()
    clean, hints = hybrid_clean(True, insecure_src)

    assert not clean
    assert hints

"""Intentionally vulnerable Flask demo containing SQL concatenation."""

import sqlite3
from pathlib import Path

from flask import Flask, request

DB_PATH = Path(__file__).resolve().parent / "users.db"


def ensure_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT
        )"""
    )
    cur.execute(
        "INSERT OR IGNORE INTO users(username,password) VALUES (?,?)",
        ("admin", "supersecret"),
    )
    conn.commit()
    conn.close()


app = Flask(__name__)


@app.post("/login")
def login():  # noqa: D401
    """Demonstrates SQL injection through string concatenation."""
    username = request.form["username"]

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # VULNERABLE: direct interpolation into execute()
    suspicious = (
        'SELECT username,password FROM users WHERE username = "'
        + username
        + '" LIMIT 1'
    )

    rows = cur.execute(suspicious).fetchall()

    conn.close()

    return {"authenticated": len(rows) == 1, "hits": rows}


if __name__ == "__main__":
    ensure_db()
    app.run(port=8765)


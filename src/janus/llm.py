from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import httpx


@dataclass(frozen=True)
class LLMConfig:
    api_key: str
    base_url: str  # ends with .../v1
    model: str
    timeout_s: float = 120.0


def load_llm_config() -> LLMConfig:
    key = (
        os.environ.get("OPENAI_API_KEY")
        or os.environ.get("LLM_API_KEY")
        or "EMPTY"
    )
    raw_base = (
        os.environ.get("OPENAI_BASE_URL") or os.environ.get("LLM_BASE_URL") or ""
    ).rstrip("/")

    base = raw_base.strip() if raw_base else "http://localhost:8000/v1"
    if not base.endswith("/v1"):
        base = base + "/v1"

    model = (
        os.environ.get("OPENAI_MODEL")
        or os.environ.get("LLM_MODEL")
        or os.environ.get("JANUS_MODEL")
        or "Qwen/Qwen2.5-7B-Instruct"
    ).strip()

    timeout = float(os.environ.get("OPENAI_TIMEOUT", "120"))
    return LLMConfig(api_key=key, base_url=base, model=model, timeout_s=timeout)


class ChatCompletionClient:
    """Minimal OpenAI-compatible chat client (works with vLLM)."""

    def __init__(self, cfg: LLMConfig | None = None) -> None:
        self._cfg = cfg or load_llm_config()

    @property
    def model(self) -> str:
        return self._cfg.model

    async def chat(self, *, system: str, user: str, temperature: float = 0.2) -> str:
        payload = {
            "model": self._cfg.model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }

        headers = {"Content-Type": "application/json"}
        if self._cfg.api_key and self._cfg.api_key != "EMPTY":
            headers["Authorization"] = f"Bearer {self._cfg.api_key}"

        async with httpx.AsyncClient(timeout=self._cfg.timeout_s) as client:
            response = await client.post(
                f"{self._cfg.base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError(f"Malformed chat response (no choices): {data!r}")

        msg = choices[0].get("message") or {}
        content = msg.get("content")
        if not isinstance(content, str):
            raise RuntimeError(f"Unexpected message content shape: {msg!r}")
        return content


def sync_chat(system: str, user: str, *, temperature: float = 0.2) -> str:
    """Sync wrapper for callers (CLI/pytest mocks patch this).

    Implemented via httpx synchronous client using same routing as Async.
    """

    cfg = load_llm_config()
    payload = {
        "model": cfg.model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }

    headers = {"Content-Type": "application/json"}
    if cfg.api_key and cfg.api_key != "EMPTY":
        headers["Authorization"] = f"Bearer {cfg.api_key}"

    with httpx.Client(timeout=cfg.timeout_s) as client:
        resp = client.post(f"{cfg.base_url}/chat/completions", json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"Malformed chat response (no choices): {data!r}")
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    if not isinstance(content, str):
        raise RuntimeError(f"Unexpected message content shape: {msg!r}")
    return content


async def async_sync_chat(system: str, user: str, *, temperature: float = 0.2) -> str:
    """Async counterpart of sync_chat for concurrent sweeps."""

    cfg = load_llm_config()
    payload = {
        "model": cfg.model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }

    headers = {"Content-Type": "application/json"}
    if cfg.api_key and cfg.api_key != "EMPTY":
        headers["Authorization"] = f"Bearer {cfg.api_key}"

    async with httpx.AsyncClient(timeout=cfg.timeout_s) as client:
        resp = await client.post(
            f"{cfg.base_url}/chat/completions", json=payload, headers=headers
        )
        resp.raise_for_status()
        data = resp.json()

    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"Malformed chat response (no choices): {data!r}")
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    if not isinstance(content, str):
        raise RuntimeError(f"Unexpected message content shape: {msg!r}")
    return content

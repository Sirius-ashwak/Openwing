"""LLM client with multi-provider fallback chain.

Priority order (auto mode):
  1. AMD vLLM  — OPENAI_BASE_URL / LLM_MODEL  (local, fastest, private)
  2. Groq      — GROQ_API_KEY                  (free tier, very fast)
  3. OpenAI    — OPENAI_API_KEY + base openai  (reliable fallback)

Set JANUS_PROVIDER=amd|groq|openai to pin to a single provider.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LLMConfig:
    api_key: str
    base_url: str  # ends with /v1
    model: str
    timeout_s: float = 120.0
    provider_name: str = "unknown"


# ── Provider definitions ──────────────────────────────────────────────────

def _amd_config() -> LLMConfig | None:
    raw_base = (
        os.environ.get("OPENAI_BASE_URL") or os.environ.get("LLM_BASE_URL") or ""
    ).rstrip("/").strip()

    base = raw_base if raw_base else "http://localhost:8000"
    if not base.endswith("/v1"):
        base = base + "/v1"

    model = (
        os.environ.get("OPENAI_MODEL")
        or os.environ.get("LLM_MODEL")
        or os.environ.get("JANUS_MODEL")
        or "Qwen/Qwen2.5-72B-Instruct"
    ).strip()

    key = os.environ.get("OPENAI_API_KEY") or os.environ.get("LLM_API_KEY") or "EMPTY"
    timeout = float(os.environ.get("OPENAI_TIMEOUT", "120"))
    return LLMConfig(api_key=key, base_url=base, model=model, timeout_s=timeout, provider_name="amd")


def _groq_config() -> LLMConfig | None:
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if not key:
        return None
    model = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant").strip()
    return LLMConfig(
        api_key=key,
        base_url="https://api.groq.com/openai/v1",
        model=model,
        timeout_s=60.0,
        provider_name="groq",
    )


def _openai_config() -> LLMConfig | None:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    # Only use OpenAI as fallback if we're not already using it as AMD
    base = (os.environ.get("OPENAI_BASE_URL") or "").strip()
    if base and "openai.com" not in base and "localhost" not in base and "127.0.0.1" not in base:
        return None  # custom base is AMD; don't double-count as OpenAI
    if not key or key == "EMPTY":
        return None
    model = os.environ.get("OPENAI_FALLBACK_MODEL", "gpt-3.5-turbo").strip()
    return LLMConfig(
        api_key=key,
        base_url="https://api.openai.com/v1",
        model=model,
        timeout_s=90.0,
        provider_name="openai",
    )


def _build_provider_chain() -> list[LLMConfig]:
    pinned = os.environ.get("JANUS_PROVIDER", "auto").strip().lower()

    if pinned == "amd":
        cfg = _amd_config()
        return [cfg] if cfg else []
    if pinned == "groq":
        cfg = _groq_config()
        return [cfg] if cfg else []
    if pinned == "openai":
        cfg = _openai_config()
        return [cfg] if cfg else []

    # auto: try all in priority order, skip None entries
    chain = [_amd_config(), _groq_config(), _openai_config()]
    return [c for c in chain if c is not None]


# ── Shared HTTP call logic ────────────────────────────────────────────────

def _build_payload(cfg: LLMConfig, system: str, user: str, temperature: float) -> dict:
    return {
        "model": cfg.model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }


def _headers(cfg: LLMConfig) -> dict:
    h = {"Content-Type": "application/json"}
    if cfg.api_key and cfg.api_key != "EMPTY":
        h["Authorization"] = f"Bearer {cfg.api_key}"
    return h


def _extract_content(data: dict) -> str:
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"Malformed chat response (no choices): {data!r}")
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    if not isinstance(content, str):
        raise RuntimeError(f"Unexpected message content shape: {msg!r}")
    return content


def _is_retryable(exc: Exception) -> bool:
    """True when the error is infrastructure-level (try next provider)."""
    if isinstance(exc, httpx.ConnectError):
        return True
    if isinstance(exc, httpx.TimeoutException):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        # 5xx server errors → retry next provider; 4xx (auth, bad request) → propagate
        return exc.response.status_code >= 500
    return False


# ── Public sync API ───────────────────────────────────────────────────────

def load_llm_config() -> LLMConfig:
    """Return the primary (first) configured provider. Used by legacy callers."""
    chain = _build_provider_chain()
    if not chain:
        return _amd_config()  # always returns something
    return chain[0]


def sync_chat(system: str, user: str, *, temperature: float = 0.2) -> str:
    """Synchronous LLM call with provider fallback.

    CLI/pytest mocks patch this function directly.
    """
    chain = _build_provider_chain()
    last_exc: Exception | None = None

    for cfg in chain:
        payload = _build_payload(cfg, system, user, temperature)
        try:
            with httpx.Client(timeout=cfg.timeout_s) as client:
                resp = client.post(
                    f"{cfg.base_url}/chat/completions",
                    json=payload,
                    headers=_headers(cfg),
                )
                resp.raise_for_status()
                return _extract_content(resp.json())
        except Exception as exc:
            last_exc = exc
            if _is_retryable(exc):
                logger.warning("Provider %s failed (%s), trying next.", cfg.provider_name, exc)
                continue
            raise  # non-retryable (auth error, bad JSON, etc.)

    raise RuntimeError(
        f"All LLM providers exhausted. Last error: {last_exc}"
    ) from last_exc


# ── Public async API ──────────────────────────────────────────────────────

async def async_chat(system: str, user: str, *, temperature: float = 0.2) -> str:
    """Async LLM call with provider fallback."""
    chain = _build_provider_chain()
    last_exc: Exception | None = None

    for cfg in chain:
        payload = _build_payload(cfg, system, user, temperature)
        try:
            async with httpx.AsyncClient(timeout=cfg.timeout_s) as client:
                resp = await client.post(
                    f"{cfg.base_url}/chat/completions",
                    json=payload,
                    headers=_headers(cfg),
                )
                resp.raise_for_status()
                return _extract_content(resp.json())
        except Exception as exc:
            last_exc = exc
            if _is_retryable(exc):
                logger.warning("Provider %s failed (%s), trying next.", cfg.provider_name, exc)
                continue
            raise

    raise RuntimeError(
        f"All LLM providers exhausted. Last error: {last_exc}"
    ) from last_exc


# Backwards-compat alias used by runner.py async sweep
async def async_sync_chat(system: str, user: str, *, temperature: float = 0.2) -> str:
    return await async_chat(system, user, temperature=temperature)


# ── Provider health check ─────────────────────────────────────────────────

def check_provider_health() -> list[dict]:
    """Probe each configured provider and return status list."""
    chain = _build_provider_chain()
    results = []
    for cfg in chain:
        try:
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(f"{cfg.base_url}/models", headers=_headers(cfg))
            ok = resp.status_code < 400
            results.append({"provider": cfg.provider_name, "model": cfg.model,
                            "base_url": cfg.base_url, "ok": ok,
                            "status_code": resp.status_code})
        except Exception as exc:
            results.append({"provider": cfg.provider_name, "model": cfg.model,
                            "base_url": cfg.base_url, "ok": False, "error": str(exc)})
    return results


# ── ChatCompletionClient (kept for any direct instantiation) ──────────────

class ChatCompletionClient:
    """Thin wrapper; prefer module-level sync_chat / async_chat."""

    def __init__(self, cfg: LLMConfig | None = None) -> None:
        self._cfg = cfg or load_llm_config()

    @property
    def model(self) -> str:
        return self._cfg.model

    async def chat(self, *, system: str, user: str, temperature: float = 0.2) -> str:
        return await async_chat(system, user, temperature=temperature)

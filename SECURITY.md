# Security Policy

Openwing Janus is a security tool that ingests untrusted code (cloned repositories, user-supplied paths) and feeds it to LLM agents. Vulnerabilities in Janus itself can expose its operators, so we take reports seriously even when the impact looks low.

## Reporting a Vulnerability

**Do not file public GitHub issues for security bugs.**

Report privately via GitHub Security Advisories:
**https://github.com/Sirius-ashwak/Openwing/security/advisories/new**

Please include:

- Affected component (e.g., `github_fetcher.py`, `server.py`, Red/Blue prompt path)
- Reproduction steps or a minimal proof-of-concept
- The impact you observed (file read outside repo dir, prompt-injection bypass, credential leak, etc.)
- Preconditions — does it require a hostile target repo, hostile LLM response, hostile API client, or some combination?

### Response targets

| Stage | Target |
| --- | --- |
| Acknowledgement | 3 business days |
| Triage and severity call | 7 business days |
| Fix or mitigation in `main` | 30 days for High/Critical; best-effort otherwise |
| Coordinated disclosure | After fix lands, or 90 days from acknowledgement, whichever comes first |

These are goals, not contractual SLAs — Janus is a pre-1.0 project maintained by a small team. Reporters are credited in the advisory unless they request anonymity.

## Supported Versions

Openwing Janus is a pre-1.0 hackathon MVP (currently `0.1.0`). Only the `main` branch receives security fixes. There are no patch releases, LTS lines, or backports to older tags. If you pin to a commit or maintain a fork, you are responsible for picking up fixes.

## In Scope

- `src/janus/github_fetcher.py` — clone path traversal, symlink escape, decompression bombs, unbounded clone size
- `src/janus/server.py`, `src/janus/run_store.py` — FastAPI surface, SSE stream isolation, run-id forgery, CORS / authentication assumptions
- `src/janus/agents.py`, `src/janus/vuln_kb.py` — prompt injection from scanned code that exfiltrates the system prompt, escapes the JSON contract, or coerces the Blue agent into emitting harmful patches
- `src/janus/llm.py` — credential handling, provider fallback abuse, request smuggling against the OpenAI-compatible endpoint
- `src/janus/runner.py` and patch-write paths — directory traversal during in-place writes, backup-file races, writes outside `--path`
- The CLI (`janus run`) — argument injection, unsafe defaults, secrets leaking into `--json` output

## Out of Scope

- Bugs in upstream models served by AMD vLLM, Groq, or OpenAI — report those to those projects
- Findings produced *by* Janus on third-party code (those are scanner outputs, not Janus vulnerabilities)
- The design property that Red-team payloads are stored as informational strings — Janus does not execute payloads, by design
- Vulnerabilities in `examples/vulnerable_app/` — that app exists *to be* vulnerable for testing
- Issues that require an attacker to already have write access to the host running Janus
- Denial-of-service against an attacker-controlled local LLM endpoint

## Operator Hardening

When running Janus against untrusted GitHub repositories:

- Run inside a container or VM; do not give it access to credentials beyond `OPENAI_API_KEY`
- Bind FastAPI to `127.0.0.1`, not `0.0.0.0`, unless you have added authentication in front
- Scope the LLM API key narrowly so it cannot be used to bill or exfiltrate unrelated workloads
- Treat scanned code as untrusted LLM input — prompt injection from a malicious repository is a known risk class for LLM-based scanners and is explicitly in scope above

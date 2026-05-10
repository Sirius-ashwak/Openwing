<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0c0d0f,50:1a1b1f,100:c5ff4a&height=180&section=header&text=Openwing%20Janus&fontColor=ffffff&fontSize=58&fontAlignY=38&desc=Adversarial%20security%20testing%20for%20Python&descSize=16&descAlignY=62&descAlign=50&animation=fadeIn" alt="Openwing Janus banner" />

<br />

<a href="#quickstart">
  <img src="https://readme-typing-svg.demolab.com/?lines=Two+agents.+One+loop.+Until+your+code+holds.;Janus_Red+writes+exploits.;Janus_Blue+writes+patches.;LangGraph+drives+the+loop+to+convergence.&font=JetBrains+Mono&size=18&pause=1200&color=C5FF4A&center=true&vCenter=true&width=720&height=44" alt="Tagline animation" />
</a>

<br /><br />

<p>
  <img alt="Python" src="https://img.shields.io/badge/python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-0.2+-1a1b1f?style=for-the-badge&logo=langchain&logoColor=c5ff4a" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=000" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
</p>

<p>
  <img alt="vLLM" src="https://img.shields.io/badge/vLLM-0.6-c5ff4a?style=flat-square&labelColor=0c0d0f" />
  <img alt="ROCm" src="https://img.shields.io/badge/ROCm-6.2-ED1C24?style=flat-square&labelColor=0c0d0f&logo=amd&logoColor=white" />
  <img alt="MI300X" src="https://img.shields.io/badge/AMD%20MI300X-192GB%20HBM3-ED1C24?style=flat-square&labelColor=0c0d0f" />
  <img alt="SARIF" src="https://img.shields.io/badge/SARIF-2.1.0-66d4ff?style=flat-square&labelColor=0c0d0f" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-c5ff4a?style=flat-square&labelColor=0c0d0f" />
</p>

<p>
  <a href="#quickstart"><strong>Quickstart</strong></a>
  &nbsp;·&nbsp;
  <a href="#the-loop"><strong>How it works</strong></a>
  &nbsp;·&nbsp;
  <a href="#dashboard"><strong>Dashboard</strong></a>
  &nbsp;·&nbsp;
  <a href="#cli">CLI</a>
  &nbsp;·&nbsp;
  <a href="#api">API</a>
  &nbsp;·&nbsp;
  <a href="#stack">Stack</a>
</p>

</div>

---

## What it is

Most security scanners tell you *that* a vulnerability exists. They do not fix it.

**Openwing Janus** runs two LLM agents against your Python codebase in an adversarial loop:

- **Janus_Red** is the attacker. It walks every request handler, traces untrusted input to dangerous sinks, and emits concrete exploit payloads — not hints.
- **Janus_Blue** is the patcher. It reads Red's findings, generates a fix, runs Python's compile gate, and writes the patch to disk.
- **LangGraph** ties them together: Red attacks → Blue patches → Red re-verifies → loop until the code holds, or the cycle budget is exhausted.

Sub-second per file on a single AMD MI300X with vLLM. SARIF 2.1 export plugs straight into GitHub code-scanning.

<br />

<div align="center">
  <img src="https://readme-typing-svg.demolab.com/?lines=Sub-second+per+file+on+MI300X.;13-entry+OWASP-aligned+CWE+knowledge+base.;Compile-gated+patches.+No+broken+code+leaves+Blue.;SARIF+2.1+export+plugs+into+GitHub+code-scanning.&font=JetBrains+Mono&size=14&pause=2000&color=66D4FF&center=true&vCenter=true&width=680&height=32" alt="Feature rotation" />
</div>

---

## The loop

```mermaid
flowchart LR
  classDef red fill:#1a0f12,stroke:#ff5b5b,color:#ffb2b2,stroke-width:1px
  classDef blue fill:#0f1620,stroke:#66d4ff,color:#b3e6ff,stroke-width:1px
  classDef ok fill:#141a08,stroke:#c5ff4a,color:#dfff90,stroke-width:1px
  classDef sys fill:#0c0d0f,stroke:#3a3d44,color:#cfd2d8,stroke-width:1px

  Repo[Target<br/>repo or file]:::sys
  Discover[Discover<br/>Python files]:::sys
  Red[Janus_Red<br/>find exploit]:::red
  Gate{Heuristic<br/>gate}:::sys
  Blue[Janus_Blue<br/>generate patch]:::blue
  Compile{compile_check}:::sys
  Verify[Janus_Red<br/>re-verify]:::red
  Done[Resolved<br/>SARIF + diff]:::ok

  Repo --> Discover --> Red
  Red --> Gate
  Gate -- "no finding" --> Done
  Gate -- "finding" --> Blue
  Blue --> Compile
  Compile -- "fail" --> Blue
  Compile -- "pass" --> Verify
  Verify -- "still vuln &amp; cycles left" --> Blue
  Verify -- "clean" --> Done
```

The graph is implemented as a `langgraph.StateGraph`. Each transition emits a structured trace event consumed by the CLI's Rich output, the FastAPI server's SSE stream, and the dashboard.

<br />

---

## Quickstart

Pick one path. The full experience runs both backend and frontend together; the dashboard alone runs without any Python.

<br />

<table>
<tr>
<td width="50%" valign="top">

### Backend &middot; CLI &amp; API

```bash
git clone https://github.com/your-org/openwing-janus
cd openwing-janus
pip install -e ".[dev]"

# Point at any OpenAI-compatible endpoint
export OPENAI_BASE_URL=http://localhost:8000/v1
export LLM_MODEL=Qwen/Qwen2.5-72B-Instruct

# CLI scan
janus run --path ./examples/vulnerable_app/app.py --backup

# Or boot the API + dashboard
uvicorn janus.server:app --host 0.0.0.0 --port 5000
```

Open `http://localhost:5000` &mdash; FastAPI serves the built dashboard.

</td>
<td width="50%" valign="top">

### Frontend &middot; dashboard only

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` &mdash; Vite proxies `/api/*` to the backend on port 5000 if it is running, otherwise the dashboard falls back to a paced replay flow so judges and reviewers always see a complete walkthrough.

```bash
# Build for production
npm run build
npm run preview
```

</td>
</tr>
</table>

<br />

---

## Dashboard

The web UI is a single-page React app served by FastAPI in production, or by Vite in dev. Eight screens, all driven by the same SSE stream and store.

<div align="center">

| Screen        | Purpose                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| **Scan**      | Set the target. GitHub URL, local directory, or single file. Picks model, scope, cycles. |
| **Sweep**     | Per-file lanes: discovery, scan time, state (critical / clean), finding count.           |
| **Duel**      | Live trace. Red events on the left, Blue on the right, streaming as the loop runs.       |
| **Patch**     | Side-by-side diff of every fix Blue wrote, with the trigger snippet annotated.           |
| **Verify**    | Post-patch re-scan. Confirms exploits are gone; flags anything that survived.            |
| **Report**    | Findings list with CWE, CVSS, severity, payload. One-click SARIF 2.1 export.             |
| **History**   | Previous runs with duration, finding count, fix rate, status.                            |
| **Settings**  | Provider chain, GPU info, budget, theme tweaks.                                          |

</div>

Keyboard shortcuts: `1`–`8` jump screens · `←` `→` step through · `⌘K` command palette · `E` export SARIF.

<br />

---

## CLI

Typer + Rich. `janus --help` for the full reference.

```bash
janus run --path ./src/myapp                # sweep a directory
janus run --path app.py --dry-run --json    # CI-friendly, no writes
janus run --path . --max-files 250 --backup # crawl with safety rails
janus run --github github.com/owner/repo    # clone + scan
```

| Flag             | Effect                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `--path`         | File or directory. Directories sweep tracked Python modules.        |
| `--github`       | Clone a GitHub URL into a temp dir before scanning.                 |
| `--dry-run`      | Run Red and Blue without rewriting any source files.                |
| `--backup`       | Copy `<file>.<utc>.janus.bak` before each in-place write.           |
| `--max-cycles`   | Patch budget per file. Default `3`.                                 |
| `--syntax-tries` | Adaptive retries when Blue's patch fails `compile_check`. Default `4`. |
| `--max-files`    | Hard cap when crawling large trees.                                 |
| `--json`         | Machine-readable output (single record or array).                   |

In-place patches are destructive without `--dry-run`. Pair with `--backup` or rely on Git.

<br />

---

## API

FastAPI server at `src/janus/server.py`. All endpoints are documented at `/docs` (Swagger) and `/redoc`.

| Method   | Path                          | Purpose                                  |
| -------- | ----------------------------- | ---------------------------------------- |
| `POST`   | `/api/runs`                   | Create and start a scan.                 |
| `GET`    | `/api/runs`                   | List recent runs.                        |
| `GET`    | `/api/runs/{id}`              | Single run status &amp; result.          |
| `GET`    | `/api/runs/{id}/events`       | SSE live trace stream.                   |
| `GET`    | `/api/runs/{id}/findings`     | Structured findings for a completed run. |
| `DELETE` | `/api/runs/{id}`              | Cancel or discard a run.                 |
| `GET`    | `/api/health`                 | Provider health probe.                   |
| `GET`    | `/api/system`                 | GPU / endpoint / budget snapshot.        |

The SSE channel emits structured trace events: `system`, `red.thought`, `red.code`, `red.finding`, `blue.thought`, `blue.patch`, `red.verify`, `system.ok` (with summary), `eof`.

<br />

---

## Configuration

| Variable          | Purpose                                                | Default                       |
| ----------------- | ------------------------------------------------------ | ----------------------------- |
| `OPENAI_API_KEY`  | Bearer token if your endpoint requires it              | `EMPTY`                       |
| `OPENAI_BASE_URL` | OpenAI-compatible API root (must include `/v1`)        | `http://localhost:8000/v1`    |
| `LLM_MODEL`       | Model id (alias: `OPENAI_MODEL`, `JANUS_MODEL`)        | `Qwen/Qwen2.5-72B-Instruct`   |
| `OPENAI_TIMEOUT`  | HTTP timeout in seconds                                | `120`                         |
| `JANUS_PROVIDER`  | `amd`, `groq`, `openai`, or `auto` (fallback chain)    | `auto`                        |
| `JANUS_RATE_LIMIT`| Requests per minute per IP (server)                    | `20`                          |

Bare URLs without `/v1` are auto-suffixed by `janus.llm.load_llm_config`.

<br />

---

## Stack

<div align="center">

<table>
<tr>
<td align="center" width="20%">
<img src="https://skillicons.dev/icons?i=python" height="44" alt="Python" /><br />
<sub><b>Python 3.10+</b></sub>
</td>
<td align="center" width="20%">
<img src="https://skillicons.dev/icons?i=fastapi" height="44" alt="FastAPI" /><br />
<sub><b>FastAPI</b></sub>
</td>
<td align="center" width="20%">
<img src="https://skillicons.dev/icons?i=react" height="44" alt="React" /><br />
<sub><b>React 18</b></sub>
</td>
<td align="center" width="20%">
<img src="https://skillicons.dev/icons?i=ts" height="44" alt="TypeScript" /><br />
<sub><b>TypeScript</b></sub>
</td>
<td align="center" width="20%">
<img src="https://skillicons.dev/icons?i=vite" height="44" alt="Vite" /><br />
<sub><b>Vite 5</b></sub>
</td>
</tr>
<tr>
<td align="center">
<img src="https://skillicons.dev/icons?i=docker" height="44" alt="Docker" /><br />
<sub><b>Docker</b></sub>
</td>
<td align="center">
<img src="https://skillicons.dev/icons?i=github" height="44" alt="GitHub" /><br />
<sub><b>GitHub Actions</b></sub>
</td>
<td align="center">
<img src="https://skillicons.dev/icons?i=vercel" height="44" alt="Vercel" /><br />
<sub><b>Vercel</b></sub>
</td>
<td align="center">
<img src="https://skillicons.dev/icons?i=linux" height="44" alt="Linux" /><br />
<sub><b>ROCm 6.2</b></sub>
</td>
<td align="center">
<img src="https://skillicons.dev/icons?i=nodejs" height="44" alt="Node" /><br />
<sub><b>Node 20+</b></sub>
</td>
</tr>
</table>

<br />

<sub>Inference: <b>Qwen/Qwen2.5-72B-Instruct</b> on <b>vLLM 0.6</b> · <b>AMD Instinct MI300X</b> (192 GB HBM3) · provider chain falls back to Groq and OpenAI.</sub>

</div>

<br />

---

## Acceptance criteria

| Criterion                          | How Janus addresses it                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| vLLM on localhost                  | `OPENAI_BASE_URL` + `httpx` client to `/chat/completions`                             |
| Red finds Flask SQLi (scoped)      | Red prompt + strict JSON schema (`RedTeamReport`)                                     |
| Blue emits safe remediations       | Blue prompt covers SQLi parameterization plus SSRF / subprocess / deserialization     |
| Cyclic verify (max 3)              | LangGraph `StateGraph`: scan &rarr; gate &rarr; verify / Blue + compile &rarr; write   |
| No exploit execution               | Payloads are informational strings; no subprocess / interpreter eval                  |
| Readable CLI                       | Typer + Rich with run-table summaries                                                 |
| CI without live LLM                | `pytest` mocks `janus.llm.sync_chat`                                                  |
| Live observability                 | FastAPI SSE + dashboard with eight role-specific screens                              |

<br />

---

## Limitations

- **Directory sweeps** are sequential, not parallel clusters; respect `--max-files` rails.
- **Hybrid gate**: regex heuristics override hallucinated clean scans &mdash; escalate manual review whenever notes print.
- **Model quality dominates**: compile checks catch syntax breakage, not semantic parity vs. production traffic.
- **JSON repair**: malformed Red output triggers one automatic repair ping (`agents.red_team_scan`).

<br />

---

## Tests

```bash
pytest                 # full suite, mocks LLM
pytest -k "graph"      # focused
pytest --cov=janus     # with coverage
```

<br />

---

## Roadmap

- [ ] Parallel cluster sweeps with worker pool
- [ ] Auto PR opener for Blue's patches
- [ ] Multi-language support (TypeScript / Go / Rust)
- [ ] Custom CWE knowledge base loader
- [ ] Persistent run store (SQLite)
- [ ] Webhook + Slack / Discord notifications
- [ ] Prompt-injection benchmark on Red's verdict gate

<br />

---

## License

MIT &mdash; see [LICENSE](./LICENSE).

<br />

<div align="center">

<sub>Built for the AMD Developer Cloud hackathon.</sub>

<br />

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:c5ff4a,50:1a1b1f,100:0c0d0f&height=80&section=footer&animation=fadeIn" alt="footer" />

</div>

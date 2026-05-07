# Janus CI Setup Guide

## Quick Start

The included GitHub Actions workflow (`.github/workflows/janus-scan.yml`) provides:

1. **Test matrix** — runs `pytest` across Python 3.10, 3.12, 3.13
2. **Offline scan** — exercises the full Red/Blue loop with canned responses (no API keys needed)
3. **Live scan** (optional) — uses a real vLLM/OpenAI-compatible endpoint

## Offline Mode (default)

Every PR and push runs a Janus scan in `--offline` mode. This:

- Requires **no API keys or secrets**
- Uses canned LLM responses to exercise the full pipeline
- Produces SARIF output uploaded to GitHub Code Scanning
- Validates that the scan pipeline doesn't crash

## Live LLM Scan

To enable live scanning with a real model:

### 1. Set Repository Variables

Go to **Settings → Secrets and variables → Actions → Variables**:

| Variable | Value | Purpose |
|----------|-------|---------|
| `JANUS_LIVE_SCAN` | `true` | Enables the live scan job |
| `LLM_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | Model identifier (optional) |

### 2. Set Repository Secrets

Go to **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Value | Purpose |
|--------|-------|---------|
| `OPENAI_API_KEY` | Your API key | Bearer token for the LLM API |
| `OPENAI_BASE_URL` | `http://your-vllm-host:8000/v1` | OpenAI-compatible API root |

### 3. Self-hosted vLLM

If running vLLM on your own infrastructure:

```bash
# Start vLLM (AMD ROCm) with the massive 72B model!
docker run --device /dev/kfd --device /dev/dri \
  -p 8000:8000 \
  rocm/vllm:latest \
  --model Qwen/Qwen2.5-72B-Instruct --tensor-parallel-size 1

# Set OPENAI_BASE_URL in GitHub secrets to your server's URL
```

## SARIF Upload Permissions

The workflow requires the `security-events: write` permission to upload SARIF files. This is already configured in the workflow file.

For **fine-grained Personal Access Tokens (PATs)**, you need:

- `actions: read` — to trigger workflows
- `security-events: write` — to upload SARIF to Code Scanning
- `contents: read` — to checkout repository

### OIDC for Enterprise

For enterprise setups using OIDC authentication:

```yaml
permissions:
  id-token: write
  contents: read
  security-events: write
```

Configure your OIDC provider to issue tokens for the `security-events` scope.

## Semgrep in CI

To add Semgrep static analysis alongside LLM scans:

```bash
pip install -e ".[semgrep]"
python -m janus run --path src/ --semgrep --format sarif --output results.sarif
```

Semgrep must be installed separately (`pip install semgrep` or system package). If not available, Janus gracefully skips it.

## SBOM Generation

To generate a file manifest after scanning:

```bash
python -m janus run --path src/ --sbom manifest.json --dry-run
```

This produces a lightweight JSON manifest with SHA-256 digests of all scanned files.

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, Field


class RedTeamReport(BaseModel):
    """Strict Red Team JSON schema."""

    file_path: str = Field(description="Path to analyzed file.")
    vulnerability_type: str = Field(
        description="Issue class, or 'none' if no vulnerability found."
    )
    vulnerable_code_snippet: str = Field(
        default="",
        description="Risky excerpt; empty if none.",
    )
    exploit_payload: str = Field(
        default="",
        description="Illustrative payload text only — never executed.",
    )

    def is_secure_report(self) -> bool:
        vt = self.vulnerability_type.strip().lower()
        if vt in ("none", "secure", "clean", "no_vulnerability"):
            return True
        if not self.vulnerable_code_snippet.strip() and not self.exploit_payload.strip():
            return True
        return False


def coerce_patched_code(llm_body: str) -> str:
    trimmed = llm_body.strip()
    fenced = "```"
    while fenced in trimmed:
        start = trimmed.find(fenced)
        after = trimmed[start + len(fenced) :]
        if after.lower().startswith("python"):
            after = after[len("python") :].lstrip()
        elif after.startswith("\n"):
            after = after[1:]
        end = after.find(fenced)
        if end == -1:
            trimmed = trimmed.replace(fenced, "", 1).strip()
            continue
        return after[:end].strip()
    return trimmed


def extract_json_object(text: str) -> str:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.I)
    if fence:
        return fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return text


def parse_red_team_json(raw: str, default_path: str) -> RedTeamReport:
    data = json.loads(extract_json_object(raw))
    report = RedTeamReport.model_validate(data)
    if not report.file_path.strip():
        report = report.model_copy(update={"file_path": default_path})
    return report

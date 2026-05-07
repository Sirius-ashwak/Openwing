"""Structured vulnerability knowledge base injected into Red Team prompt.

The model already knows OWASP patterns from training, but injecting this KB:
  - Guarantees systematic coverage (no CWEs skipped)
  - Adds Python/Flask specific source→sink chains the model might overlook
  - Can be extended with new CVEs without retraining the model
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class VulnEntry:
    cwe: str
    name: str
    owasp: str
    priority: int  # 1=critical, 2=high, 3=medium
    sources: list[str] = field(default_factory=list)
    sinks: list[str] = field(default_factory=list)
    detection_hint: str = ""


VULN_KB: list[VulnEntry] = [
    VulnEntry(
        cwe="CWE-89", name="SQL Injection", owasp="A03:2021", priority=1,
        sources=["request.args", "request.form", "request.json", "request.data", "request.values", "request.cookies"],
        sinks=["cursor.execute", "session.execute", "db.execute", "engine.execute", "connection.execute", "text()"],
        detection_hint=(
            "Trace user input into SQL: f-strings, % formatting, string concat passed to any execute(). "
            "Also check variables built from user data and later passed to execute(). "
            "SQLAlchemy text() with string formatting is equally dangerous."
        ),
    ),
    VulnEntry(
        cwe="CWE-918", name="Server-Side Request Forgery", owasp="A10:2021", priority=1,
        sources=["request.args", "request.form", "request.json", "request.headers"],
        sinks=["requests.get", "requests.post", "requests.request", "httpx.get", "httpx.post",
               "urllib.request.urlopen", "aiohttp.ClientSession", "http.client.HTTPConnection"],
        detection_hint=(
            "User-controlled URL or host flows into outbound HTTP call. "
            "Check for missing scheme validation (only http/https), "
            "missing host allowlist, no IP range blocking (RFC1918/loopback/link-local). "
            "Cloud metadata endpoint 169.254.169.254 is the canonical SSRF target."
        ),
    ),
    VulnEntry(
        cwe="CWE-78", name="OS Command Injection", owasp="A03:2021", priority=1,
        sources=["request.args", "request.form", "request.json"],
        sinks=["subprocess.run", "subprocess.Popen", "subprocess.call", "subprocess.check_output",
               "os.system", "os.popen", "os.execv", "pty.spawn"],
        detection_hint=(
            "shell=True with any user input is critical. "
            "Also check string concatenation building argv lists. "
            "Even without shell=True, unsanitized argv elements can be dangerous."
        ),
    ),
    VulnEntry(
        cwe="CWE-22", name="Path Traversal", owasp="A01:2021", priority=1,
        sources=["request.args", "request.form", "request.files", "request.json"],
        sinks=["open()", "Path()", "os.path.join", "send_file", "send_from_directory",
               "shutil.copy", "os.rename", "os.remove"],
        detection_hint=(
            "User-supplied filenames or paths used in file operations without normalization. "
            "Look for missing Path.resolve() + root check, or missing .startswith(safe_dir) guard. "
            "../../ traversal sequences bypass naive prefix checks."
        ),
    ),
    VulnEntry(
        cwe="CWE-79", name="Cross-Site Scripting (XSS)", owasp="A03:2021", priority=2,
        sources=["request.args", "request.form", "request.json"],
        sinks=["render_template_string", "Markup()", "make_response with text/html",
               "jsonify with HTML content", "Response with mimetype html"],
        detection_hint=(
            "User input rendered in HTML without Jinja2 autoescaping. "
            "render_template_string with user data is almost always XSS. "
            "Markup() wrapping user strings disables escaping."
        ),
    ),
    VulnEntry(
        cwe="CWE-502", name="Insecure Deserialization", owasp="A08:2021", priority=1,
        sources=["request.data", "request.json", "request.files", "request.cookies"],
        sinks=["pickle.loads", "pickle.load", "yaml.load", "marshal.loads",
               "shelve.open", "joblib.load", "dill.loads"],
        detection_hint=(
            "pickle/marshal with user data allows arbitrary code execution. "
            "yaml.load() (not yaml.safe_load()) is vulnerable to code execution. "
            "Any deserialization of untrusted bytes is critical."
        ),
    ),
    VulnEntry(
        cwe="CWE-611", name="XML External Entity (XXE)", owasp="A05:2021", priority=2,
        sources=["request.data", "request.files"],
        sinks=["etree.parse", "etree.fromstring", "lxml.etree.parse",
               "xml.etree.ElementTree.parse", "minidom.parseString", "SAXParser"],
        detection_hint=(
            "XML parsing without disabling external entity resolution. "
            "lxml: use resolve_entities=False. "
            "defusedxml is the safe alternative for all XML parsing."
        ),
    ),
    VulnEntry(
        cwe="CWE-601", name="Open Redirect", owasp="A01:2021", priority=2,
        sources=["request.args", "request.form"],
        sinks=["redirect()", "make_response with Location header", "url_for"],
        detection_hint=(
            "User-controlled URL passed to redirect() without allowlist validation. "
            "next= and return_to= parameters are classic open redirect vectors. "
            "Relative path check can be bypassed with //evil.com."
        ),
    ),
    VulnEntry(
        cwe="CWE-434", name="Unrestricted File Upload", owasp="A04:2021", priority=2,
        sources=["request.files"],
        sinks=["file.save()", "open() write mode", "shutil.copy"],
        detection_hint=(
            "File uploads without extension whitelist, MIME type validation, or size limits. "
            "Saved files accessible via web server allow webshell uploads. "
            "Check for missing secure_filename() usage."
        ),
    ),
    VulnEntry(
        cwe="CWE-798", name="Hardcoded Credentials", owasp="A02:2021", priority=2,
        sources=[],
        sinks=["SECRET_KEY", "password", "api_key", "token", "private_key", "AWS_SECRET"],
        detection_hint=(
            "String literals assigned to security-sensitive variables. "
            "Weak or default SECRET_KEY values (e.g. 'dev', 'secret', 'changeme'). "
            "Credentials that should come from environment variables."
        ),
    ),
    VulnEntry(
        cwe="CWE-327", name="Broken/Weak Cryptography", owasp="A02:2021", priority=2,
        sources=[],
        sinks=["hashlib.md5", "hashlib.sha1", "DES", "RC4", "random.random", "random.randint"],
        detection_hint=(
            "MD5/SHA1 for password hashing (should use bcrypt/argon2). "
            "random module for security tokens (should use secrets module). "
            "ECB mode cipher usage."
        ),
    ),
    VulnEntry(
        cwe="CWE-400", name="Uncontrolled Resource Consumption", owasp="A05:2021", priority=3,
        sources=["request.args", "request.json"],
        sinks=["range()", "list comprehension", "re.compile", "re.match"],
        detection_hint=(
            "User-controlled integer used as loop bound or list size. "
            "User-supplied regex patterns (ReDoS via catastrophic backtracking). "
            "No pagination limits on database queries returning unbounded rows."
        ),
    ),
    VulnEntry(
        cwe="CWE-306", name="Missing Authentication", owasp="A01:2021", priority=2,
        sources=[],
        sinks=["@app.route", "@blueprint.route"],
        detection_hint=(
            "Admin, management, or sensitive routes missing @login_required or auth checks. "
            "Routes that expose internal state or perform destructive actions without verifying identity."
        ),
    ),
]


def build_kb_section(max_priority: int = 2) -> str:
    """Render the knowledge base as a structured prompt section."""
    lines = [
        "VULNERABILITY CHECKLIST — scan for ALL of these systematically before concluding 'none':",
        "",
    ]
    for e in VULN_KB:
        if e.priority > max_priority:
            continue
        priority_label = ["", "CRITICAL", "HIGH", "MEDIUM"][e.priority]
        lines.append(f"[{e.cwe}] {e.name} ({priority_label}) — OWASP {e.owasp}")
        if e.sources:
            lines.append(f"  Sources : {', '.join(e.sources)}")
        if e.sinks:
            lines.append(f"  Sinks   : {', '.join(e.sinks)}")
        lines.append(f"  Hint    : {e.detection_hint}")
        lines.append("")
    lines.append("Report the HIGHEST priority finding you are CONFIDENT about. Do not hallucinate.")
    return "\n".join(lines)

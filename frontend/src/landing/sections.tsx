export function Hero() {
  return (
    <section className="ow-hero">
      <div className="ow-eyebrow">Openwing / Janus · v0.5</div>
      <h1 className="ow-title">
        Two agents.<br />One loop.<br />Until your code holds.
      </h1>
      <p className="ow-lede">
        Adversarial security testing for Python codebases. Janus_Red writes exploits,
        Janus_Blue writes patches, LangGraph runs the loop until clean — sub-second per
        file on AMD MI300X with vLLM.
      </p>
      <div className="ow-buttons">
        <a className="ow-btn ow-btn--primary" href="/app">
          Open dashboard
        </a>
        <a
          className="ow-btn ow-btn--ghost"
          href="https://github.com/openwing-labs/janus"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </div>
    </section>
  );
}

export function RedBlue() {
  return (
    <section className="ow-section">
      <div className="ow-grid">
        <div className="ow-card">
          <div className="ow-card__label ow-card__label--red">01 · Janus_Red</div>
          <h2 className="ow-card__title">Adversarial pentester</h2>
          <p className="ow-card__body">
            Walks every request handler. Generates concrete payloads — not hints. A
            13-entry CWE knowledge base feeds the system prompt; a heuristic gate catches
            LLM false negatives before they ship.
          </p>
          <ul className="ow-list">
            <li>traces request.args → execute(query)</li>
            <li>emits payload <code>admin&apos; OR &apos;1&apos;=&apos;1 --</code></li>
            <li>heuristic gate escalates on regex match</li>
          </ul>
        </div>

        <div className="ow-card">
          <div className="ow-card__label ow-card__label--blue">02 · Janus_Blue</div>
          <h2 className="ow-card__title">Autonomous patcher</h2>
          <p className="ow-card__body">
            Generates the fix, then runs Python&apos;s own compile gate. Up to four retries
            — invalid syntax sends Blue back with a correction hint. Surviving patches are
            written to disk and handed back to Red for re-verification.
          </p>
          <ul className="ow-list">
            <li>parameterized query + length cap</li>
            <li>scheme allow-list + IP block</li>
            <li>compile_check() before write</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Loop() {
  return (
    <section className="ow-section">
      <div className="ow-eyebrow">03 · The loop</div>
      <h2 className="ow-heading">LangGraph ties them together.</h2>
      <p className="ow-body">
        Red attacks. Blue patches. Red verifies. Loop until clean — or hit max cycles. The
        whole cycle runs sub-second per file on AMD MI300X with vLLM and ROCm 6.2.
      </p>
      <div className="ow-graph">
        <span className="ow-pill ow-pill--red">
          <span className="ow-pill__dot" aria-hidden /> RED
        </span>
        <span className="ow-arrow" aria-hidden>→</span>
        <span className="ow-pill ow-pill--blue">
          <span className="ow-pill__dot" aria-hidden /> BLUE
        </span>
        <span className="ow-arrow" aria-hidden>→</span>
        <span className="ow-pill ow-pill--red">
          <span className="ow-pill__dot" aria-hidden /> VERIFY
        </span>
        <span className="ow-arrow" aria-hidden>→</span>
        <span className="ow-pill ow-pill--accent">
          <span className="ow-pill__dot" aria-hidden /> RESOLVED
        </span>
      </div>
    </section>
  );
}

export function Stack() {
  const items = [
    'Qwen 72B',
    'vLLM 0.6',
    'ROCm 6.2',
    'AMD MI300X',
    'FastAPI',
    'LangGraph',
    'SARIF 2.1',
  ];
  return (
    <section className="ow-section">
      <div className="ow-eyebrow">04 · Stack</div>
      <h2 className="ow-heading">Open weights. Open infrastructure.</h2>
      <p className="ow-body">
        SARIF 2.1 export plugs into GitHub code-scanning with no glue. Control plane is
        FastAPI, the loop is LangGraph, the inference is yours.
      </p>
      <div className="ow-chips">
        {items.map((s) => (
          <span key={s} className="ow-chip">{s}</span>
        ))}
      </div>
    </section>
  );
}

export function CTA() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const target = String(data.get('target') ?? '').trim();
    const url = target ? `/app?target=${encodeURIComponent(target)}` : '/app';
    window.location.href = url;
  };

  return (
    <section className="ow-section">
      <div className="ow-eyebrow">05 · Try it</div>
      <h2 className="ow-heading">Audit a repo in under 60 seconds.</h2>
      <p className="ow-body">
        Drop a GitHub URL or local path. The dashboard streams every Red verdict and Blue
        patch live, then exports SARIF for code-scanning ingestion.
      </p>
      <form className="ow-cta" onSubmit={handleSubmit}>
        <input
          name="target"
          placeholder="github.com/owner/repo or /local/path"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit">Start scan</button>
      </form>
      <p className="ow-caption">Built for the AMD Developer Cloud hackathon · MIT license</p>
    </section>
  );
}

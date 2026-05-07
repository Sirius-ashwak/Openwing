// Settings screen — endpoint, model, export, sandbox

function SettingRow({ label, hint, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, padding: '16px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: 'var(--fg-dim)', marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono = true, secret = false }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} type={secret ? 'password' : 'text'}
      className={mono ? 'mono' : ''}
      style={{
        width: '100%', height: 32, padding: '0 12px', background: 'var(--bg-2)',
        border: '1px solid var(--line)', borderRadius: 6, color: 'var(--fg)',
        fontSize: 12, outline: 0, fontFamily: mono ? 'var(--mono)' : 'var(--sans)',
      }} />
  );
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      position: 'relative', width: 38, height: 22, padding: 0, border: 0,
      borderRadius: 999, background: value ? 'var(--accent)' : 'var(--bg-3)',
      cursor: 'pointer', transition: 'background .15s',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 18, height: 18, borderRadius: 999, background: '#fff',
        transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.3)',
      }} />
    </button>
  );
}

function ScreenSettings() {
  const [endpoint, setEndpoint] = React.useState('http://rocm0:8000/v1');
  const [apiKey, setApiKey] = React.useState('sk-rocm-redacted-XXXX');
  const [model, setModel] = React.useState('Qwen3.5-9B');
  const [exportSARIF, setExportSARIF] = React.useState(true);
  const [exportSBOM, setExportSBOM] = React.useState(false);
  const [autoTriageFP, setAutoTriageFP] = React.useState(true);
  const [maxLoops, setMaxLoops] = React.useState(3);
  const [sandboxImage, setSandboxImage] = React.useState('python:3.11-slim');
  const [redactSecrets, setRedactSecrets] = React.useState(true);

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '20px 28px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Settings</h1>
        <p style={{ margin: '4px 0 24px', color: 'var(--fg-mid)' }}>Configure the LLM endpoint, export formats, and sandbox runtime. Changes are saved per-workspace.</p>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--fg-faint)', textTransform: 'uppercase', marginTop: 24, marginBottom: 4 }}>Inference endpoint</div>
        <SettingRow label="Base URL" hint="OpenAI-compatible vLLM endpoint. Maps to OPENAI_BASE_URL.">
          <TextInput value={endpoint} onChange={setEndpoint} />
        </SettingRow>
        <SettingRow label="API key" hint="Bearer token sent with each request. Stored encrypted.">
          <TextInput value={apiKey} onChange={setApiKey} secret />
        </SettingRow>
        <SettingRow label="Model" hint="Maps to LLM_MODEL. Both agents share the same model in v0.4.">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="mono"
            style={{ width: '100%', height: 32, padding: '0 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--fg)', fontSize: 12, outline: 0 }}>
            <option>Qwen3.5-9B</option>
            <option>Qwen2.5-32B</option>
            <option>Llama-3.1-8B</option>
          </select>
        </SettingRow>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--fg-faint)', textTransform: 'uppercase', marginTop: 32, marginBottom: 4 }}>Export formats</div>
        <SettingRow label="SARIF 2.1.0" hint="Static Analysis Results Interchange Format. Drops into GitHub code scanning.">
          <Toggle value={exportSARIF} onChange={setExportSARIF} />
        </SettingRow>
        <SettingRow label="CycloneDX SBOM" hint="Software Bill of Materials including detected vulnerabilities.">
          <Toggle value={exportSBOM} onChange={setExportSBOM} />
        </SettingRow>
        <SettingRow label="Redact secrets in PoC" hint="Automatically replace credentials, tokens, and PII in exploit output before export.">
          <Toggle value={redactSecrets} onChange={setRedactSecrets} />
        </SettingRow>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--fg-faint)', textTransform: 'uppercase', marginTop: 32, marginBottom: 4 }}>Loop & sandbox</div>
        <SettingRow label="Max patch cycles" hint="Hard cap on attack/defend rounds before marking partial.">
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 5, 10].map((n) => (
              <button key={n} onClick={() => setMaxLoops(n)} className="mono" style={{
                width: 36, height: 28, borderRadius: 5, fontSize: 12,
                background: n === maxLoops ? 'var(--accent-bg)' : 'var(--bg-2)',
                border: `1px solid ${n === maxLoops ? 'var(--accent-line)' : 'var(--line)'}`,
                color: n === maxLoops ? 'var(--accent)' : 'var(--fg-mid)', cursor: 'pointer',
              }}>{n}</button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="Sandbox image" hint="Docker image used to execute Red Team PoCs.">
          <TextInput value={sandboxImage} onChange={setSandboxImage} />
        </SettingRow>
        <SettingRow label="Auto-triage false positives" hint="Skip findings where Janus_Red itself flags the result as unreachable.">
          <Toggle value={autoTriageFP} onChange={setAutoTriageFP} />
        </SettingRow>

        <div style={{ display: 'flex', gap: 8, marginTop: 32 }}>
          <button className="btn primary">Save settings</button>
          <button className="btn">Reset to defaults</button>
          <div style={{ flex: 1 }} />
          <button className="btn danger">Disconnect endpoint</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenSettings });

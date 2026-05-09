import type { Finding, RepoInfo } from './types';

export interface SarifReport {
  version: '2.1.0';
  $schema: string;
  runs: Array<{
    tool: { driver: { name: string; version: string } };
    results: Array<{
      ruleId: string;
      level: 'error';
      message: { text: string };
      locations: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region: { startLine: number };
        };
      }>;
      properties: { openwingId: string };
    }>;
    properties: { repository: string; scannedAt: string };
  }>;
}

export function buildSARIF(findings: Finding[], repo: RepoInfo): SarifReport {
  const results = findings
    .filter((f) => f.triage !== 'false-positive')
    .map((f) => ({
      ruleId: f.vulnerability_type ?? f.cwe ?? 'unknown',
      level: 'error' as const,
      message: { text: f.vulnerability_type ?? f.title },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: f.file },
            region: { startLine: f.line || 1 },
          },
        },
      ],
      properties: { openwingId: f.id },
    }));
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: { driver: { name: 'Openwing Janus', version: '0.5.0' } },
        results,
        properties: {
          repository: repo.url || '',
          scannedAt: new Date().toISOString(),
        },
      },
    ],
  };
}

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export async function getHealth(): Promise<{ status: string; providers: unknown[] }> {
  return fetch('/api/health')
    .then((r) => r.json() as Promise<{ status: string; providers: unknown[] }>)
    .catch(() => ({ status: 'unknown', providers: [] }));
}

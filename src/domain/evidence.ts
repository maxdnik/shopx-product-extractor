import type { ExtractSource } from './sources.js';

export type EvidenceKind =
  | 'json_ld'
  | 'microdata'
  | 'rdfa'
  | 'meta'
  | 'embedded_json'
  | 'network_response'
  | 'rendered_dom'
  | 'ai_evidence'
  | 'provider_response'
  | 'cache';

export type Evidence = {
  id: string;
  source: ExtractSource;
  kind: EvidenceKind;
  selectorOrPath?: string;
  url?: string;
  snippet?: string;
  rawHash?: string;
  capturedAt: string;
};

export type EvidenceRef = Pick<Evidence, 'id' | 'source' | 'kind' | 'selectorOrPath'>;

export function evidenceRef(evidence: Evidence): EvidenceRef {
  return {
    id: evidence.id,
    source: evidence.source,
    kind: evidence.kind,
    ...(evidence.selectorOrPath ? { selectorOrPath: evidence.selectorOrPath } : {})
  };
}

export function createEvidence(input: Omit<Evidence, 'id' | 'capturedAt'> & { id?: string; capturedAt?: string }): Evidence {
  const id =
    input.id ??
    `${input.source}:${input.kind}:${input.selectorOrPath ?? 'root'}:${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    source: input.source,
    kind: input.kind,
    ...(input.selectorOrPath ? { selectorOrPath: input.selectorOrPath } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.snippet ? { snippet: truncateEvidenceSnippet(input.snippet) } : {}),
    ...(input.rawHash ? { rawHash: input.rawHash } : {}),
    capturedAt: input.capturedAt ?? new Date().toISOString()
  };
}

export function truncateEvidenceSnippet(snippet: string, maxLength = 1_000): string {
  const compact = snippet.replace(/\s+/g, ' ').trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}

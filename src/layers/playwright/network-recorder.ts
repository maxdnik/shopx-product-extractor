import type { Page } from 'playwright';
import { createEvidence } from '../../domain/evidence.js';
import type { Evidence } from '../../domain/evidence.js';
import { sha256 } from '../../utils/hash.js';
import { findProductObjectsInResponse, looksLikeProductEndpoint } from './product-response-detector.js';
import type { JsonObject } from '../../utils/json.js';

export type ProductNetworkPayload = {
  url: string;
  object: JsonObject;
  evidence: Evidence;
};

export function attachNetworkRecorder(page: Page, limit = 25): ProductNetworkPayload[] {
  const payloads: ProductNetworkPayload[] = [];

  page.on('response', async (response) => {
    if (payloads.length >= limit) return;
    const url = response.url();
    const contentType = response.headers()['content-type'] ?? '';
    if (!looksLikeProductEndpoint(url) && !contentType.includes('json')) return;

    try {
      const data = await response.json();
      const objects = findProductObjectsInResponse(data);
      for (const object of objects) {
        if (payloads.length >= limit) break;
        const raw = JSON.stringify(object);
        payloads.push({
          url,
          object,
          evidence: createEvidence({
            source: 'PLAYWRIGHT_NETWORK',
            kind: 'network_response',
            selectorOrPath: url,
            url,
            snippet: raw,
            rawHash: sha256(raw)
          })
        });
      }
    } catch {
      // Non-JSON, failed, or already-consumed bodies are ignored by design.
    }
  });

  return payloads;
}

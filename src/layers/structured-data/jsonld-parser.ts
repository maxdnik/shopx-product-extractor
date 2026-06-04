import * as cheerio from 'cheerio';
import { createEvidence } from '../../domain/evidence.js';
import type { Evidence } from '../../domain/evidence.js';
import { safeJsonParse } from '../../utils/json.js';
import { sha256 } from '../../utils/hash.js';

export type JsonLdBlock = {
  data: unknown;
  evidence: Evidence;
};

export function extractJsonLdBlocks(html: string, pageUrl: string): JsonLdBlock[] {
  const $ = cheerio.load(html);
  const blocks: JsonLdBlock[] = [];

  $('script[type="application/ld+json"]').each((index, element) => {
    const raw = $(element).text();
    const parsed = safeJsonParse(cleanJsonLd(raw));
    if (!parsed) return;

    blocks.push({
      data: parsed,
      evidence: createEvidence({
        source: 'JSON_LD',
        kind: 'json_ld',
        selectorOrPath: `script[type="application/ld+json"][${index}]`,
        url: pageUrl,
        snippet: raw,
        rawHash: sha256(raw)
      })
    });
  });

  return blocks;
}

function cleanJsonLd(raw: string): string {
  return raw.trim().replace(/^\s*<!--/, '').replace(/-->\s*$/, '');
}

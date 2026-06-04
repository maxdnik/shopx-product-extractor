import type { PartialProductExtractResult, ProductExtractFieldName } from '../../domain/product-extract-result.js';
import type { PartialExtraction } from '../../pipeline/partial-extraction.js';
import { emptyPartialExtraction } from '../../pipeline/partial-extraction.js';
import { fetchHtml, type HtmlFetcherOptions } from './html-fetcher.js';
import { extractJsonLdBlocks } from './jsonld-parser.js';
import { parseSchemaOrgProducts } from './schema-org-product-parser.js';
import { parseOpenGraph } from './opengraph-parser.js';
import { parseEmbeddedProductJson } from './embedded-json-parser.js';

export type StructuredDataLayerOptions = HtmlFetcherOptions & {
  html?: string;
};

export async function runStructuredDataLayer(url: string, options: StructuredDataLayerOptions = {}): Promise<PartialExtraction> {
  const partial = emptyPartialExtraction('structured-data');
  const htmlResult = options.html
    ? { html: options.html, finalUrl: url, status: 200, contentType: 'text/html', url, durationMs: 0 }
    : await fetchHtml(url, options);

  if (htmlResult.status >= 400) {
    partial.warnings.push(`Structured data fetch returned HTTP ${htmlResult.status}`);
  }

  const jsonLdBlocks = extractJsonLdBlocks(htmlResult.html, htmlResult.finalUrl);
  const schemaCandidates = parseSchemaOrgProducts(jsonLdBlocks, htmlResult.finalUrl);
  const openGraph = parseOpenGraph(htmlResult.html, htmlResult.finalUrl);
  const embedded = parseEmbeddedProductJson(htmlResult.html, htmlResult.finalUrl);

  for (const block of jsonLdBlocks) partial.evidence.push(block.evidence);
  for (const candidate of schemaCandidates) mergePartialFields(partial, candidate.fields);
  for (const evidence of openGraph.evidence) partial.evidence.push(evidence);
  mergePartialFields(partial, openGraph.fields);
  for (const evidence of embedded.evidence) partial.evidence.push(evidence);
  mergePartialFields(partial, embedded.fields);

  partial.evidence = [...new Map(partial.evidence.map((evidence) => [evidence.id, evidence])).values()];
  return partial;
}

function mergePartialFields(target: PartialExtraction, fields: PartialProductExtractResult): void {
  for (const [key, value] of Object.entries(fields) as Array<[ProductExtractFieldName, PartialProductExtractResult[ProductExtractFieldName]]>) {
    if (!value) continue;
    const current = target.fields[key];
    if (!current || value.confidence > current.confidence) {
      target.fields[key] = value as never;
      if (!target.fieldsUpdated.includes(key)) target.fieldsUpdated.push(key);
    }
  }
}

import { createEvidence, evidenceRef } from '../../domain/evidence.js';
import { field } from '../../domain/product-extract-result.js';
import type { StoreInfo } from '../../domain/store.js';
import type { PartialExtraction } from '../../pipeline/partial-extraction.js';
import { emptyPartialExtraction } from '../../pipeline/partial-extraction.js';
import { fetchHtml, type HtmlFetcherOptions } from '../structured-data/html-fetcher.js';
import { bigCommerceAdapter } from './adapters/bigcommerce-adapter.js';
import { customAdapter } from './adapters/custom-adapter.js';
import { magentoAdapter } from './adapters/magento-adapter.js';
import type { PlatformAdapter } from './adapters/platform-adapter.js';
import { sfccAdapter } from './adapters/sfcc-adapter.js';
import { shopifyAdapter } from './adapters/shopify-adapter.js';
import { woocommerceAdapter } from './adapters/woocommerce-adapter.js';
import { detectPlatform } from './platform-detector.js';

const ADAPTERS: PlatformAdapter[] = [
  shopifyAdapter,
  woocommerceAdapter,
  magentoAdapter,
  bigCommerceAdapter,
  sfccAdapter,
  customAdapter
];

export type PlatformDetectionLayerOptions = HtmlFetcherOptions & {
  html?: string;
  storeDomain?: string;
};

export async function runPlatformDetectionLayer(url: string, options: PlatformDetectionLayerOptions = {}): Promise<PartialExtraction> {
  const htmlResult = options.html
    ? { html: options.html, finalUrl: url, status: 200, contentType: 'text/html', url, durationMs: 0 }
    : await fetchHtml(url, options);
  const detection = detectPlatform(htmlResult.html, htmlResult.finalUrl);
  const partial = emptyPartialExtraction('platform-detection');
  const domain = options.storeDomain ?? new URL(htmlResult.finalUrl).hostname.replace(/^www\./, '');
  const evidence = createEvidence({
    source: 'NORMALIZER',
    kind: 'embedded_json',
    selectorOrPath: 'platform-detector.signals',
    url: htmlResult.finalUrl,
    snippet: JSON.stringify(detection.signals)
  });
  const store: StoreInfo = {
    domain,
    platform: detection.platform,
    platformConfidence: detection.confidence
  };
  partial.fields.store = field(store, 'NORMALIZER', detection.confidence, [evidenceRef(evidence)]);
  partial.fieldsUpdated.push('store');
  partial.evidence.push(evidence);

  const adapter = ADAPTERS.find((candidate) => candidate.platform === detection.platform) ?? customAdapter;
  const adapterResult = await adapter.extract({
    url: htmlResult.finalUrl,
    html: htmlResult.html,
    platform: detection.platform
  });

  Object.assign(partial.fields, adapterResult.fields);
  partial.fieldsUpdated = [...new Set([...partial.fieldsUpdated, ...adapterResult.fieldsUpdated])];
  partial.evidence.push(...adapterResult.evidence);
  partial.warnings.push(...adapterResult.warnings);
  return partial;
}

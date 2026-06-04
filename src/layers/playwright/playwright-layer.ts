import { createEvidence, evidenceRef } from '../../domain/evidence.js';
import { field } from '../../domain/product-extract-result.js';
import { productObjectToPartial } from '../platform/adapters/adapter-utils.js';
import { emptyPartialExtraction } from '../../pipeline/partial-extraction.js';
import { BrowserPool } from './browser-pool.js';
import { attachNetworkRecorder } from './network-recorder.js';
import { detectRenderedAvailability } from './availability-detector.js';
import { detectRenderedImages } from './media-detector.js';
import { parseRenderedState } from './rendered-state-extractor.js';
import { discoverRenderedVariantOptions, optionOnlyVariant } from './variant-discovery.js';

export type PlaywrightLayerOptions = {
  timeoutMs?: number;
  browserPool?: BrowserPool;
};

export async function runPlaywrightLayer(url: string, options: PlaywrightLayerOptions = {}) {
  const partial = emptyPartialExtraction('playwright');
  const pool = options.browserPool ?? new BrowserPool();
  const browser = await pool.browser();
  const page = await browser.newPage();
  const networkPayloads = attachNetworkRecorder(page);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs ?? 15_000 });
    await page.waitForLoadState('networkidle', { timeout: Math.min(options.timeoutMs ?? 15_000, 5_000) }).catch(() => undefined);

    for (const payload of networkPayloads) {
      const result = productObjectToPartial({
        object: payload.object,
        source: 'PLAYWRIGHT_NETWORK',
        pageUrl: url,
        evidencePath: payload.url,
        confidence: 0.9
      });
      Object.assign(partial.fields, result.fields);
      partial.evidence.push(payload.evidence, ...result.evidence);
    }

    const html = await page.content();
    const state = parseRenderedState(html, page.url());
    Object.assign(partial.fields, state.fields);
    partial.evidence.push(...state.evidence);

    const renderedAvailability = await detectRenderedAvailability(page);
    if (renderedAvailability !== 'UNKNOWN' && !partial.fields.availability) {
      const evidence = createEvidence({
        source: 'PLAYWRIGHT_RENDERED_DOM',
        kind: 'rendered_dom',
        selectorOrPath: 'rendered availability text/button state',
        url: page.url(),
        snippet: renderedAvailability
      });
      partial.fields.availability = field(renderedAvailability, 'PLAYWRIGHT_RENDERED_DOM', 0.68, [evidenceRef(evidence)]);
      partial.evidence.push(evidence);
    }

    const images = await detectRenderedImages(page, page.url());
    if (images.length && !partial.fields.images) {
      const evidence = createEvidence({
        source: 'PLAYWRIGHT_RENDERED_DOM',
        kind: 'rendered_dom',
        selectorOrPath: 'document.images',
        url: page.url(),
        snippet: images.slice(0, 10).join('\n')
      });
      partial.fields.images = field(images, 'PLAYWRIGHT_RENDERED_DOM', 0.66, [evidenceRef(evidence)]);
      partial.evidence.push(evidence);
    }

    const renderedOptions = await discoverRenderedVariantOptions(page);
    if (renderedOptions.colors.length && !partial.fields.colors) {
      partial.fields.colors = field(renderedOptions.colors, 'PLAYWRIGHT_RENDERED_DOM', 0.58);
    }
    if (renderedOptions.sizes.length && !partial.fields.sizes) {
      partial.fields.sizes = field(renderedOptions.sizes, 'PLAYWRIGHT_RENDERED_DOM', 0.58);
    }
    if (!partial.fields.variants && (renderedOptions.colors.length || renderedOptions.sizes.length)) {
      const variants = [
        ...renderedOptions.colors.map((color, index) => optionOnlyVariant(`rendered-color-${index}`, color, null)),
        ...renderedOptions.sizes.map((size, index) => optionOnlyVariant(`rendered-size-${index}`, null, size))
      ];
      partial.fields.variants = field(variants, 'PLAYWRIGHT_RENDERED_DOM', 0.45);
    }

    partial.fieldsUpdated = Object.keys(partial.fields) as typeof partial.fieldsUpdated;
    return partial;
  } finally {
    await page.close();
    if (!options.browserPool) await pool.close();
  }
}

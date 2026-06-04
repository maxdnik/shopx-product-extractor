import { emptyPartialExtraction } from '../../../pipeline/partial-extraction.js';
import { safeJsonParse, isRecord } from '../../../utils/json.js';
import type { PlatformAdapter, PlatformAdapterContext } from './platform-adapter.js';
import { productObjectToPartial } from './adapter-utils.js';

export const magentoAdapter: PlatformAdapter = {
  platform: 'MAGENTO',
  async extract(context: PlatformAdapterContext) {
    const partial = emptyPartialExtraction('platform-magento');
    const configs = extractMagentoConfigs(context.html);

    for (const config of configs) {
      const result = productObjectToPartial({
        object: config,
        source: 'PLATFORM_MAGENTO',
        pageUrl: context.url,
        evidencePath: 'Magento configurable product JSON',
        confidence: 0.9
      });
      Object.assign(partial.fields, result.fields);
      partial.evidence.push(...result.evidence);
    }

    partial.fieldsUpdated = Object.keys(partial.fields) as typeof partial.fieldsUpdated;
    return partial;
  }
};

function extractMagentoConfigs(html: string) {
  const configs = [];
  for (const match of html.matchAll(/"jsonConfig"\s*:\s*(\{[\s\S]*?\})\s*(?:,\s*"|})/g)) {
    const parsed = safeJsonParse(match[1] ?? '');
    if (isRecord(parsed)) configs.push(parsed);
  }
  for (const match of html.matchAll(/spConfig\s*=\s*(\{[\s\S]*?\});/g)) {
    const parsed = safeJsonParse(match[1] ?? '');
    if (isRecord(parsed)) configs.push(parsed);
  }
  return configs;
}

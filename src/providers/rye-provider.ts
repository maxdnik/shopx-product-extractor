import type { FallbackProvider, FallbackProviderContext } from './fallback-provider.js';
import { providerResponseToPartial } from './provider-normalizer.js';

export class RyeProvider implements FallbackProvider {
  name = 'rye' as const;

  constructor(private readonly apiKey = process.env.RYE_API_KEY) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async extract(context: FallbackProviderContext) {
    if (!this.apiKey) throw new Error('RYE_API_KEY is not configured');
    const response = await fetch(`https://api.rye.com/api/v1/products/lookup?url=${encodeURIComponent(context.url)}`, {
      headers: { authorization: `Bearer ${this.apiKey}` }
    });
    const data = await response.json();
    return providerResponseToPartial({
      layer: 'provider-rye',
      source: 'RYE_API',
      url: context.url,
      response: data
    });
  }
}

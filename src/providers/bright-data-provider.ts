import type { FallbackProvider, FallbackProviderContext } from './fallback-provider.js';
import { providerResponseToPartial } from './provider-normalizer.js';

export class BrightDataProvider implements FallbackProvider {
  name = 'bright-data' as const;

  constructor(
    private readonly apiKey = process.env.BRIGHT_DATA_API_KEY,
    private readonly endpoint = process.env.BRIGHT_DATA_PRODUCT_ENDPOINT
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.endpoint);
  }

  async extract(context: FallbackProviderContext) {
    if (!this.apiKey || !this.endpoint) {
      throw new Error('BRIGHT_DATA_API_KEY and BRIGHT_DATA_PRODUCT_ENDPOINT are required');
    }
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ url: context.url })
    });
    const data = await response.json();
    return providerResponseToPartial({
      layer: 'provider-bright-data',
      source: 'BRIGHT_DATA_API',
      url: context.url,
      response: data
    });
  }
}

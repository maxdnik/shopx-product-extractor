import type { FallbackProvider, FallbackProviderContext } from './fallback-provider.js';
import { providerResponseToPartial } from './provider-normalizer.js';

export class ZyteProvider implements FallbackProvider {
  name = 'zyte' as const;

  constructor(private readonly apiKey = process.env.ZYTE_API_KEY) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async extract(context: FallbackProviderContext) {
    if (!this.apiKey) throw new Error('ZYTE_API_KEY is not configured');
    const response = await fetch('https://api.zyte.com/v1/extract', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        url: context.url,
        product: true,
        productOptions: { extractFrom: 'httpResponseBody' }
      })
    });
    const data = await response.json();
    return providerResponseToPartial({
      layer: 'provider-zyte',
      source: 'ZYTE_API',
      url: context.url,
      response: data,
      productPath: 'product'
    });
  }
}

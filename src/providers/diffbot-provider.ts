import type { FallbackProvider, FallbackProviderContext } from './fallback-provider.js';
import { providerResponseToPartial } from './provider-normalizer.js';

export class DiffbotProvider implements FallbackProvider {
  name = 'diffbot' as const;

  constructor(private readonly token = process.env.DIFFBOT_TOKEN) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async extract(context: FallbackProviderContext) {
    if (!this.token) throw new Error('DIFFBOT_TOKEN is not configured');
    const url = new URL('https://api.diffbot.com/v3/product');
    url.searchParams.set('token', this.token);
    url.searchParams.set('url', context.url);
    const response = await fetch(url);
    const data = await response.json();
    return providerResponseToPartial({
      layer: 'provider-diffbot',
      source: 'DIFFBOT_API',
      url: context.url,
      response: data,
      productPath: 'objects.0'
    });
  }
}

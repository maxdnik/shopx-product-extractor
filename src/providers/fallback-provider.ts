import type { PartialExtraction } from '../pipeline/partial-extraction.js';

export type FallbackProviderName = 'rye' | 'diffbot' | 'zyte' | 'bright-data';

export type FallbackProviderContext = {
  url: string;
};

export type FallbackProvider = {
  name: FallbackProviderName;
  isConfigured(): boolean;
  extract(context: FallbackProviderContext): Promise<PartialExtraction>;
};

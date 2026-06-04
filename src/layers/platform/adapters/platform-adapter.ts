import type { EcommercePlatform } from '../../../domain/store.js';
import type { PartialExtraction } from '../../../pipeline/partial-extraction.js';

export type PlatformAdapterContext = {
  url: string;
  html: string;
  platform: EcommercePlatform;
};

export type PlatformAdapter = {
  platform: EcommercePlatform;
  extract(context: PlatformAdapterContext): Promise<PartialExtraction>;
};

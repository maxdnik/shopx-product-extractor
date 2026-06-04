import { emptyPartialExtraction } from '../../../pipeline/partial-extraction.js';
import type { PlatformAdapter, PlatformAdapterContext } from './platform-adapter.js';

export const customAdapter: PlatformAdapter = {
  platform: 'CUSTOM',
  async extract(_context: PlatformAdapterContext) {
    return emptyPartialExtraction('platform-custom');
  }
};

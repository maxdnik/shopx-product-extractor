import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test',
  timeout: 30_000,
  use: {
    headless: true,
    viewport: { width: 1440, height: 1200 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 ShopXProductDiscoveryBot/0.1'
  }
});

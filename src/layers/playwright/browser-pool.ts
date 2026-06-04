import { chromium, type Browser } from 'playwright';

export class BrowserPool {
  private browserPromise: Promise<Browser> | null = null;

  async browser(): Promise<Browser> {
    this.browserPromise ??= chromium.launch({ headless: true });
    return this.browserPromise;
  }

  async close(): Promise<void> {
    const browser = await this.browserPromise;
    await browser?.close();
    this.browserPromise = null;
  }
}

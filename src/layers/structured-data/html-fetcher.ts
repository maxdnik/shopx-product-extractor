export type HtmlFetchResult = {
  url: string;
  finalUrl: string;
  html: string;
  status: number;
  contentType: string | null;
  durationMs: number;
};

export type HtmlFetcherOptions = {
  timeoutMs?: number;
  userAgent?: string;
};

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 ShopXProductDiscoveryBot/0.1';

export async function fetchHtml(url: string, options: HtmlFetcherOptions = {}): Promise<HtmlFetchResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': options.userAgent ?? DEFAULT_USER_AGENT
      }
    });
    const html = await response.text();
    return {
      url,
      finalUrl: response.url,
      html,
      status: response.status,
      contentType: response.headers.get('content-type'),
      durationMs: Math.round(performance.now() - started)
    };
  } finally {
    clearTimeout(timeout);
  }
}

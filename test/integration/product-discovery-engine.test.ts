import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductDiscoveryEngine } from '../../src/pipeline/product-discovery-engine.js';

let server: Server | null = null;

describe('ProductDiscoveryEngine', () => {
  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  });

  it('extracts through the pipeline and serves repeat requests from cache', async () => {
    let requests = 0;
    const html = readFileSync('test/fixtures/html/schema-product-group.html', 'utf8');
    const port = await startServer((_req, res) => {
      requests += 1;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(html);
    });

    const engine = new ProductDiscoveryEngine();
    const url = `http://127.0.0.1:${port}/products/runner`;
    const first = await engine.extract(url);
    const second = await engine.extract(url);

    expect(first.title.value).toBe('ShopX Runner');
    expect(first.price.value).toBe(199.99);
    expect(first.extraction.cacheHit).toBe(false);
    expect(second.extraction.cacheHit).toBe(true);
    expect(requests).toBe(1);
  });
});

async function startServer(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<number> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to allocate test port');
  return address.port;
}

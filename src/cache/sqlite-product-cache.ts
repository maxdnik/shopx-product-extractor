import { DatabaseSync } from 'node:sqlite';
import type { ProductExtractResult } from '../domain/product-extract-result.js';
import { isCacheUsable, type CachePolicy } from './cache-policy.js';
import type { CachedProduct, ProductCache } from './product-cache.js';

type CacheRow = {
  cache_key: string;
  normalized_url: string;
  result_json: string;
  fetched_at: string;
  expires_at: string | null;
};

export class SqliteProductCache implements ProductCache {
  private readonly db: DatabaseSync;

  constructor(filename = '.shopx-product-cache.sqlite') {
    this.db = new DatabaseSync(filename);
    this.migrate();
  }

  async get(cacheKey: string, policy: CachePolicy): Promise<CachedProduct | null> {
    const row = this.db
      .prepare('SELECT cache_key, normalized_url, result_json, fetched_at, expires_at FROM product_cache WHERE cache_key = ?')
      .get(cacheKey) as CacheRow | undefined;

    if (!row || !isCacheUsable({ fetchedAt: row.fetched_at, expiresAt: row.expires_at }, policy)) {
      return null;
    }

    this.db.prepare('UPDATE product_cache SET last_accessed_at = ? WHERE cache_key = ?').run(new Date().toISOString(), cacheKey);
    const result = JSON.parse(row.result_json) as ProductExtractResult;
    result.extraction.cacheHit = true;
    return {
      cacheKey: row.cache_key,
      normalizedUrl: row.normalized_url,
      result,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at
    };
  }

  async set(entry: CachedProduct): Promise<void> {
    const store = entry.result.store.value;
    this.db
      .prepare(
        `INSERT INTO product_cache (
          cache_key, normalized_url, canonical_url, store_domain, product_id, sku,
          result_json, overall_confidence, extraction_version, fetched_at, expires_at, last_accessed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          normalized_url = excluded.normalized_url,
          canonical_url = excluded.canonical_url,
          store_domain = excluded.store_domain,
          product_id = excluded.product_id,
          sku = excluded.sku,
          result_json = excluded.result_json,
          overall_confidence = excluded.overall_confidence,
          extraction_version = excluded.extraction_version,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at,
          last_accessed_at = excluded.last_accessed_at`
      )
      .run(
        entry.cacheKey,
        entry.normalizedUrl,
        entry.result.canonicalUrl.value,
        store?.domain ?? null,
        entry.result.productId.value,
        entry.result.sku.value,
        JSON.stringify(entry.result),
        entry.result.confidence,
        entry.result.extraction.version,
        entry.fetchedAt,
        entry.expiresAt ?? null,
        new Date().toISOString()
      );
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS product_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT NOT NULL UNIQUE,
        normalized_url TEXT NOT NULL,
        canonical_url TEXT,
        store_domain TEXT,
        product_id TEXT,
        sku TEXT,
        result_json TEXT NOT NULL,
        overall_confidence REAL NOT NULL,
        extraction_version TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        fetched_at TEXT NOT NULL,
        expires_at TEXT,
        last_accessed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_product_cache_store_product_id ON product_cache(store_domain, product_id);
      CREATE INDEX IF NOT EXISTS idx_product_cache_store_sku ON product_cache(store_domain, sku);
      CREATE INDEX IF NOT EXISTS idx_product_cache_expires_at ON product_cache(expires_at);
    `);
  }
}

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

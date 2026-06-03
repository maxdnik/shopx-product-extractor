import { extractAmazonProduct } from "./extractors/amazon";
import { extractAdidasProduct } from "./extractors/adidas";
import { extractGapProduct } from "./extractors/gap";
import { extractGenericProduct } from "./extractors/generic";
import { extractGucciProduct } from "./extractors/gucci";
import { extractNikeProduct } from "./extractors/nike";
import { extractRalphLaurenProduct } from "./extractors/ralphlauren";
import { extractCalvinKleinProduct } from "./extractors/calvinklein";
import { extractTheNorthFaceProduct } from "./extractors/thenorthface";
import { normalizeProductUrl } from "./normalize-url";
import { extractWithPlaywright } from "./playwright";
import type {
  ExtractProductOptions,
  ExtractorContext,
  ProductExtractResult,
  ProductExtractor,
  StoreId,
} from "./types";
import {
  calculateConfidence,
  createEmptyResult,
  fetchHtml,
  finalizeResult,
  mergeProductResults,
} from "./utils";

export type { ExtractProductOptions, ProductExtractResult } from "./types";
export { normalizeProductUrl } from "./normalize-url";

function extractorForStore(store: StoreId): ProductExtractor {
  switch (store) {
    case "nike":
      return extractNikeProduct;
    case "amazon":
      return extractAmazonProduct;
    case "thenorthface":
      return extractTheNorthFaceProduct;
    case "ralphlauren":
      return extractRalphLaurenProduct;
    case "calvinklein":
      return extractCalvinKleinProduct;
    case "gap":
      return extractGapProduct;
    case "gucci":
      return extractGucciProduct;
    case "adidas":
      return extractAdidasProduct;
    case "generic":
      return extractGenericProduct;
  }
}

function invalidUrlResult(input: string, message: string): ProductExtractResult {
  return {
    ok: false,
    sourceUrl: input,
    normalizedUrl: input,
    store: "generic",
    domain: "",
    images: [],
    variants: {
      colors: [],
      sizes: [],
      capacities: [],
      dimensions: [],
      styles: [],
    },
    confidence: {
      title: 0,
      price: 0,
      images: 0,
      variants: 0,
      overall: 0,
    },
    extraction: {
      method: "fallback",
      storeSpecific: false,
      warnings: [message],
    },
    error: message,
  };
}

export async function extractProduct(
  url: string,
  options: ExtractProductOptions = {},
): Promise<ProductExtractResult> {
  let normalized;
  try {
    normalized = normalizeProductUrl(url);
  } catch (error) {
    return invalidUrlResult(
      url,
      error instanceof Error ? error.message : "Invalid product URL",
    );
  }

  const fetchWarnings: string[] = [];
  let html = options.html;
  let finalUrl: string | undefined;
  let fetchStatus: number | undefined;

  if (!html && options.fetchHtml !== false) {
    const fetched = await fetchHtml(
      normalized.normalizedUrl,
      options.timeoutMs ?? Number(process.env.PRODUCT_EXTRACTOR_TIMEOUT_MS ?? 18_000),
    );
    html = fetched.html;
    finalUrl = fetched.finalUrl;
    fetchStatus = fetched.status;
    fetchWarnings.push(...fetched.warnings);
    if (!fetched.ok && fetched.error) {
      fetchWarnings.push(fetched.error);
    }
  }

  const context: ExtractorContext = {
    normalized,
    html,
    finalUrl,
    fetchStatus,
    fetchWarnings,
    options: {
      ...options,
      includeDebug: options.includeDebug ?? process.env.PRODUCT_EXTRACTOR_DEBUG === "true",
    },
  };

  try {
    const extractor = extractorForStore(normalized.store);
    let result = await extractor(context);

    if (!result.blocked && (result.confidence.overall < 0.7 || options.usePlaywright === true)) {
      const browserData = await extractWithPlaywright(context);
      result = mergeProductResults(result, browserData);
    }

    result.confidence = calculateConfidence(result);
    return finalizeResult(result);
  } catch (error) {
    const fallback = createEmptyResult(context, [
      error instanceof Error ? error.message : "Unexpected extraction error",
    ]);
    fallback.error = error instanceof Error ? error.message : "Unexpected extraction error";
    return finalizeResult(fallback);
  }
}

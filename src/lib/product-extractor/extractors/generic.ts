import type {
  ExtractorContext,
  PartialProductData,
  ProductExtractResult,
} from "../types";
import {
  createEmptyResult,
  extractDomHeuristics,
  extractEmbeddedJsonCandidates,
  extractJsonLdProducts,
  extractMetaTags,
  extractOpenGraph,
  extractProductDataFromEmbeddedJson,
  finalizeResult,
  limitDebugData,
  loadHtml,
  mergeProductResults,
} from "../utils";

function addMissingHtmlWarning(result: ProductExtractResult): ProductExtractResult {
  if (!result.extraction.warnings.includes("No HTML available; only URL metadata extracted")) {
    result.extraction.warnings.push("No HTML available; only URL metadata extracted");
  }
  return result;
}

export async function extractGenericProduct(
  context: ExtractorContext,
): Promise<ProductExtractResult> {
  let result = createEmptyResult(context);

  if (!context.html) {
    return finalizeResult(addMissingHtmlWarning(result));
  }

  const $ = loadHtml(context.html);
  const baseUrl = context.finalUrl ?? context.normalized.normalizedUrl;
  const jsonLdProducts = extractJsonLdProducts($, baseUrl);
  const openGraph = extractOpenGraph($, baseUrl);
  const embeddedCandidates = extractEmbeddedJsonCandidates($);
  const embeddedProducts = extractProductDataFromEmbeddedJson(embeddedCandidates, baseUrl);
  const dom = extractDomHeuristics($, baseUrl);

  const layers: PartialProductData[] = [
    ...jsonLdProducts,
    openGraph,
    ...embeddedProducts,
    dom,
  ];

  for (const layer of layers) {
    result = mergeProductResults(result, layer);
  }

  if (context.options.includeDebug) {
    result.extraction.debug = limitDebugData({
      normalized: {
        removedParams: context.normalized.removedParams,
        preservedParams: context.normalized.preservedParams,
      },
      fetch: {
        finalUrl: context.finalUrl,
        status: context.fetchStatus,
      },
      jsonLdProducts: jsonLdProducts.length,
      embeddedCandidates: embeddedCandidates.map((candidate) => candidate.source).slice(0, 20),
      meta: extractMetaTags($),
    });
  }

  if (jsonLdProducts.length === 0) {
    result.extraction.warnings.push("JSON-LD Product metadata not found");
  }
  if (embeddedProducts.length === 0) {
    result.extraction.warnings.push("Embedded product JSON not found");
  }

  result.extraction.method =
    jsonLdProducts.length > 0
      ? "jsonld"
      : embeddedProducts.length > 0
        ? "embedded-json"
        : "fallback";

  return finalizeResult(result);
}

import type { ExtractorContext, ProductVariantOption } from "../types";
import { extractGenericProduct } from "./generic";
import {
  cleanText,
  dedupeVariantOptions,
  extractJsonSnippetValue,
  finalizeResult,
  getUrlPathCode,
  loadHtml,
  mergeProductResults,
  normalizeImageUrl,
  parsePrice,
  selectedParam,
} from "../utils";

function nikeSizeOptions(html: string): ProductVariantOption[] {
  const sizes = new Set<string>();
  const patterns = [
    /"localizedSize"\s*:\s*"([^"]+)"/gi,
    /"size"\s*:\s*"([^"]+)"/gi,
    /aria-label=["'](?:Size|Talla|Talle)\s+([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const label = cleanText(match[1]);
      if (label && label.length <= 30) sizes.add(label);
    }
  }

  return Array.from(sizes).map((label) => ({ label }));
}

export async function extractNikeProduct(context: ExtractorContext) {
  let result = await extractGenericProduct(context);
  result.extraction.storeSpecific = true;
  result.extraction.method = "store-specific";

  const productCode = getUrlPathCode(context.normalized.url, /\/([A-Z0-9]{2}\d{4,}[-A-Z0-9]+)$/i);
  result = mergeProductResults(result, {
    sku: productCode,
    productId: productCode,
    selectedColor: selectedParam(context.normalized.url, ["color", "colorway"]),
    extraction: { method: "store-specific", storeSpecific: true },
  });
  if (productCode) {
    result.sku = productCode;
    result.productId = productCode;
  }

  if (context.html) {
    const $ = loadHtml(context.html);
    const baseUrl = context.finalUrl ?? context.normalized.normalizedUrl;
    const colors: ProductVariantOption[] = [];

    $("a[href*='/t/'], button, [role='button']").each((_, element) => {
      const label =
        cleanText($(element).attr("aria-label")) ??
        cleanText($(element).attr("title")) ??
        cleanText($(element).find("img").attr("alt")) ??
        cleanText($(element).text());
      const href = normalizeImageUrl($(element).attr("href"), baseUrl);
      const image = normalizeImageUrl(
        $(element).find("img").attr("src") ?? $(element).find("img").attr("data-src"),
        baseUrl,
      );
      const text = `${label ?? ""} ${$(element).attr("class") ?? ""}`.toLowerCase();
      if (label && /(color|colour|colorway|style|selected|available|agotado)/i.test(text)) {
        colors.push({
          label,
          available: !/disabled|unavailable|sold out|agotado/i.test(text),
          image,
          url: href,
        });
      }
    });

    const embeddedColor = extractJsonSnippetValue(
      context.html,
      /"colorDescription"\s*:\s*"([^"]+)"/i,
    );
    if (embeddedColor) colors.push({ label: embeddedColor });

    result = mergeProductResults(result, {
      brand: result.brand ?? "Nike",
      price: result.price ?? parsePrice($("[data-test='product-price'], [class*='price']").first().text()),
      selectedColor: result.selectedColor ?? embeddedColor,
      variants: {
        colors: dedupeVariantOptions(colors),
        sizes: dedupeVariantOptions(nikeSizeOptions(context.html)),
      },
      extraction: {
        method: "store-specific",
        storeSpecific: true,
      },
    });
  }

  if (result.variants.sizes.length === 0) {
    result.extraction.warnings.push(
      "Nike sizes were not exposed in static HTML; enable Playwright if the PDP renders sizes client-side",
    );
  }
  if (result.variants.colors.length === 0) {
    result.extraction.warnings.push(
      "Nike colors were not exposed in static HTML; enable Playwright if colorways render client-side",
    );
  }

  return finalizeResult(result);
}

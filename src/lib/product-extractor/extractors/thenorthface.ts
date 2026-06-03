import type { ExtractorContext, ProductVariantOption } from "../types";
import { extractGenericProduct } from "./generic";
import {
  cleanText,
  dedupeVariantOptions,
  finalizeResult,
  getUrlPathCode,
  loadHtml,
  mergeProductResults,
  normalizeImageUrl,
  parsePrice,
  selectedParam,
} from "../utils";

export async function extractTheNorthFaceProduct(context: ExtractorContext) {
  let result = await extractGenericProduct(context);
  result.extraction.storeSpecific = true;
  result.extraction.method = "store-specific";

  const productId = getUrlPathCode(context.normalized.url, /-([A-Z0-9]{6,})$/i);
  const selectedColor = selectedParam(context.normalized.url, ["color", "dwvar"]);

  result = mergeProductResults(result, {
    productId,
    sku: productId,
    selectedColor,
    extraction: { method: "store-specific", storeSpecific: true },
  });

  if (context.html) {
    const $ = loadHtml(context.html);
    const baseUrl = context.finalUrl ?? context.normalized.normalizedUrl;
    const colors: ProductVariantOption[] = [];
    const sizes: ProductVariantOption[] = [];

    $("[data-attr='color'], [data-attribute='color'], [aria-label*='color' i], a[href*='color=']").each(
      (_, element) => {
        const $element = $(element);
        const label =
          cleanText($element.attr("aria-label")) ??
          cleanText($element.attr("title")) ??
          cleanText($element.find("img").attr("alt")) ??
          cleanText($element.text());
        if (!label) return;
        colors.push({
          label: label.replace(/^color[:\s-]*/i, ""),
          available: !/disabled|unavailable|not-available/i.test($element.attr("class") ?? ""),
          image: normalizeImageUrl($element.find("img").attr("src"), baseUrl),
          url: normalizeImageUrl($element.attr("href"), baseUrl),
        });
      },
    );

    $("[data-attr='size'], [data-attribute='size'], [aria-label*='size' i], button").each(
      (_, element) => {
        const $element = $(element);
        const contextText = `${$element.attr("aria-label") ?? ""} ${$element.parent().text()}`;
        if (!/size|talle|tamaño/i.test(contextText)) return;
        const label =
          cleanText($element.attr("aria-label")?.replace(/^(size|talle|tamaño)[:\s-]*/i, "")) ??
          cleanText($element.attr("value")) ??
          cleanText($element.text());
        if (!label || label.length > 30) return;
        sizes.push({
          label,
          available: !/disabled|unavailable|not-available/i.test($element.attr("class") ?? ""),
        });
      },
    );

    result = mergeProductResults(result, {
      price: result.price ?? parsePrice($("[class*='price' i], [data-test*='price' i]").first().text()),
      selectedColor: result.selectedColor ?? selectedColor,
      variants: {
        colors: dedupeVariantOptions(colors),
        sizes: dedupeVariantOptions(sizes),
      },
      extraction: { method: "store-specific", storeSpecific: true },
    });
  }

  if (result.variants.colors.length === 0) {
    result.extraction.warnings.push("The North Face color variants not found in static HTML");
  }
  if (result.variants.sizes.length === 0) {
    result.extraction.warnings.push("The North Face size variants not found in static HTML");
  }

  return finalizeResult(result);
}

import type { ExtractorContext, ProductVariantOption } from "../types";
import { extractGenericProduct } from "./generic";
import {
  cleanText,
  createBlockedResult,
  dedupeVariantOptions,
  finalizeResult,
  getUrlPathCode,
  isBlockedPage,
  isLikelyColorLabel,
  isLikelySizeLabel,
  loadHtml,
  mergeProductResults,
  normalizeImageUrl,
  parsePrice,
  replaceVariants,
  selectedParam,
} from "../utils";

function adidasOptions(
  $: ReturnType<typeof loadHtml>,
  baseUrl: string,
  kind: "color" | "size",
): ProductVariantOption[] {
  const options: ProductVariantOption[] = [];
  const selector =
    kind === "color"
      ? "a[href*='.html'], [data-testid*='color' i], [aria-label*='color' i]"
      : "button, option, [data-testid*='size' i], [aria-label*='size' i]";

  $(selector).each((_, element) => {
    const $element = $(element);
    const context = [
      $element.attr("aria-label"),
      $element.attr("title"),
      $element.attr("data-testid"),
      $element.closest("fieldset").find("legend").text(),
      $element.parent().text(),
    ]
      .map(cleanText)
      .filter(Boolean)
      .join(" ");
    if (kind === "color" && !/color|colour|colors|available.*in/i.test(context)) return;
    if (kind === "size" && !/size|talle|talla/i.test(context)) return;

    const label =
      cleanText($element.attr("aria-label")?.replace(/^(size|color)[:\s-]*/i, "")) ??
      cleanText($element.attr("title")) ??
      cleanText($element.find("img").attr("alt")) ??
      cleanText($element.attr("value")) ??
      cleanText($element.text());
    if (!label) return;
    if (kind === "color" && !isLikelyColorLabel(label)) return;
    if (kind === "size" && !isLikelySizeLabel(label)) return;

    options.push({
      label,
      value: cleanText($element.attr("value") ?? $element.attr("data-value")),
      available: !/disabled|unavailable|sold/i.test(
        `${$element.attr("class") ?? ""} ${$element.attr("aria-disabled") ?? ""}`,
      ),
      image: normalizeImageUrl($element.find("img").attr("src"), baseUrl),
      url: normalizeImageUrl($element.attr("href"), baseUrl),
    });
  });

  return dedupeVariantOptions(options);
}

export async function extractAdidasProduct(context: ExtractorContext) {
  const productId = getUrlPathCode(context.normalized.url, /\/([A-Z0-9]+)\.html$/i);
  if (context.html && isBlockedPage(context.html, context.fetchStatus)) {
    return finalizeResult(
      createBlockedResult(context, undefined, {
        sku: productId,
        productId,
        brand: "adidas",
      }),
    );
  }

  let result = await extractGenericProduct(context);
  result.extraction.storeSpecific = true;
  result.extraction.method = "store-specific";

  result = mergeProductResults(result, {
    productId,
    sku: productId,
    selectedColor: selectedParam(context.normalized.url, ["color", "dwvar"]),
    extraction: { method: "store-specific", storeSpecific: true },
  });

  if (context.html) {
    const $ = loadHtml(context.html);
    const baseUrl = context.finalUrl ?? context.normalized.normalizedUrl;
    const priceText =
      cleanText($("[data-testid*='price' i], [class*='price' i]").first().text()) ??
      cleanText(context.html.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/i)?.[1]);

    result = mergeProductResults(result, {
      price: result.price ?? parsePrice(priceText),
      currency: result.currency ?? (priceText && /\$|USD/i.test(priceText) ? "USD" : undefined),
      variants: {
        colors: adidasOptions($, baseUrl, "color"),
        sizes: adidasOptions($, baseUrl, "size"),
      },
      extraction: { method: "store-specific", storeSpecific: true },
    });
    result = replaceVariants(result, {
      colors: adidasOptions($, baseUrl, "color"),
      sizes: adidasOptions($, baseUrl, "size"),
    });
  }

  if (!result.price) result.extraction.warnings.push("Adidas price not found in static HTML");
  if (result.images.length === 0) result.extraction.warnings.push("Adidas images not found in static HTML");
  if (result.variants.colors.length === 0) {
    result.extraction.warnings.push("Adidas color variants not found in static HTML");
  }
  if (result.variants.sizes.length === 0) {
    result.extraction.warnings.push("Adidas size variants not found in static HTML");
  }

  return finalizeResult(result);
}

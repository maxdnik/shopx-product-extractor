import type { ExtractorContext, ProductVariantOption } from "../types";
import { extractGenericProduct } from "./generic";
import {
  cleanText,
  dedupeVariantOptions,
  finalizeResult,
  isLikelyColorLabel,
  loadHtml,
  mergeProductResults,
  normalizeImageUrl,
  parsePrice,
  replaceVariants,
  selectedParam,
} from "../utils";

function normalizeGapColorLabel(label: string): string | undefined {
  const cleaned = cleanText(label.replace(/^color/i, "").replace(/^selected\s+color/i, ""));
  if (!cleaned || !isLikelyColorLabel(cleaned)) return undefined;
  if (/extra \d+% off|product details|size guide/i.test(cleaned)) return undefined;
  return cleaned;
}

function isGapSizeLabel(label: string): boolean {
  const cleaned = cleanText(label);
  if (!cleaned) return false;
  return /^(?:regular|tall|petite|xxs|xs|s|m|l|xl|xxl|xxxl|[2-9][0-9](?:\s?x\s?[2-9][0-9])?)$/i.test(
    cleaned,
  );
}

function splitGapAlphaSizes(text: string): ProductVariantOption[] {
  const compact = text.replace(/\s+/g, "");
  const match = compact.match(/Size(?:SizeGuide)?((?:XXXL|XXL|XXS|XL|XS|S|M|L){2,})/i);
  const sequence = match?.[1];
  if (!sequence) return [];

  const options: ProductVariantOption[] = [];
  let remaining = sequence.toUpperCase();
  const tokens = ["XXXL", "XXL", "XXS", "XL", "XS", "S", "M", "L"];
  while (remaining.length > 0) {
    const token = tokens.find((candidate) => remaining.startsWith(candidate));
    if (!token) break;
    options.push({ label: token });
    remaining = remaining.slice(token.length);
  }
  return options;
}

function collectGapOptions(
  $: ReturnType<typeof loadHtml>,
  baseUrl: string,
  kind: "color" | "size",
): ProductVariantOption[] {
  const options: ProductVariantOption[] = [];
  const selector =
    kind === "color"
      ? "[data-testid*='color' i], [aria-label*='color' i], button[class*='swatch' i], a[href*='color']"
      : "[data-testid*='size' i], [aria-label*='size' i], button[class*='size' i], option";

  $(selector).each((_, element) => {
    const $element = $(element);
    const label =
      cleanText($element.attr("aria-label")) ??
      cleanText($element.attr("title")) ??
      cleanText($element.find("img").attr("alt")) ??
      cleanText($element.attr("value")) ??
      cleanText($element.text());
    if (!label || label.length > 80) return;
    const normalizedLabel =
      kind === "color" ? normalizeGapColorLabel(label) : cleanText(label);
    if (!normalizedLabel) return;
    if (kind === "size" && !isGapSizeLabel(normalizedLabel)) {
      return;
    }
    options.push({
      label: normalizedLabel.replace(/^(color|size)[:\s-]*/i, ""),
      value: cleanText($element.attr("value") ?? $element.attr("data-value")),
      available: !/disabled|unavailable|sold/i.test(
        `${$element.attr("class") ?? ""} ${$element.attr("aria-disabled") ?? ""}`,
      ),
      image: normalizeImageUrl($element.find("img").attr("src"), baseUrl),
      url: normalizeImageUrl($element.attr("href"), baseUrl),
    });
  });

  if (kind === "size") {
    const bodyText = $("body").text();
    options.push(...splitGapAlphaSizes(bodyText));
  }

  return dedupeVariantOptions(options);
}

export async function extractGapProduct(context: ExtractorContext) {
  let result = await extractGenericProduct(context);
  result.extraction.storeSpecific = true;
  result.extraction.method = "store-specific";

  const pid = cleanText(context.normalized.url.searchParams.get("pid"));
  result = mergeProductResults(result, {
    productId: pid,
    sku: pid,
    selectedColor: selectedParam(context.normalized.url, ["color", "cid"]),
    extraction: { method: "store-specific", storeSpecific: true },
  });

  if (context.html) {
    const $ = loadHtml(context.html);
    const baseUrl = context.finalUrl ?? context.normalized.normalizedUrl;
    const priceText =
      cleanText($("[data-testid*='price' i], [class*='price' i]").first().text()) ??
      cleanText(context.html.match(/"salePrice"\s*:\s*"?([^",}]+)"?/i)?.[1]);

    result = mergeProductResults(result, {
      price: result.price ?? parsePrice(priceText),
      currency: result.currency ?? (priceText && /\$|USD/i.test(priceText) ? "USD" : undefined),
      variants: {
        colors: collectGapOptions($, baseUrl, "color"),
        sizes: collectGapOptions($, baseUrl, "size"),
      },
      extraction: { method: "store-specific", storeSpecific: true },
    });
    result = replaceVariants(result, {
      colors: collectGapOptions($, baseUrl, "color"),
      sizes: collectGapOptions($, baseUrl, "size"),
    });
  }

  if (!result.price) result.extraction.warnings.push("Gap price not found in static HTML");
  if (result.images.length === 0) result.extraction.warnings.push("Gap images not found in static HTML");
  if (result.variants.colors.length === 0) {
    result.extraction.warnings.push("Gap color variants not found in static HTML");
  }
  if (result.variants.sizes.length === 0) {
    result.extraction.warnings.push("Gap size variants not found in static HTML");
  }

  return finalizeResult(result);
}

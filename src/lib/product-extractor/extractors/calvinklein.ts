import type { ExtractorContext, ProductEvidenceDebug, ProductVariantOption } from "../types";
import { extractGenericProduct } from "./generic";
import {
  attachEvidence,
  cleanText,
  createBlockedResult,
  dedupeVariantOptions,
  emptyEvidence,
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

function calvinKleinProductId(url: URL): string | undefined {
  return getUrlPathCode(url, /\/([A-Z0-9-]+)\.html$/i);
}

function calvinKleinTitleFromUrl(url: URL): string | undefined {
  const slug = cleanText(url.pathname.match(/\/([^/]+)\/[A-Z0-9-]+\.html$/i)?.[1]);
  if (!slug) return undefined;
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isCalvinKleinVariantLabel(label: string, kind: "color" | "size"): boolean {
  const cleaned = cleanText(label);
  if (
    !cleaned ||
    /^(?:sale|clearance|new arrivals?|facebook|google|apple|paypal|klarna|afterpay|icon|shop|bag|laptop)$/i.test(
      cleaned,
    )
  ) {
    return false;
  }
  if (/(facebook|google|apple|paypal|klarna|afterpay|icon|laptop|sign in|account)/i.test(cleaned)) {
    return false;
  }
  return kind === "color" ? isLikelyColorLabel(cleaned) : isLikelySizeLabel(cleaned);
}

function sanitizeCalvinKleinOptions(
  options: ProductVariantOption[],
  kind: "color" | "size",
  evidence?: ProductEvidenceDebug,
): ProductVariantOption[] {
  return dedupeVariantOptions(options.filter((option) => {
    const accepted = isCalvinKleinVariantLabel(option.label, kind);
    if (!accepted && evidence) {
      evidence.rejectedCandidates.push({
        field: kind === "color" ? "variants.colors" : "variants.sizes",
        kind,
        sourceType: option.url ? "selector" : "product-json",
        label: option.label,
        rawValue: option.label,
        accepted: false,
        reason: "Calvin Klein non-product variant candidate",
      });
    }
    return accepted;
  }));
}

function calvinKleinTextSizeOptions(text: string): ProductVariantOption[] {
  const options: ProductVariantOption[] = [];
  const sections = [
    text.match(/(?:Select\s+)?Size\s*([\s\S]{0,500}?)(?:Size Guide|Color|Add to Bag|Add To Cart|Product Details)/i)?.[1],
    text.match(/Sizes?\s*:\s*([\s\S]{0,160}?)(?:\.|Color|$)/i)?.[1],
  ].filter((value): value is string => Boolean(value));

  for (const section of sections) {
    for (const match of section.matchAll(/\b(?:XS|S|M|L|XL|XXL|XXXL|OS|One Size)\b/gi)) {
      const label = cleanText(match[0].toUpperCase());
      if (label && isCalvinKleinVariantLabel(label, "size")) options.push({ label });
    }
  }

  for (const match of text.matchAll(/(?:XS|S|M|L|XL|XXL|XXXL)(?=Out of Stock|In Stock|Unavailable|Few Left|Low Stock)/gi)) {
    const label = cleanText(match[0].toUpperCase());
    if (label && isCalvinKleinVariantLabel(label, "size")) options.push({ label });
  }

  return sanitizeCalvinKleinOptions(options, "size");
}

function embeddedCalvinKleinOptions(
  html: string,
  kind: "color" | "size",
): ProductVariantOption[] {
  const options: ProductVariantOption[] = [];
  const patterns =
    kind === "color"
      ? [
          /"color(?:Name|Description)?"\s*:\s*"([^"]{2,60})"/gi,
          /"displayColor"\s*:\s*"([^"]{2,60})"/gi,
          /"swatch(?:Name|Color)?"\s*:\s*"([^"]{2,60})"/gi,
          /"label"\s*:\s*"([^"]{2,60})"[\s\S]{0,180}?"(?:color|Color)"/gi,
        ]
      : [
          /"size(?:Name|Description)?"\s*:\s*"([^"]{1,24})"/gi,
          /"displaySize"\s*:\s*"([^"]{1,24})"/gi,
          /"label"\s*:\s*"([^"]{1,24})"[\s\S]{0,180}?"(?:size|Size)"/gi,
        ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const label = cleanText(match[1]);
      if (!label) continue;
      if (!isCalvinKleinVariantLabel(label, kind)) continue;
      options.push({ label });
    }
  }
  return dedupeVariantOptions(options);
}

export async function extractCalvinKleinProduct(context: ExtractorContext) {
  const evidence = emptyEvidence();
  const productId = calvinKleinProductId(context.normalized.url);
  const selectedColor = selectedParam(context.normalized.url, ["color", "dwvar"]);
  const urlTitle = calvinKleinTitleFromUrl(context.normalized.url);

  if (context.html && isBlockedPage(context.html, context.fetchStatus)) {
    return finalizeResult(
      createBlockedResult(context, undefined, {
        sku: productId,
        productId,
        brand: "Calvin Klein",
      }),
    );
  }

  let result = await extractGenericProduct(context);
  result.extraction.storeSpecific = true;
  result.extraction.method = "store-specific";

  result = mergeProductResults(result, {
    brand: "Calvin Klein",
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

    if (selectedColor && isCalvinKleinVariantLabel(selectedColor, "color")) {
      colors.push({ label: selectedColor });
    }

    $(
      [
        "[data-attr='color']",
        "[data-attribute='color']",
        "[data-color]",
        "[aria-label*='color' i]",
        "button[class*='color' i]",
        "button[class*='swatch' i]",
        "a[href*='color']",
      ].join(","),
    ).each((_, element) => {
      const $element = $(element);
      const label =
        cleanText($element.attr("data-color")) ??
        cleanText($element.attr("aria-label")) ??
        cleanText($element.attr("title")) ??
        cleanText($element.attr("alt")) ??
        cleanText($element.find("img").attr("alt")) ??
        cleanText($element.text());
      if (!label || !isCalvinKleinVariantLabel(label, "color")) {
        if (label) {
          evidence.rejectedCandidates.push({
            field: "variants.colors",
            kind: "color",
            sourceType: "selector",
            rawValue: label,
            label,
            accepted: false,
            reason: "not a Calvin Klein product color swatch",
          });
        }
        return;
      }
      evidence.colorCandidates.push({
        field: "variants.colors",
        kind: "color",
        sourceType: "selector",
        rawValue: label,
        normalizedValue: label.replace(/^color[:\s-]*/i, ""),
        label,
        accepted: true,
      });
      colors.push({
        label: label.replace(/^color[:\s-]*/i, ""),
        available: !/disabled|unavailable|sold/i.test($element.attr("class") ?? ""),
        image: normalizeImageUrl($element.attr("src") ?? $element.find("img").attr("src"), baseUrl),
        url: normalizeImageUrl($element.attr("href"), baseUrl),
      });
    });

    $("[data-attr='size'], [data-attribute='size'], [aria-label*='size' i], button, option").each(
      (_, element) => {
        const $element = $(element);
        const label =
          cleanText($element.attr("aria-label")?.replace(/^(size|select size)[:\s-]*/i, "")) ??
          cleanText($element.attr("value")) ??
          cleanText($element.text());
        if (!label || !isCalvinKleinVariantLabel(label, "size")) return;
        evidence.sizeCandidates.push({
          field: "variants.sizes",
          kind: "size",
          sourceType: "selector",
          rawValue: label,
          normalizedValue: label,
          label,
          accepted: true,
        });
        sizes.push({
          label,
          available: !/disabled|unavailable|sold/i.test(
            `${$element.attr("class") ?? ""} ${$element.attr("aria-disabled") ?? ""}`,
          ),
        });
      },
    );

    colors.push(...embeddedCalvinKleinOptions(context.html, "color"));
    sizes.push(...embeddedCalvinKleinOptions(context.html, "size"));
    sizes.push(...calvinKleinTextSizeOptions($("body").text()));

    result = mergeProductResults(result, {
      brand: "Calvin Klein",
      price:
        result.price ??
        parsePrice($("[class*='price' i], [data-testid*='price' i]").first().text()),
      selectedColor: result.selectedColor ?? selectedColor,
      extraction: { method: "store-specific", storeSpecific: true },
    });
    result.brand = "Calvin Klein";
    if (
      urlTitle &&
      (!result.title ||
        (/boxer/i.test(urlTitle) && !/boxer/i.test(result.title)) ||
        (/jacket/i.test(urlTitle) && !/jacket/i.test(result.title)))
    ) {
      result.title = urlTitle;
    }
    result = replaceVariants(result, {
      colors: sanitizeCalvinKleinOptions(colors, "color", evidence),
      sizes: sanitizeCalvinKleinOptions(sizes, "size", evidence),
    });
    if (result.variants.sizes.length === 0) {
      result.partial = true;
      result.extraction.warnings.push(
        "Calvin Klein size variants unavailable from product-specific evidence",
      );
    }
  }

  return finalizeResult(
    context.options.includeDebug ? attachEvidence(result, evidence) : result,
  );
}

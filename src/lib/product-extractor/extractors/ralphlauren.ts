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

function ralphProductId(url: URL): string | undefined {
  return (
    cleanText(url.searchParams.get("masterId")) ??
    getUrlPathCode(url, /\/([0-9A-Z-]+)\.html$/i)
  );
}

function isRalphVariantLabel(label: string, kind: "color" | "size"): boolean {
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

function sanitizeRalphOptions(
  options: ProductVariantOption[],
  kind: "color" | "size",
  evidence?: ProductEvidenceDebug,
): ProductVariantOption[] {
  return dedupeVariantOptions(options.filter((option) => {
    const accepted = isRalphVariantLabel(option.label, kind);
    if (!accepted && evidence) {
      evidence.rejectedCandidates.push({
        field: kind === "color" ? "variants.colors" : "variants.sizes",
        kind,
        sourceType: option.url ? "selector" : "product-json",
        label: option.label,
        rawValue: option.label,
        accepted: false,
        reason: "Ralph Lauren non-product variant candidate",
      });
    }
    return accepted;
  }));
}

function embeddedRalphOptions(html: string, kind: "color" | "size"): ProductVariantOption[] {
  const options: ProductVariantOption[] = [];
  const patterns =
    kind === "color"
      ? [
          /"color(?:Name|Description)?"\s*:\s*"([^"]{2,60})"/gi,
          /"swatchName"\s*:\s*"([^"]{2,60})"/gi,
          /"label"\s*:\s*"([^"]{2,60})"[\s\S]{0,160}?"(?:color|Color)"/gi,
        ]
      : [
          /"size(?:Name|Description)?"\s*:\s*"([^"]{1,24})"/gi,
          /"displaySize"\s*:\s*"([^"]{1,24})"/gi,
          /"label"\s*:\s*"([^"]{1,24})"[\s\S]{0,160}?"(?:size|Size)"/gi,
        ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const label = cleanText(match[1]);
      if (!label) continue;
      if (!isRalphVariantLabel(label, kind)) continue;
      options.push({ label });
    }
  }
  return dedupeVariantOptions(options);
}

export async function extractRalphLaurenProduct(context: ExtractorContext) {
  const evidence = emptyEvidence();
  const productId = ralphProductId(context.normalized.url);
  const selectedColor = selectedParam(context.normalized.url, [
    "userSelectedColor",
    "colorname",
    "color",
    "dwvar",
  ]);

  if (context.html && isBlockedPage(context.html, context.fetchStatus)) {
    return finalizeResult(
      createBlockedResult(context, undefined, {
        sku: productId,
        productId,
        brand: "Ralph Lauren",
      }),
    );
  }

  let result = await extractGenericProduct(context);
  result.extraction.storeSpecific = true;
  result.extraction.method = "store-specific";

  result = mergeProductResults(result, {
    brand: "Ralph Lauren",
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

    if (selectedColor && isRalphVariantLabel(selectedColor, "color")) {
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
      if (!label || !isRalphVariantLabel(label, "color")) {
        if (label) {
          evidence.rejectedCandidates.push({
            field: "variants.colors",
            kind: "color",
            sourceType: "selector",
            rawValue: label,
            label,
            accepted: false,
            reason: "not a Ralph Lauren product color swatch",
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
        if (!label || !isRalphVariantLabel(label, "size")) return;
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

    colors.push(...embeddedRalphOptions(context.html, "color"));
    sizes.push(...embeddedRalphOptions(context.html, "size"));

    result = mergeProductResults(result, {
      brand: "Ralph Lauren",
      price:
        result.price ??
        parsePrice($("[class*='price' i], [data-testid*='price' i]").first().text()),
      selectedColor: result.selectedColor ?? selectedColor,
      extraction: { method: "store-specific", storeSpecific: true },
    });
    result.brand = "Ralph Lauren";
    result = replaceVariants(result, {
      colors: sanitizeRalphOptions(colors, "color", evidence),
      sizes: sanitizeRalphOptions(sizes, "size", evidence),
    });
  }

  return finalizeResult(
    context.options.includeDebug ? attachEvidence(result, evidence) : result,
  );
}

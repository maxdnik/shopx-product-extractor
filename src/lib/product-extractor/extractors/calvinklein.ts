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
  if (kind === "color" && isLikelySizeLabel(cleaned)) return false;
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

async function calvinKleinSizesWithPlaywright(url: string): Promise<{
  sizes: ProductVariantOption[];
  evidence: ProductEvidenceDebug["sizeCandidates"];
  rejected: ProductEvidenceDebug["rejectedCandidates"];
}> {
  const evidence: ProductEvidenceDebug["sizeCandidates"] = [];
  const rejected: ProductEvidenceDebug["rejectedCandidates"] = [];
  if (process.env.PRODUCT_EXTRACTOR_DISABLE_AUTO_PLAYWRIGHT === "true") {
    return { sizes: [], evidence, rejected };
  }

  let browser: Awaited<ReturnType<typeof import("playwright").chromium.launch>> | undefined;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true, timeout: 12_000 });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page
      .waitForSelector(
        "[data-testid*='size' i], [data-test*='size' i], [aria-label*='size' i], button, option",
        { timeout: 8_000 },
      )
      .catch(() => undefined);
    const labels = await page.evaluate(() => {
      const clean = (value: string | null | undefined) =>
        value?.replace(/\s+/g, " ").trim();
      const result: string[] = [];
      for (const element of Array.from(
        document.querySelectorAll(
          "[data-testid*='size' i], [data-test*='size' i], [aria-label*='size' i], button, option, [role='option']",
        ),
      )) {
        const context = [
          element.getAttribute("aria-label"),
          element.getAttribute("data-testid"),
          element.getAttribute("data-test"),
          element.closest("fieldset")?.textContent,
          element.parentElement?.textContent,
        ]
          .map(clean)
          .filter(Boolean)
          .join(" ");
        if (!/size|select/i.test(context)) continue;
        const label =
          clean(element.getAttribute("aria-label")) ??
          clean(element.getAttribute("value")) ??
          clean(element.textContent);
        if (label) result.push(label.replace(/^(size|select size)[:\s-]*/i, ""));
      }
      return result;
    });

    const sizes: ProductVariantOption[] = [];
    for (const label of labels) {
      const accepted = isCalvinKleinVariantLabel(label, "size");
      const record = {
        field: "variants.sizes",
        kind: "size" as const,
        sourceType: "playwright" as const,
        selector: "[data-testid*='size' i], [aria-label*='size' i], button, option",
        label,
        rawValue: label,
        normalizedValue: label,
        accepted,
        reason: accepted ? undefined : "not a valid Calvin Klein size label",
      };
      if (accepted) {
        evidence.push(record);
        sizes.push({ label });
      } else {
        rejected.push(record);
      }
    }
    return { sizes: sanitizeCalvinKleinOptions(sizes, "size"), evidence, rejected };
  } catch (error) {
    rejected.push({
      field: "variants.sizes",
      kind: "size",
      sourceType: "playwright",
      accepted: false,
      reason: error instanceof Error ? error.message : "Calvin Klein Playwright size extraction failed",
    });
    return { sizes: [], evidence, rejected };
  } finally {
    await browser?.close().catch(() => undefined);
  }
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
    if (sizes.length === 0) {
      const browserSizes = await calvinKleinSizesWithPlaywright(context.normalized.normalizedUrl);
      sizes.push(...browserSizes.sizes);
      evidence.sizeCandidates.push(...browserSizes.evidence);
      evidence.rejectedCandidates.push(...browserSizes.rejected);
    }

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

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

function tnfEmbeddedOptions(html: string, kind: "color" | "size"): ProductVariantOption[] {
  const options: ProductVariantOption[] = [];
  const patterns =
    kind === "color"
      ? [
          /"color(?:Name|Description)?"\s*:\s*"([^"]{2,60})"/gi,
          /"displayValue"\s*:\s*"([^"]{2,60})"[\s\S]{0,300}?"id"\s*:\s*"color"/gi,
          /"attributeId"\s*:\s*"color"[\s\S]{0,300}?"displayValue"\s*:\s*"([^"]{2,60})"/gi,
        ]
      : [
          /"size(?:Name)?"\s*:\s*"([^"]{1,20})"/gi,
          /"displayValue"\s*:\s*"([^"]{1,20})"[\s\S]{0,300}?"id"\s*:\s*"size"/gi,
          /"attributeId"\s*:\s*"size"[\s\S]{0,300}?"displayValue"\s*:\s*"([^"]{1,20})"/gi,
        ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const label = cleanText(match[1]);
      if (!label) continue;
      if (kind === "color" && !isTnfColorLabel(label)) continue;
      if (kind === "size" && !isLikelySizeLabel(label)) continue;
      options.push({ label });
    }
  }
  return dedupeVariantOptions(options);
}

function isTnfColorLabel(label: string): boolean {
  const cleaned = cleanText(label);
  if (!cleaned || !isLikelyColorLabel(cleaned)) return false;
  if (
    /review|recommend|related|bra\b|sports bra|description|features|sku|style|product|jacket|hoodie|shirt|pant|men'?s|women'?s/i.test(
      cleaned,
    )
  ) {
    return false;
  }
  if (/^NF0[A-Z0-9]+/i.test(cleaned) || /^[A-Z0-9]{6,}(?:-[A-Z0-9]+)?$/.test(cleaned)) {
    return false;
  }
  return true;
}

function sanitizeTnfColors(
  options: ProductVariantOption[],
  evidence: ProductEvidenceDebug,
): ProductVariantOption[] {
  return dedupeVariantOptions(options.filter((option) => {
    const accepted = isTnfColorLabel(option.label);
    if (!accepted) {
      evidence.rejectedCandidates.push({
        field: "variants.colors",
        kind: "color",
        sourceType: option.url ? "selector" : "product-json",
        label: option.label,
        rawValue: option.label,
        accepted: false,
        reason: "not a TNF product color swatch or variation value",
      });
    }
    return accepted;
  }));
}

function tnfTextSizeOptions(text: string): ProductVariantOption[] {
  const options: ProductVariantOption[] = [];
  const sections = [
    text.match(/Size:\s*([\s\S]{0,500}?)(?:Fit:|Size\s*&\s*Fit|Description|Add to Cart)/i)?.[1],
    text.match(/\*\s*Sizes\s*([\s\S]{0,120}?)(?:\*|Center Back|$)/i)?.[1],
    text.match(/Sizes\s+((?:XXS|XS|S|M|L|XL|XXL|3XL|XXXL|,|\s){6,80})/i)?.[1],
  ].filter((value): value is string => Boolean(value));

  for (const section of sections) {
    for (const match of section.matchAll(/(?:XXS|XS|S|M|L|XL|XXL|3XL|XXXL)(?=\b|Out of Stock|In Stock|Unavailable|Few Left|Low Stock)/gi)) {
      const label = cleanText(match[0].toUpperCase().replace("3XL", "XXXL"));
      if (label && isLikelySizeLabel(label)) options.push({ label });
    }
  }

  for (const match of text.matchAll(/(?:XXS|XS|S|M|L|XL|XXL|3XL|XXXL)(?=Out of Stock|In Stock|Unavailable|Few Left|Low Stock)/gi)) {
    const label = cleanText(match[0].toUpperCase().replace("3XL", "XXXL"));
    if (label && isLikelySizeLabel(label)) options.push({ label });
  }

  return dedupeVariantOptions(options);
}

async function tnfSizesWithPlaywright(url: string): Promise<{
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
        "[data-testid*='size' i], [data-test*='size' i], [aria-label*='size' i], button",
        { timeout: 8_000 },
      )
      .catch(() => undefined);
    const labels = await page.evaluate(() => {
      const clean = (value: string | null | undefined) =>
        value?.replace(/\s+/g, " ").trim();
      const result: string[] = [];
      for (const element of Array.from(
        document.querySelectorAll(
          "[data-testid*='size' i], [data-test*='size' i], [aria-label*='size' i], button, [role='option']",
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
        if (!/size|select|fit/i.test(context)) continue;
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
      const accepted = isLikelySizeLabel(label);
      const record = {
        field: "variants.sizes",
        kind: "size" as const,
        sourceType: "playwright" as const,
        selector: "[data-testid*='size' i], [aria-label*='size' i], button",
        label,
        rawValue: label,
        normalizedValue: label,
        accepted,
        reason: accepted ? undefined : "not a valid apparel size label",
      };
      if (accepted) {
        evidence.push(record);
        sizes.push({ label });
      } else {
        rejected.push(record);
      }
    }
    return { sizes: dedupeVariantOptions(sizes), evidence, rejected };
  } catch (error) {
    rejected.push({
      field: "variants.sizes",
      kind: "size",
      sourceType: "playwright",
      accepted: false,
      reason: error instanceof Error ? error.message : "TNF Playwright size extraction failed",
    });
    return { sizes: [], evidence, rejected };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function extractTheNorthFaceProduct(context: ExtractorContext) {
  const evidence = emptyEvidence();
  const productId = getUrlPathCode(context.normalized.url, /-([A-Z0-9]{6,})$/i);
  const selectedColor = selectedParam(context.normalized.url, ["color", "dwvar"]);

  if (context.html && isBlockedPage(context.html, context.fetchStatus)) {
    return finalizeResult(
      createBlockedResult(context, undefined, {
        sku: productId,
        productId,
        brand: "The North Face",
      }),
    );
  }

  let result = await extractGenericProduct(context);
  result.extraction.storeSpecific = true;
  result.extraction.method = "store-specific";

  result = mergeProductResults(result, {
    brand: "The North Face",
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
        if (!label || !isTnfColorLabel(label)) {
          if (label) {
            evidence.rejectedCandidates.push({
              field: "variants.colors",
              kind: "color",
              sourceType: "selector",
              selector: "[data-attr='color'], [aria-label*='color' i], a[href*='color=']",
              label,
              rawValue: label,
              accepted: false,
              reason: "not a TNF product color swatch",
            });
          }
          return;
        }
        evidence.colorCandidates.push({
          field: "variants.colors",
          kind: "color",
          sourceType: "selector",
          selector: "[data-attr='color'], [aria-label*='color' i], a[href*='color=']",
          label,
          rawValue: label,
          normalizedValue: label.replace(/^color[:\s-]*/i, ""),
          accepted: true,
        });
        colors.push({
          label: label.replace(/^color[:\s-]*/i, ""),
          available: !/disabled|unavailable|not-available/i.test($element.attr("class") ?? ""),
          image: normalizeImageUrl($element.find("img").attr("src"), baseUrl),
          url: normalizeImageUrl($element.attr("href"), baseUrl),
        });
      },
    );

    colors.push(...tnfEmbeddedOptions(context.html, "color"));

    $("[data-attr='size'], [data-attribute='size'], [aria-label*='size' i], button").each(
      (_, element) => {
        const $element = $(element);
        const contextText = `${$element.attr("aria-label") ?? ""} ${$element.parent().text()}`;
        if (!/size|talle|tamaño/i.test(contextText)) return;
        const label =
          cleanText($element.attr("aria-label")?.replace(/^(size|talle|tamaño)[:\s-]*/i, "")) ??
          cleanText($element.attr("value")) ??
          cleanText($element.text());
        if (!label || !isLikelySizeLabel(label)) {
          if (label) {
            evidence.rejectedCandidates.push({
              field: "variants.sizes",
              kind: "size",
              sourceType: "selector",
              selector: "[data-attr='size'], [aria-label*='size' i], button",
              label,
              rawValue: label,
              accepted: false,
              reason: "not a valid apparel size label",
            });
          }
          return;
        }
        evidence.sizeCandidates.push({
          field: "variants.sizes",
          kind: "size",
          sourceType: "selector",
          selector: "[data-attr='size'], [aria-label*='size' i], button",
          label,
          rawValue: label,
          normalizedValue: label,
          accepted: true,
        });
        sizes.push({
          label,
          available: !/disabled|unavailable|not-available/i.test($element.attr("class") ?? ""),
        });
      },
    );

    sizes.push(...tnfEmbeddedOptions(context.html, "size"));
    sizes.push(...tnfTextSizeOptions($("body").text()));
    if (sizes.length === 0) {
      const browserSizes = await tnfSizesWithPlaywright(context.normalized.normalizedUrl);
      sizes.push(...browserSizes.sizes);
      evidence.sizeCandidates.push(...browserSizes.evidence);
      evidence.rejectedCandidates.push(...browserSizes.rejected);
    }

    result = mergeProductResults(result, {
      price: result.price ?? parsePrice($("[class*='price' i], [data-test*='price' i]").first().text()),
      selectedColor: result.selectedColor ?? selectedColor,
      variants: {
        colors: dedupeVariantOptions(colors),
        sizes: dedupeVariantOptions(sizes),
      },
      extraction: { method: "store-specific", storeSpecific: true },
    });
    result.brand = "The North Face";
    result = replaceVariants(result, {
      colors: sanitizeTnfColors(colors, evidence),
      sizes: dedupeVariantOptions(sizes),
    });
  }

  if (result.variants.colors.length === 0) {
    result.extraction.warnings.push("The North Face color variants not found in static HTML");
  }
  if (result.variants.sizes.length === 0) {
    result.extraction.warnings.push("The North Face size variants not found in static HTML");
  }

  return finalizeResult(
    context.options.includeDebug ? attachEvidence(result, evidence) : result,
  );
}

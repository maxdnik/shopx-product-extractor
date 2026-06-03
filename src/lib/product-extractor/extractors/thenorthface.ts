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
      if (kind === "color" && !isLikelyColorLabel(label)) continue;
      if (kind === "size" && !isLikelySizeLabel(label)) continue;
      options.push({ label });
    }
  }
  return dedupeVariantOptions(options);
}

function tnfTextSizeOptions(text: string): ProductVariantOption[] {
  const options: ProductVariantOption[] = [];
  const sections = [
    text.match(/Size:\s*([\s\S]{0,500}?)(?:Fit:|Size\s*&\s*Fit|Description|Add to Cart)/i)?.[1],
    text.match(/\*\s*Sizes\s*([\s\S]{0,120}?)(?:\*|Center Back|$)/i)?.[1],
  ].filter((value): value is string => Boolean(value));

  for (const section of sections) {
    for (const match of section.matchAll(/\b(?:XXS|XS|S|M|L|XL|XXL|3XL|XXXL)\b/gi)) {
      const label = cleanText(match[0].toUpperCase().replace("3XL", "XXXL"));
      if (label && isLikelySizeLabel(label)) options.push({ label });
    }
  }

  return dedupeVariantOptions(options);
}

export async function extractTheNorthFaceProduct(context: ExtractorContext) {
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
        if (!label || !isLikelyColorLabel(label)) return;
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
        if (!label || !isLikelySizeLabel(label)) return;
        sizes.push({
          label,
          available: !/disabled|unavailable|not-available/i.test($element.attr("class") ?? ""),
        });
      },
    );

    sizes.push(...tnfEmbeddedOptions(context.html, "size"));
    sizes.push(...tnfTextSizeOptions($("body").text()));

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
      colors: dedupeVariantOptions(colors),
      sizes: dedupeVariantOptions(sizes),
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

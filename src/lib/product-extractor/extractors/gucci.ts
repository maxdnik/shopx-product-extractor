import type { ExtractorContext, ProductVariantOption } from "../types";
import { extractGenericProduct } from "./generic";
import {
  cleanText,
  dedupeVariantOptions,
  finalizeResult,
  getUrlPathCode,
  loadHtml,
  mergeProductResults,
  parsePrice,
} from "../utils";

function gucciSizes($: ReturnType<typeof loadHtml>): ProductVariantOption[] {
  const sizes: ProductVariantOption[] = [];
  $("[data-testid*='size' i], [aria-label*='size' i], button, option").each(
    (_, element) => {
      const $element = $(element);
      const context = `${$element.attr("aria-label") ?? ""} ${$element.parent().text()}`;
      if (!/size|talla|talle|select your size/i.test(context)) return;
      const label =
        cleanText($element.attr("aria-label")?.replace(/^(size|talla|talle)[:\s-]*/i, "")) ??
        cleanText($element.attr("value")) ??
        cleanText($element.text());
      if (!label || label.length > 40) return;
      sizes.push({
        label,
        available: !/disabled|unavailable|sold/i.test(
          `${$element.attr("class") ?? ""} ${$element.attr("aria-disabled") ?? ""}`,
        ),
      });
    },
  );
  return dedupeVariantOptions(sizes);
}

export async function extractGucciProduct(context: ExtractorContext) {
  let result = await extractGenericProduct(context);
  result.extraction.storeSpecific = true;
  result.extraction.method = "store-specific";

  const productId = getUrlPathCode(context.normalized.url, /-p-([A-Za-z0-9]+)$/i);
  result = mergeProductResults(result, {
    productId,
    sku: productId,
    extraction: { method: "store-specific", storeSpecific: true },
  });

  if (context.html) {
    const $ = loadHtml(context.html);
    const priceText = cleanText(
      $("[data-testid*='price' i], [class*='price' i], [aria-label*='price' i]")
        .first()
        .text(),
    );
    const description =
      result.description ??
      cleanText(
        $("[data-testid*='description' i], [class*='description' i], [class*='product-detail' i]")
          .first()
          .text(),
      );

    result = mergeProductResults(result, {
      price: result.price ?? parsePrice(priceText),
      currency: result.currency ?? (priceText && /\$|USD/i.test(priceText) ? "USD" : undefined),
      description,
      variants: {
        sizes: gucciSizes($),
      },
      extraction: { method: "store-specific", storeSpecific: true },
    });
  }

  if (!result.price) result.extraction.warnings.push("Gucci price not found in static HTML");
  if (result.images.length === 0) result.extraction.warnings.push("Gucci images not found in static HTML");
  if (result.variants.sizes.length === 0) {
    result.extraction.warnings.push("Gucci size variants not found in static HTML");
  }
  if (!result.description) result.extraction.warnings.push("Gucci description not found in static HTML");

  return finalizeResult(result);
}

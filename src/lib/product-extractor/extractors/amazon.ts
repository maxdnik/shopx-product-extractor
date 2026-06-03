import type { ExtractorContext, ProductVariantOption } from "../types";
import { extractGenericProduct } from "./generic";
import {
  cleanText,
  dedupeImages,
  dedupeVariantOptions,
  finalizeResult,
  getUrlPathCode,
  loadHtml,
  mergeProductResults,
  normalizeImageUrl,
  parsePrice,
} from "../utils";

function extractAsin(url: URL): string | undefined {
  return (
    getUrlPathCode(url, /\/(?:dp|gp\/aw\/d|gp\/product)\/([A-Z0-9]{10})/i) ??
    cleanText(url.searchParams.get("asin"))
  );
}

function amazonImagesFromScripts(html: string, baseUrl: string): string[] {
  const candidates: string[] = [];
  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'\\]+?\.(?:jpg|jpeg|png|webp)(?:[^"'\\]*)?/gi)) {
    candidates.push(match[0].replaceAll("\\/", "/").replaceAll("\\u002F", "/"));
  }
  return dedupeImages(candidates, baseUrl);
}

function amazonVariantOptions($: ReturnType<typeof loadHtml>, groupId: string): ProductVariantOption[] {
  const options: ProductVariantOption[] = [];
  $(`#${groupId} li, #${groupId} option, [data-csa-c-item-type*='variation']`).each(
    (_, element) => {
      const $element = $(element);
      const label =
        cleanText($element.attr("title")?.replace(/^Click to select /i, "")) ??
        cleanText($element.find(".selection, .a-size-base, img").attr("alt")) ??
        cleanText($element.text());
      if (!label || /select|currently unavailable/i.test(label)) return;
      options.push({
        label,
        value: cleanText($element.attr("data-defaultasin") ?? $element.attr("value")),
        available: !/unavailable|disabled/i.test($element.attr("class") ?? ""),
        image: normalizeImageUrl($element.find("img").attr("src"), $.root().attr("base") ?? ""),
      });
    },
  );
  return dedupeVariantOptions(options);
}

export async function extractAmazonProduct(context: ExtractorContext) {
  let result = await extractGenericProduct(context);
  result.extraction.storeSpecific = true;
  result.extraction.method = "store-specific";

  const asin = extractAsin(context.normalized.url);
  result = mergeProductResults(result, {
    sku: asin,
    productId: asin,
    extraction: { method: "store-specific", storeSpecific: true },
  });

  if (context.html) {
    const $ = loadHtml(context.html);
    const bodyText = $("body").text().slice(0, 2000).toLowerCase();
    const blocked = /captcha|robot check|enter the characters|sorry, we just need to make sure/i.test(
      bodyText,
    );
    const baseUrl = context.finalUrl ?? context.normalized.normalizedUrl;
    const dynamicImageAttr = $("#landingImage").attr("data-a-dynamic-image");
    const dynamicImages = dynamicImageAttr
      ? Object.keys(JSON.parse(dynamicImageAttr) as Record<string, unknown>)
      : [];

    const title = cleanText($("#productTitle").text());
    const priceText =
      cleanText($(".a-price .a-offscreen").first().text()) ??
      cleanText($("#priceblock_ourprice, #priceblock_dealprice, #corePrice_feature_div").first().text());
    const brand =
      cleanText($("#bylineInfo").text().replace(/^Visit the /i, "").replace(/ Store$/i, "")) ??
      cleanText($("tr:contains('Brand') td").last().text());

    result = mergeProductResults(result, {
      title,
      brand,
      price: parsePrice(priceText),
      currency: priceText ? "USD" : undefined,
      images: dedupeImages(
        [
          $("#landingImage").attr("src"),
          ...dynamicImages,
          ...amazonImagesFromScripts(context.html, baseUrl),
        ],
        baseUrl,
      ),
      variants: {
        colors: amazonVariantOptions($, "variation_color_name"),
        sizes: amazonVariantOptions($, "variation_size_name"),
        styles: amazonVariantOptions($, "variation_style_name"),
        capacities: amazonVariantOptions($, "variation_size_name")
          .filter((option) => /\b(?:gb|tb|pack|count)\b/i.test(option.label)),
        raw: {
          asin,
          twisterPresent: /twister|variationValues|dimensionValuesDisplayData/i.test(
            context.html,
          ),
        },
      },
      extraction: {
        method: "store-specific",
        storeSpecific: true,
        warnings: blocked
          ? ["Amazon returned a bot-protection or robot-check page; extraction may be limited"]
          : [],
      },
    });
  }

  if (!context.html) {
    result.extraction.warnings.push("Amazon HTML was unavailable; extraction is limited to URL metadata");
  }
  if (!result.title) {
    result.extraction.warnings.push("Amazon title not found; page may be blocked or rendered dynamically");
  }

  return finalizeResult(result);
}

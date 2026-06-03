import type { ExtractorContext, ProductVariantOption } from "../types";
import { extractGenericProduct } from "./generic";
import {
  cleanText,
  createBlockedResult,
  dedupeImages,
  dedupeVariantOptions,
  finalizeResult,
  getUrlPathCode,
  isBlockedPage,
  isLikelyNavigationVariantLabel,
  loadHtml,
  mergeProductResults,
  normalizeImageUrl,
  parseCurrency,
  parsePrice,
  replaceImages,
  replaceVariants,
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
    const image = match[0].replaceAll("\\/", "/").replaceAll("\\u002F", "/");
    if (/m\.media-amazon\.com\/images\/I\/|images-na\.ssl-images-amazon\.com\/images\/I\//i.test(image)) {
      candidates.push(image);
    }
  }
  return dedupeImages(candidates, baseUrl);
}

function amazonVariantOptions(
  $: ReturnType<typeof loadHtml>,
  groupId: string,
): ProductVariantOption[] {
  const options: ProductVariantOption[] = [];
  $(`#${groupId} li, #${groupId} option`).each(
    (_, element) => {
      const $element = $(element);
      const label =
        cleanText($element.attr("title")?.replace(/^Click to select /i, "")) ??
        cleanText($element.find(".selection, .a-size-base, img").attr("alt")) ??
        cleanText($element.text());
      if (!label || /select|currently unavailable/i.test(label)) return;
      if (isLikelyNavigationVariantLabel(label)) return;
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

function parseDynamicImageUrls(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.keys(parsed);
  } catch {
    return [];
  }
}

function amazonOfferJsonPrice(html: string): string | undefined {
  const patterns = [
    /"priceToPay"\s*:\s*\{[\s\S]{0,600}?"displayString"\s*:\s*"([^"]*\$[^"]+)"/i,
    /"basisPrice"\s*:\s*\{[\s\S]{0,600}?"displayString"\s*:\s*"([^"]*\$[^"]+)"/i,
    /"priceAmount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /"displayPrice"\s*:\s*"([^"]*\$[^"]+)"/i,
    /"price"\s*:\s*\{\s*"amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /"ourPrice"\s*:\s*"([^"]*\$[^"]+)"/i,
    /"price"\s*:\s*"(\$[0-9,]+(?:\.[0-9]{2})?)"/i,
  ];
  for (const pattern of patterns) {
    const value = cleanText(html.match(pattern)?.[1]);
    const price = parsePrice(value);
    if (value && price !== undefined && isReasonableAmazonPrice(price)) return value;
  }
  return undefined;
}

function isReasonableAmazonPrice(price: number | undefined): price is number {
  return price !== undefined && price > 0 && price < 10_000;
}

function amazonPriceFromWholeFraction($: ReturnType<typeof loadHtml>): string | undefined {
  const containers = [
    "#corePrice_feature_div",
    "#apex_desktop",
    "#tp_price_block_total_price_ww",
    "#newAccordionRow",
  ];
  for (const selector of containers) {
    const container = $(selector).first();
    if (container.length === 0) continue;
    const whole = cleanText(container.find(".a-price-whole").first().text());
    const fraction = cleanText(container.find(".a-price-fraction").first().text());
    if (!whole) continue;
    const candidate = `$${whole.replace(/[^\d,]/g, "")}.${(fraction ?? "00").replace(/[^\d]/g, "").padEnd(2, "0").slice(0, 2)}`;
    if (isReasonableAmazonPrice(parsePrice(candidate))) return candidate;
  }
  return undefined;
}

function amazonPriceText($: ReturnType<typeof loadHtml>, html: string): string | undefined {
  const offerJsonPrice = amazonOfferJsonPrice(html);
  if (offerJsonPrice) return offerJsonPrice;

  const selectors = [
    "#corePrice_feature_div .a-price .a-offscreen",
    "#apex_desktop .a-price .a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    ".reinventPricePriceToPayMargin .a-offscreen",
    "[data-a-color='price'] .a-offscreen",
    "span.a-price span.a-offscreen",
  ];
  for (const selector of selectors) {
    const values = $(selector)
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter((value): value is string => Boolean(value) && /\$|USD|US\$/i.test(value));
    const value = values.find((candidate) => {
      const price = parsePrice(candidate);
      return isReasonableAmazonPrice(price);
    });
    if (value) return value;
  }
  return amazonPriceFromWholeFraction($);
}

export async function extractAmazonProduct(context: ExtractorContext) {
  const asin = extractAsin(context.normalized.url);
  if (context.html && isBlockedPage(context.html, context.fetchStatus)) {
    return finalizeResult(
      createBlockedResult(context, undefined, {
        sku: asin,
        productId: asin,
      }),
    );
  }

  let result = await extractGenericProduct(context);
  result.extraction.storeSpecific = true;
  result.extraction.method = "store-specific";

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
    const dynamicImages = parseDynamicImageUrls($("#landingImage").attr("data-a-dynamic-image"));

    const title = cleanText($("#productTitle").text());
    const priceText = amazonPriceText($, context.html);
    const price = parsePrice(priceText);
    const brand =
      cleanText($("#bylineInfo").text().replace(/^Visit the /i, "").replace(/ Store$/i, "")) ??
      cleanText($("tr:contains('Brand') td").last().text());
    const productImages = dedupeImages(
      [
        $("#landingImage").attr("src"),
        ...dynamicImages,
        ...amazonImagesFromScripts(context.html, baseUrl),
      ],
      baseUrl,
    );

    result = mergeProductResults(result, {
      title,
      brand,
      price,
      currency: parseCurrency(priceText),
      images: productImages,
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
    result.price = isReasonableAmazonPrice(price) ? price : undefined;
    result.currency = result.price ? parseCurrency(priceText) ?? "USD" : undefined;
    result = replaceImages(result, productImages);
    result = replaceVariants(result, {
      colors: amazonVariantOptions($, "variation_color_name"),
      sizes: amazonVariantOptions($, "variation_size_name").filter(
        (option) => !/zappos|shoes\s*&?\s*clothing/i.test(option.label),
      ),
      styles: amazonVariantOptions($, "variation_style_name"),
      capacities: amazonVariantOptions($, "variation_size_name").filter((option) =>
        /\b(?:gb|tb|pack|count)\b/i.test(option.label),
      ),
      raw: result.variants.raw,
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

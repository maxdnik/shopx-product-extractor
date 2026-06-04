import type { ExtractorContext, FieldEvidence, ProductVariantOption } from "../types";
import { extractGenericProduct } from "./generic";
import {
  attachEvidence,
  cleanText,
  createBlockedResult,
  dedupeImages,
  dedupeVariantOptions,
  emptyEvidence,
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
  $(`#${groupId} li, #${groupId} option`).each((_, element) => {
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
  });
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

function isReasonableAmazonPrice(price: number | undefined): price is number {
  return price !== undefined && price > 0 && price < 10_000;
}

function evidenceForAmazonPrice(
  rawValue: unknown,
  sourceType: FieldEvidence["sourceType"],
  source: Pick<FieldEvidence, "selector" | "jsonPath" | "reason" | "confidence"> = {},
): FieldEvidence {
  const normalizedValue = parsePrice(rawValue);
  const accepted = isReasonableAmazonPrice(normalizedValue) && (source.confidence ?? 0) > 0;
  return {
    field: "price",
    sourceType,
    rawValue,
    normalizedValue,
    accepted,
    ...source,
    reason: source.reason ?? (accepted ? undefined : "missing or unreasonable Amazon price"),
  };
}

function amazonPriceContextScore(
  context: string,
  base: number,
  asin?: string,
): { confidence: number; reason?: string } {
  const lower = context.toLowerCase();
  const rejectPatterns: Array<[RegExp, string]> = [
    [/monthly|\/mo|per month|month payment|installment|financing|apr|affirm/i, "financing/monthly payment"],
    [/coupon|subscribe|save \d+|savings|promotion|promo|limited time deal/i, "coupon or promotional amount"],
    [/shipping|delivery|import fees|tax|gift wrap/i, "shipping/tax/fee amount"],
    [/warranty|protection plan|protector|case|charger|adapter|accessory/i, "accessory or warranty price"],
    [/sponsored|recommend|customers also|similar item|carousel|comparison|desktop_unified/i, "recommendation/comparison price"],
    [/list price|was:|strike|basisPrice|data-a-strike/i, "strike/list/reference price"],
  ];
  for (const [pattern, reason] of rejectPatterns) {
    if (pattern.test(lower)) return { confidence: 0, reason };
  }

  let confidence = base;
  if (/priceToPay|corePrice|corepricedisplay|apex_desktop|buybox|newAccordionRow/i.test(context)) {
    confidence += 45;
  }
  if (/displayPrice|priceAmount|offerListing|twister-plus-buying-options-price-data/i.test(context)) {
    confidence += 30;
  }
  if (/a-price|a-offscreen|priceblock_ourprice|priceblock_dealprice/i.test(context)) {
    confidence += 25;
  }
  if (/add to cart|buy now|ships from|sold by/i.test(context)) {
    confidence += 10;
  }
  if (asin && context.includes(asin)) {
    confidence += 20;
  }
  return { confidence: Math.min(confidence, 100) };
}

function normalizedAmazonHtml(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/\\"/g, '"')
    .replace(/&#36;/g, "$")
    .replace(/&amp;/g, "&");
}

function amazonOfferJsonEvidence(html: string, asin?: string): FieldEvidence[] {
  const normalizedHtml = normalizedAmazonHtml(html);
  const evidence: FieldEvidence[] = [];
  const patterns: Array<[RegExp, string]> = [
    [
      /"priceToPay"\s*:\s*\{[\s\S]{0,900}?"displayString"\s*:\s*"([^"]*\$[^"]+)"/gi,
      "$..priceToPay.displayString",
    ],
    [
      /"priceToPay"\s*:\s*\{[\s\S]{0,900}?"priceAmount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi,
      "$..priceToPay.priceAmount",
    ],
    [
      /"twister-plus-buying-options-price-data"[\s\S]{0,1200}?"displayPrice"\s*:\s*"([^"]*\$[^"]+)"/gi,
      "$..twisterPlus.displayPrice",
    ],
  ];

  for (const [pattern, jsonPath] of patterns) {
    for (const match of normalizedHtml.matchAll(pattern)) {
      const index = match.index ?? 0;
      const context = normalizedHtml.slice(Math.max(0, index - 900), index + 900);
      if (asin && !context.includes(asin)) {
        evidence.push(
          evidenceForAmazonPrice(match[1], "product-json", {
            jsonPath,
            confidence: 0,
            reason: "Amazon offer JSON candidate is not tied to current ASIN",
          }),
        );
        continue;
      }
      const score = amazonPriceContextScore(context, 75, asin);
      evidence.push(
        evidenceForAmazonPrice(match[1], "product-json", {
          jsonPath,
          confidence: score.confidence,
          reason: score.reason,
        }),
      );
    }
  }

  return evidence;
}

function amazonScopedSelectorPriceEvidence(
  $: ReturnType<typeof loadHtml>,
  asin?: string,
): FieldEvidence[] {
  const evidence: FieldEvidence[] = [];
  const containerSelectors = [
    "#corePriceDisplay_desktop_feature_div",
    "#corePriceDisplay_mobile_feature_div",
    "#corePrice_feature_div",
    "#apex_desktop",
    "#newAccordionRow",
    "[data-feature-name='corePrice']",
    "[data-csa-c-content-id='corePrice']",
    "[data-csa-c-slot-id*='corePrice']",
  ];

  for (const containerSelector of containerSelectors) {
    $(containerSelector).each((_, container) => {
      const $container = $(container);
      const tiedAsin =
        $container.attr("data-csa-c-asin") ??
        $container.closest("[data-csa-c-asin]").attr("data-csa-c-asin");
      const context = $.html($container).slice(0, 5000);

      if (asin && tiedAsin && tiedAsin !== asin) return;

      const priceNodes = $container.find(
        ".a-price:not([data-a-strike='true']) .a-offscreen, #priceblock_ourprice, #priceblock_dealprice",
      );

      if (asin && !tiedAsin && !context.includes(asin)) {
        priceNodes.each((_, element) => {
          evidence.push(
            evidenceForAmazonPrice($(element).text(), "selector", {
              selector: `${containerSelector} .a-price .a-offscreen`,
              confidence: 0,
              reason: "Amazon PDP price container is not tied to current ASIN",
            }),
          );
        });
        return;
      }

      priceNodes.each((_, element) => {
        const nodeContext = $.html($(element).closest(".a-price, [data-a-color='price'], span, div").first()).slice(0, 1000);
        const score = amazonPriceContextScore(nodeContext, tiedAsin || (asin && context.includes(asin)) ? 100 : 80);
        evidence.push(
          evidenceForAmazonPrice($(element).text(), "selector", {
            selector: `${containerSelector} .a-price .a-offscreen`,
            confidence: score.confidence,
            reason: score.reason,
          }),
        );
      });

      const whole = cleanText($container.find(".a-price-whole").first().text());
      const fraction = cleanText($container.find(".a-price-fraction").first().text());
      if (whole) {
        const candidate = `$${whole.replace(/[^\d,]/g, "")}.${(fraction ?? "00").replace(/[^\d]/g, "").padEnd(2, "0").slice(0, 2)}`;
        const priceContext = $.html($container.find(".a-price-whole").first().closest(".a-price, span, div")).slice(0, 1000);
        const priceScore = amazonPriceContextScore(priceContext, tiedAsin || (asin && context.includes(asin)) ? 100 : 80);
        evidence.push(
          evidenceForAmazonPrice(candidate, "selector", {
            selector: `${containerSelector} .a-price-whole + .a-price-fraction`,
            confidence: priceScore.confidence,
            reason: priceScore.reason,
          }),
        );
      }
    });
  }

  return evidence;
}

function amazonPriceEvidence(
  $: ReturnType<typeof loadHtml>,
  html: string,
  asin?: string,
): FieldEvidence[] {
  return [
    ...amazonOfferJsonEvidence(html, asin),
    ...amazonScopedSelectorPriceEvidence($, asin),
  ];
}

function chooseAmazonPriceEvidence(candidates: FieldEvidence[]): FieldEvidence | undefined {
  const grouped = new Map<string, { candidate: FieldEvidence; score: number; count: number }>();

  for (const candidate of candidates) {
    if (!candidate.accepted || candidate.sourceType === "fallback") continue;
    const price = parsePrice(candidate.normalizedValue ?? candidate.rawValue);
    if (!isReasonableAmazonPrice(price)) continue;

    const key = price.toFixed(2);
    const sourceBoost =
      candidate.sourceType === "playwright"
        ? 70
        : candidate.sourceType === "selector"
          ? 55
          : candidate.sourceType === "product-json"
            ? 35
            : 0;
    const specificityBoost =
      candidate.selector?.includes("corePriceDisplay") ||
      candidate.selector?.includes("corePrice_feature_div") ||
      candidate.selector?.includes("apex_desktop") ||
      candidate.selector?.includes("newAccordionRow")
        ? 45
        : 0;
    const score = (candidate.confidence ?? 0) + sourceBoost + specificityBoost;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { candidate, score, count: 1 });
    } else {
      existing.count += 1;
      existing.score += score;
      if (score > (existing.candidate.confidence ?? 0)) {
        existing.candidate = candidate;
      }
    }
  }

  return Array.from(grouped.values())
    .map((entry) => ({ ...entry, total: entry.score + entry.count * 20 }))
    .sort((left, right) => right.total - left.total)[0]?.candidate;
}

async function amazonPriceWithPlaywright(url: string, asin?: string): Promise<FieldEvidence | undefined> {
  if (process.env.PRODUCT_EXTRACTOR_DISABLE_AUTO_PLAYWRIGHT === "true") return undefined;

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
    await page.waitForSelector("#productTitle", { timeout: 8_000 }).catch(() => undefined);
    const containerSelector = [
      "#corePriceDisplay_desktop_feature_div",
      "#corePriceDisplay_mobile_feature_div",
      "#corePrice_feature_div",
      "#apex_desktop",
      "#newAccordionRow",
      "[data-feature-name='corePrice']",
      "[data-csa-c-content-id='corePrice']",
      "[data-csa-c-slot-id*='corePrice']",
    ].join(", ");
    await page.waitForSelector(containerSelector, { timeout: 10_000 }).catch(() => undefined);
    const candidate = await page.evaluate(
      ({ containerSelector, asin }) => {
        const clean = (value: string | null | undefined) =>
          value?.replace(/\s+/g, " ").trim();
        for (const container of Array.from(document.querySelectorAll(containerSelector))) {
          const tiedAsin =
            container.getAttribute("data-csa-c-asin") ??
            container.closest("[data-csa-c-asin]")?.getAttribute("data-csa-c-asin");
          const context = container.textContent ?? "";
          if (asin && tiedAsin && tiedAsin !== asin) continue;
          if (asin && !tiedAsin && !container.outerHTML.includes(asin)) continue;

          const rejected = /monthly|\/mo|coupon|subscribe|shipping|delivery|warranty|protection|sponsored|recommend|comparison|list price|was:/i.test(
            context,
          );
          if (rejected) continue;

          const node = container.querySelector(
            ".a-price:not([data-a-strike='true']) .a-offscreen, #priceblock_ourprice, #priceblock_dealprice",
          );
          const rawValue = clean(node?.textContent);
          if (rawValue) return rawValue;

          const whole = clean(container.querySelector(".a-price-whole")?.textContent)?.replace(/[^\d,]/g, "");
          const fraction = clean(container.querySelector(".a-price-fraction")?.textContent)?.replace(/[^\d]/g, "");
          if (whole) return `$${whole}.${(fraction ?? "00").padEnd(2, "0").slice(0, 2)}`;
        }
        return undefined;
      },
      { containerSelector, asin },
    );
    if (!candidate) return undefined;
    const evidence = evidenceForAmazonPrice(candidate, "playwright", {
      selector: ".a-price .a-offscreen",
      confidence: 95,
    });
    return evidence.accepted ? evidence : undefined;
  } catch (error) {
    return {
      field: "price",
      sourceType: "playwright",
      accepted: false,
      reason: error instanceof Error ? error.message : "Playwright price extraction failed",
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function extractAmazonProduct(context: ExtractorContext) {
  const evidence = emptyEvidence();
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
    if (title) {
      evidence.titleCandidates.push({
        field: "title",
        sourceType: "selector",
        selector: "#productTitle",
        rawValue: title,
        normalizedValue: title,
        accepted: true,
      });
    }

    evidence.priceCandidates.push(...amazonPriceEvidence($, context.html, asin));
    let selectedPriceEvidence = chooseAmazonPriceEvidence(evidence.priceCandidates);

    if (!selectedPriceEvidence) {
      const playwrightEvidence = await amazonPriceWithPlaywright(
        context.normalized.normalizedUrl,
        asin,
      );
      if (playwrightEvidence) {
        evidence.priceCandidates.push(playwrightEvidence);
        selectedPriceEvidence = playwrightEvidence.accepted ? playwrightEvidence : undefined;
      }
    }

    const priceText = cleanText(selectedPriceEvidence?.rawValue);
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
      price: isReasonableAmazonPrice(price) ? price : undefined,
      currency: isReasonableAmazonPrice(price) ? parseCurrency(priceText) ?? "USD" : undefined,
      images: productImages,
      variants: {
        colors: amazonVariantOptions($, "variation_color_name"),
        sizes: amazonVariantOptions($, "variation_size_name"),
        styles: amazonVariantOptions($, "variation_style_name"),
        capacities: amazonVariantOptions($, "variation_size_name").filter((option) =>
          /\b(?:gb|tb|pack|count)\b/i.test(option.label),
        ),
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
    if (!result.price) {
      result.extraction.warnings.push("Amazon price requires rendered PDP extraction");
    }
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
    result.extraction.warnings.push("Amazon price requires rendered PDP extraction");
  }
  if (!result.title) {
    result.extraction.warnings.push("Amazon title not found; page may be blocked or rendered dynamically");
  }

  return finalizeResult(
    context.options.includeDebug ? attachEvidence(result, evidence) : result,
  );
}

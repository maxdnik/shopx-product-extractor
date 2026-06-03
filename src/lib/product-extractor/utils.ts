import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type {
  EmbeddedJsonCandidate,
  ExtractorContext,
  FetchHtmlResult,
  JsonObject,
  PartialProductData,
  ProductConfidence,
  ProductExtractResult,
  ProductVariantOption,
  ProductVariants,
} from "./types";

const DEFAULT_TIMEOUT_MS = 18_000;
const MAX_HTML_CHARS = 5_000_000;
const MAX_RECURSION_DEPTH = 8;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return undefined;
  const lower = normalized.toLowerCase();
  if (["null", "undefined", "n/a", "select", "seleccionar"].includes(lower)) {
    return undefined;
  }
  return normalized;
}

const BLOCKED_PAGE_PATTERNS = [
  /access denied/i,
  /unable to give you access/i,
  /request (?:has been )?blocked/i,
  /temporarily blocked/i,
  /robot check/i,
  /enter the characters you see below/i,
  /captcha/i,
  /akamai/i,
  /perimeterx/i,
];

const NAVIGATION_VARIANT_LABEL_PATTERNS = [
  /^help$/i,
  /^details$/i,
  /^product details$/i,
  /^size guide$/i,
  /^guide$/i,
  /^shipping (?:&|and) returns$/i,
  /^shipping$/i,
  /^returns$/i,
  /^reviews?$/i,
  /^men'?s?$/i,
  /^women'?s?$/i,
  /^kids?$/i,
  /^all shoes$/i,
  /^basketball$/i,
  /^running$/i,
  /^soccer$/i,
  /^training (?:&|and) gym$/i,
  /^sandals (?:&|and) slides$/i,
  /^lifestyle$/i,
  /^jordan$/i,
  /^father'?s day shoes$/i,
  /^shop by color$/i,
  /^extra \d+% off/i,
  /^product details?size/i,
  /fabric (?:&|and) care/i,
  /add to bag/i,
  /sign in/i,
  /favorites?/i,
  /zappos/i,
];

export function isBlockedPage(html = "", status?: number): boolean {
  if ([401, 403, 429, 451, 503].includes(status ?? 0)) {
    const lower = html.slice(0, 20_000).toLowerCase();
    if (BLOCKED_PAGE_PATTERNS.some((pattern) => pattern.test(lower))) return true;
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const earlyText = `${title} ${html.slice(0, 15_000)}`;
  return BLOCKED_PAGE_PATTERNS.some((pattern) => pattern.test(earlyText));
}

export function blockedPageReason(html = "", status?: number): string {
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  if (status) {
    return title ? `HTTP ${status}: ${title}` : `HTTP ${status}: blocked response`;
  }
  return title ?? "Blocked response detected";
}

export function isLikelyNavigationVariantLabel(label: string): boolean {
  const cleaned = cleanText(label);
  if (!cleaned) return true;
  if (cleaned.length > 64) return true;
  if (NAVIGATION_VARIANT_LABEL_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return true;
  }
  const lower = cleaned.toLowerCase();
  if (
    lower.includes("product details") ||
    lower.includes("size guide") ||
    lower.includes("shipping") ||
    lower.includes("fabric & care")
  ) {
    return true;
  }
  return false;
}

export function isLikelySizeLabel(label: string): boolean {
  const cleaned = cleanText(label);
  if (!cleaned || isLikelyNavigationVariantLabel(cleaned)) return false;
  return /^(?:xxxxs|xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|xxxxl|one size|os|[0-9]{1,2}(?:\.[05])?|[0-9]{2,3}(?:w|l)?|[0-9]{1,2}\s?\/\s?[0-9]{1,2}|m\s?\d+(?:\.\d)?\s?\/\s?w\s?\d+(?:\.\d)?)$/i.test(
    cleaned,
  );
}

export function isLikelyColorLabel(label: string): boolean {
  const cleaned = cleanText(label);
  if (!cleaned || isLikelyNavigationVariantLabel(cleaned)) return false;
  if (/\d+% off|size|guide|details|shipping|returns/i.test(cleaned)) return false;
  return cleaned.length <= 60;
}

export function parsePrice(value: unknown): number | undefined {
  const text = cleanText(value);
  if (!text) return undefined;

  const priceLike = text.match(/(?:US\$|\$|USD\s*)?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})|\d+(?:\.\d{2})?)/i);
  const raw = priceLike?.[1] ?? text.match(/\d+(?:[.,]\d+)?/)?.[0];
  if (!raw) return undefined;

  const normalized = raw.replace(/[\s,]/g, "");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed * 100) / 100;
}

export function parseCurrency(value?: unknown, context?: unknown): string | undefined {
  const text = [cleanText(value), cleanText(context)].filter(Boolean).join(" ");
  if (!text) return undefined;
  if (/\bUSD\b|US\$|\$\s*\d|\d\s*USD/i.test(text)) return "USD";
  if (/\bEUR\b|€/i.test(text)) return "EUR";
  if (/\bGBP\b|£/i.test(text)) return "GBP";
  if (/\bARS\b|AR\$/i.test(text)) return "ARS";
  return undefined;
}

export function normalizeAvailability(value: unknown): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (/instock|in stock|disponible|available/.test(lower)) return "in_stock";
  if (/outofstock|out of stock|agotado|sold out|unavailable/.test(lower)) {
    return "out_of_stock";
  }
  if (/preorder|pre-order|prevent[aá]/.test(lower)) return "preorder";
  return text;
}

export function normalizeImageUrl(value: unknown, baseUrl: string): string | undefined {
  const raw = cleanText(value);
  if (!raw) return undefined;

  const candidate = raw
    .split(/\s+/)[0]
    .replace(/^url\(["']?/, "")
    .replace(/["']?\)$/, "");

  if (!candidate || candidate.startsWith("data:")) return undefined;

  try {
    const url = new URL(candidate, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function dedupeImages(images: unknown[], baseUrl = "https://example.com"): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const image of images) {
    const normalized = normalizeImageUrl(image, baseUrl);
    if (!normalized) continue;
    const key = normalized.replace(/([?&])(width|height|w|h|fmt|qlt|quality)=\d+/gi, "$1");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }

  return deduped.slice(0, 24);
}

export function dedupeVariantOptions(
  options: Array<ProductVariantOption | undefined>,
): ProductVariantOption[] {
  const seen = new Set<string>();
  const result: ProductVariantOption[] = [];

  for (const option of options) {
    const label = cleanText(option?.label);
    if (!label) continue;
    if (isLikelyNavigationVariantLabel(label)) continue;
    const key = `${label.toLowerCase()}|${option?.value ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      label,
      value: cleanText(option?.value),
      available: option?.available,
      image: option?.image,
      url: option?.url,
    });
  }

  return result.slice(0, 80);
}

export function emptyVariants(): ProductVariants {
  return {
    colors: [],
    sizes: [],
    capacities: [],
    dimensions: [],
    styles: [],
  };
}

export async function fetchHtml(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FetchHtmlResult> {
  const warnings: string[] = [];

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,es-AR;q=0.8,es;q=0.7",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    const contentType = response.headers.get("content-type");
    if (!contentType?.toLowerCase().includes("text/html")) {
      warnings.push(`Response content-type is not HTML: ${contentType ?? "unknown"}`);
    }

    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    if (html.length >= MAX_HTML_CHARS) {
      warnings.push("HTML response was truncated for safety");
    }

    return {
      ok: response.ok,
      url,
      finalUrl: response.url,
      status: response.status,
      statusText: response.statusText,
      html,
      contentType,
      warnings,
      error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : "Unknown fetch error",
      warnings,
    };
  }
}

export function loadHtml(html = ""): CheerioAPI {
  return cheerio.load(html, { xml: false });
}

function safeJsonParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function jsonFromAssignment(script: string, variablePattern: RegExp): unknown | undefined {
  const match = script.match(variablePattern);
  if (!match?.[1]) return undefined;

  let candidate = match[1].trim();
  if (candidate.endsWith(";")) candidate = candidate.slice(0, -1);

  let depth = 0;
  let endIndex = -1;
  let inString: string | null = null;
  let escaped = false;

  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (inString) {
      if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    if (char === "}" || char === "]") depth -= 1;
    if (depth === 0 && index > 0) {
      endIndex = index + 1;
      break;
    }
  }

  if (endIndex > 0) {
    candidate = candidate.slice(0, endIndex);
  }

  return safeJsonParse(candidate);
}

function extractJsonObjectsFromText(text: string): unknown[] {
  const objects: unknown[] = [];
  const patterns = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/m,
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});/m,
    /window\.preloadedState\s*=\s*({[\s\S]*?});/m,
    /"products?"\s*:\s*(\{[\s\S]{20,40000}?\})/im,
  ];

  for (const pattern of patterns) {
    const parsed = jsonFromAssignment(text, pattern);
    if (parsed) objects.push(parsed);
  }

  return objects;
}

export function extractEmbeddedJsonCandidates($: CheerioAPI): EmbeddedJsonCandidate[] {
  const candidates: EmbeddedJsonCandidate[] = [];

  $("script").each((index, element) => {
    const type = cleanText($(element).attr("type"))?.toLowerCase();
    const id = cleanText($(element).attr("id"));
    const text = $(element).text().trim();
    if (!text || text.length < 2) return;

    if (type?.includes("json") || id === "__NEXT_DATA__") {
      const parsed = safeJsonParse(text);
      if (parsed !== undefined) {
        candidates.push({ source: id ?? type ?? `script-${index}`, data: parsed });
      }
    }

    if (
      /__INITIAL_STATE__|__PRELOADED_STATE__|preloadedState|ImageBlockATF|colorImages|twister|product/i.test(
        text.slice(0, 80_000),
      )
    ) {
      for (const data of extractJsonObjectsFromText(text.slice(0, 120_000))) {
        candidates.push({ source: `script-${index}`, data });
      }
    }
  });

  return candidates.slice(0, 80);
}

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(object: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = object[key];
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
    if (isJsonObject(value)) {
      const nested = readString(value, ["name", "@id", "url"]);
      if (nested) return nested;
    }
  }
  return undefined;
}

function readNumber(object: JsonObject, keys: string[]): number | undefined {
  for (const key of keys) {
    const parsed = parsePrice(object[key]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function collectImages(value: unknown, baseUrl: string): string[] {
  const images: unknown[] = [];
  const visit = (candidate: unknown, depth: number) => {
    if (depth > 3 || candidate === undefined || candidate === null) return;
    if (typeof candidate === "string") {
      images.push(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item, depth + 1);
      return;
    }
    if (isJsonObject(candidate)) {
      for (const key of ["url", "src", "image", "large", "hiRes", "main", "thumbnail"]) {
        if (key in candidate) visit(candidate[key], depth + 1);
      }
    }
  };
  visit(value, 0);
  return dedupeImages(images, baseUrl);
}

function getObjectType(object: JsonObject): string {
  const type = object["@type"];
  if (Array.isArray(type)) return type.map(String).join(" ").toLowerCase();
  return cleanText(type)?.toLowerCase() ?? "";
}

function isProductObject(object: JsonObject): boolean {
  const type = getObjectType(object);
  return (
    type.includes("product") ||
    ("offers" in object && ("name" in object || "title" in object)) ||
    ("price" in object && ("name" in object || "image" in object))
  );
}

function walkJson(value: unknown, visitor: (object: JsonObject) => void, depth = 0): void {
  if (depth > MAX_RECURSION_DEPTH) return;
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visitor, depth + 1);
    return;
  }
  if (!isJsonObject(value)) return;
  visitor(value);
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) {
      walkJson(child, visitor, depth + 1);
    }
  }
}

export function extractJsonLdProducts($: CheerioAPI, baseUrl: string): PartialProductData[] {
  const products: PartialProductData[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).text();
    const parsed = safeJsonParse(text);
    if (parsed === undefined) return;

    walkJson(parsed, (object) => {
      if (!isProductObject(object)) return;
      const offer = arrayify(object.offers).find(isJsonObject);
      const aggregateOffer = isJsonObject(object.aggregateOffer)
        ? object.aggregateOffer
        : undefined;
      const offerLike = offer ?? aggregateOffer;
      const brandObject = isJsonObject(object.brand) ? object.brand : undefined;

      products.push({
        title: readString(object, ["name", "title"]),
        brand: brandObject ? readString(brandObject, ["name"]) : readString(object, ["brand"]),
        description: readString(object, ["description"]),
        sku: readString(object, ["sku", "mpn"]),
        model: readString(object, ["model"]),
        productId: readString(object, ["productID", "productId", "@id", "sku"]),
        category: readString(object, ["category"]),
        price: offerLike ? readNumber(offerLike, ["price", "lowPrice", "highPrice"]) : undefined,
        currency: offerLike
          ? parseCurrency(
              readString(offerLike, ["priceCurrency", "currency"]),
              JSON.stringify(offerLike).slice(0, 500),
            )
          : undefined,
        availability: offerLike
          ? normalizeAvailability(readString(offerLike, ["availability"]))
          : undefined,
        images: collectImages(object.image, baseUrl),
        extraction: { method: "jsonld" },
      });
    });
  });

  return products;
}

export function extractOpenGraph($: CheerioAPI, baseUrl: string): PartialProductData {
  const readMeta = (...names: string[]): string | undefined => {
    for (const name of names) {
      const value =
        $(`meta[property="${name}"]`).attr("content") ??
        $(`meta[name="${name}"]`).attr("content");
      const cleaned = cleanText(value);
      if (cleaned) return cleaned;
    }
    return undefined;
  };

  const imageValues: string[] = [];
  $('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"]').each(
    (_, element) => {
      const image = normalizeImageUrl($(element).attr("content"), baseUrl);
      if (image) imageValues.push(image);
    },
  );

  const priceText = readMeta(
    "product:price:amount",
    "og:price:amount",
    "twitter:data1",
    "price",
  );

  return {
    title: readMeta("og:title", "twitter:title"),
    description: readMeta("og:description", "twitter:description", "description"),
    price: parsePrice(priceText),
    currency: parseCurrency(
      readMeta("product:price:currency", "og:price:currency", "currency"),
      priceText,
    ),
    availability: normalizeAvailability(
      readMeta("product:availability", "og:availability", "availability"),
    ),
    images: dedupeImages(imageValues, baseUrl),
    extraction: { method: "html" },
  };
}

export function extractMetaTags($: CheerioAPI): Record<string, string> {
  const meta: Record<string, string> = {};
  $("meta").each((_, element) => {
    const key = cleanText($(element).attr("property") ?? $(element).attr("name"));
    const value = cleanText($(element).attr("content"));
    if (key && value) meta[key] = value;
  });
  return meta;
}

function productDataFromObject(object: JsonObject, baseUrl: string): PartialProductData {
  const offer = arrayify(object.offers).find(isJsonObject);
  const priceContainer =
    offer ??
    (isJsonObject(object.price) ? object.price : undefined) ??
    (isJsonObject(object.pricing) ? object.pricing : undefined);
  const brandObject = isJsonObject(object.brand) ? object.brand : undefined;

  return {
    title: readString(object, ["name", "title", "productName", "displayName"]),
    brand: brandObject
      ? readString(brandObject, ["name", "label"])
      : readString(object, ["brand", "brandName"]),
    description: readString(object, ["description", "shortDescription", "longDescription"]),
    price:
      readNumber(object, ["price", "salePrice", "currentPrice", "listPrice"]) ??
      (priceContainer
        ? readNumber(priceContainer, ["price", "sale", "salePrice", "current", "value", "amount"])
        : undefined),
    currency:
      readString(object, ["currency", "priceCurrency"]) ??
      (priceContainer
        ? parseCurrency(
            readString(priceContainer, ["currency", "priceCurrency"]),
            JSON.stringify(priceContainer).slice(0, 500),
          )
        : undefined),
    availability: normalizeAvailability(
      readString(object, ["availability", "stockStatus", "inventoryStatus"]),
    ),
    sku: readString(object, ["sku", "styleColor", "styleNumber", "partNumber"]),
    model: readString(object, ["model", "modelNumber"]),
    productId: readString(object, ["id", "productId", "productID", "pid", "code"]),
    category: readString(object, ["category", "categoryName"]),
    images: dedupeImages(
      [
        ...collectImages(object.image, baseUrl),
        ...collectImages(object.images, baseUrl),
        ...collectImages(object.media, baseUrl),
        ...collectImages(object.assets, baseUrl),
      ],
      baseUrl,
    ),
  };
}

export function extractProductDataFromEmbeddedJson(
  candidates: EmbeddedJsonCandidate[],
  baseUrl: string,
): PartialProductData[] {
  const products: PartialProductData[] = [];

  for (const candidate of candidates) {
    walkJson(candidate.data, (object) => {
      if (!isProductObject(object)) return;
      const product = productDataFromObject(object, baseUrl);
      if (product.title || product.price || product.images?.length || product.productId) {
        products.push({
          ...product,
          extraction: { method: "embedded-json" },
        });
      }
    });
  }

  return products.slice(0, 20);
}

function optionAvailabilityFromAttributes(
  disabled?: string,
  ariaDisabled?: string,
  className?: string,
): boolean | undefined {
  if (disabled !== undefined) return false;
  if (ariaDisabled === "true") return false;
  if (className && /disabled|unavailable|sold-out|oos/i.test(className)) return false;
  if (className && /available|selected|active/i.test(className)) return true;
  return undefined;
}

function selectorText($: CheerioAPI, selector: string): string | undefined {
  const element = $(selector).first();
  return cleanText(element.text() || element.attr("content") || element.attr("value"));
}

export function extractDomHeuristics($: CheerioAPI, baseUrl: string): PartialProductData {
  const imageCandidates: string[] = [];
  $(
    [
      'img[src*="/"]',
      "img[srcset]",
      "source[srcset]",
      "[data-src]",
      "[data-image]",
      "[data-zoom-image]",
    ].join(","),
  ).each((_, element) => {
    const attrs = [
      $(element).attr("src"),
      $(element).attr("data-src"),
      $(element).attr("data-image"),
      $(element).attr("data-zoom-image"),
      $(element).attr("srcset")?.split(",").at(-1)?.trim().split(/\s+/)[0],
    ];
    for (const attr of attrs) {
      const normalized = normalizeImageUrl(attr, baseUrl);
      if (normalized && !/sprite|logo|icon|placeholder/i.test(normalized)) {
        imageCandidates.push(normalized);
      }
    }
  });

  const colors: ProductVariantOption[] = [];
  const sizes: ProductVariantOption[] = [];
  const capacities: ProductVariantOption[] = [];
  const dimensions: ProductVariantOption[] = [];
  const styles: ProductVariantOption[] = [];

  const variantSelectors = [
    "button",
    "a",
    "option",
    "[role='option']",
    "[data-testid]",
    "[data-test]",
    "[data-qa]",
    "[aria-label]",
  ].join(",");

  $(variantSelectors).each((_, element) => {
    const $element = $(element);
    const context = [
      $element.attr("aria-label"),
      $element.attr("title"),
      $element.attr("data-testid"),
      $element.attr("data-test"),
      $element.attr("data-qa"),
      $element.attr("name"),
      $element.parent().attr("aria-label"),
      $element.closest("[aria-label]").attr("aria-label"),
      $element.closest("fieldset").find("legend").first().text(),
      $element.closest("label").text(),
    ]
      .map(cleanText)
      .filter(Boolean)
      .join(" ");
    const label =
      cleanText($element.attr("aria-label")) ??
      cleanText($element.attr("title")) ??
      cleanText($element.attr("alt")) ??
      cleanText($element.attr("value")) ??
      cleanText($element.text());
    if (!label || label.length > 80) return;
    if (isLikelyNavigationVariantLabel(label)) return;

    const option: ProductVariantOption = {
      label,
      value: cleanText($element.attr("value") ?? $element.attr("data-value")),
      available: optionAvailabilityFromAttributes(
        $element.attr("disabled"),
        $element.attr("aria-disabled"),
        $element.attr("class"),
      ),
      image: normalizeImageUrl($element.find("img").first().attr("src"), baseUrl),
      url: normalizeImageUrl($element.attr("href"), baseUrl),
    };

    const variantContext = `${context} ${label}`.toLowerCase();
    if (/colou?r|colorway|swatch|shade|tono|color/.test(variantContext) && isLikelyColorLabel(label)) {
      colors.push(option);
    } else if (
      /size|talle|tamaño|waist|inseam|shoe|calzado/.test(variantContext) &&
      isLikelySizeLabel(label)
    ) {
      sizes.push(option);
    } else if (/capacity|storage|\bgb\b|\btb\b|capacidad/.test(variantContext)) {
      capacities.push(option);
    } else if (/dimension|width|height|length|ancho|alto|largo/.test(variantContext)) {
      dimensions.push(option);
    } else if (/style|edition|fit|modelo|estilo/.test(variantContext)) {
      styles.push(option);
    }
  });

  const priceText =
    selectorText(
      $,
      [
        "[data-testid*='price' i]",
        "[data-test*='price' i]",
        "[class*='price' i]",
        "[id*='price' i]",
        "[itemprop='price']",
      ].join(","),
    ) ?? $("body").text().match(/(?:US\$|\$|USD\s*)\s*\d[\d,]*(?:\.\d{2})?/)?.[0];

  const title =
    selectorText($, "h1") ??
    selectorText(
      $,
      [
        "[data-testid*='title' i]",
        "[data-test*='title' i]",
        "[class*='product-title' i]",
        "[class*='product-name' i]",
        "[itemprop='name']",
      ].join(","),
    );

  return {
    title,
    description:
      selectorText($, "[itemprop='description']") ??
      selectorText($, "[data-testid*='description' i], [class*='description' i]"),
    price: parsePrice(priceText),
    currency: parseCurrency(priceText),
    images: dedupeImages(imageCandidates, baseUrl),
    variants: {
      colors: dedupeVariantOptions(colors),
      sizes: dedupeVariantOptions(sizes),
      capacities: dedupeVariantOptions(capacities),
      dimensions: dedupeVariantOptions(dimensions),
      styles: dedupeVariantOptions(styles),
    },
    extraction: { method: "html" },
  };
}

export function createEmptyResult(
  context: ExtractorContext,
  warnings: string[] = [],
): ProductExtractResult {
  return {
    ok: false,
    sourceUrl: context.normalized.sourceUrl,
    normalizedUrl: context.normalized.normalizedUrl,
    store: context.normalized.store,
    domain: context.normalized.domain,
    images: [],
    variants: emptyVariants(),
    confidence: {
      title: 0,
      price: 0,
      images: 0,
      variants: 0,
      overall: 0,
    },
    extraction: {
      method: "fallback",
      storeSpecific: false,
      warnings: [...context.fetchWarnings, ...warnings],
    },
  };
}

export function createBlockedResult(
  context: ExtractorContext,
  reason = blockedPageReason(context.html, context.fetchStatus),
  productIdentity: Pick<PartialProductData, "sku" | "productId" | "brand"> = {},
): ProductExtractResult {
  return {
    ...createEmptyResult(context, [
      `Blocked page detected: ${reason}`,
      "Product extraction skipped because the response is an access-denied or bot-protection page",
    ]),
    blocked: true,
    blockReason: reason,
    ok: false,
    sku: productIdentity.sku,
    productId: productIdentity.productId,
    brand: productIdentity.brand,
    extraction: {
      method: "fallback",
      storeSpecific: context.normalized.store !== "generic",
      warnings: dedupeStrings([
        ...context.fetchWarnings,
        `Blocked page detected: ${reason}`,
        "Product extraction skipped because the response is an access-denied or bot-protection page",
      ]),
      debug: context.options.includeDebug
        ? {
            status: context.fetchStatus,
            finalUrl: context.finalUrl,
          }
        : undefined,
    },
  };
}

export function replaceVariants(
  result: ProductExtractResult,
  variants: Partial<ProductVariants>,
): ProductExtractResult {
  const replaced: ProductExtractResult = {
    ...result,
    variants: {
      colors: dedupeVariantOptions(variants.colors ?? []),
      sizes: dedupeVariantOptions(variants.sizes ?? []),
      capacities: dedupeVariantOptions(variants.capacities ?? []),
      dimensions: dedupeVariantOptions(variants.dimensions ?? []),
      styles: dedupeVariantOptions(variants.styles ?? []),
      raw: variants.raw ?? result.variants.raw,
    },
  };
  replaced.confidence = calculateConfidence(replaced);
  return replaced;
}

export function replaceImages(
  result: ProductExtractResult,
  images: unknown[],
): ProductExtractResult {
  const replaced: ProductExtractResult = {
    ...result,
    images: dedupeImages(images, result.normalizedUrl),
  };
  replaced.confidence = calculateConfidence(replaced);
  return replaced;
}

export function mergeProductResults(
  base: ProductExtractResult,
  overlay: PartialProductData,
): ProductExtractResult {
  const variants = overlay.variants ?? {};
  const merged: ProductExtractResult = {
    ...base,
    title: cleanText(base.title) ?? cleanText(overlay.title),
    brand: cleanText(base.brand) ?? cleanText(overlay.brand),
    description: cleanText(base.description) ?? cleanText(overlay.description),
    price: base.price ?? overlay.price,
    currency: base.currency ?? overlay.currency,
    availability: base.availability ?? overlay.availability,
    selectedColor: base.selectedColor ?? overlay.selectedColor,
    selectedSize: base.selectedSize ?? overlay.selectedSize,
    sku: base.sku ?? overlay.sku,
    model: base.model ?? overlay.model,
    productId: base.productId ?? overlay.productId,
    category: base.category ?? overlay.category,
    images: dedupeImages([...base.images, ...(overlay.images ?? [])], base.normalizedUrl),
    variants: {
      colors: dedupeVariantOptions([
        ...base.variants.colors,
        ...(variants.colors ?? []),
      ]),
      sizes: dedupeVariantOptions([...base.variants.sizes, ...(variants.sizes ?? [])]),
      capacities: dedupeVariantOptions([
        ...(base.variants.capacities ?? []),
        ...(variants.capacities ?? []),
      ]),
      dimensions: dedupeVariantOptions([
        ...(base.variants.dimensions ?? []),
        ...(variants.dimensions ?? []),
      ]),
      styles: dedupeVariantOptions([
        ...(base.variants.styles ?? []),
        ...(variants.styles ?? []),
      ]),
      raw: base.variants.raw ?? variants.raw,
    },
    extraction: {
      ...base.extraction,
      method: overlay.extraction?.method ?? base.extraction.method,
      storeSpecific:
        overlay.extraction?.storeSpecific ?? base.extraction.storeSpecific,
      warnings: dedupeStrings([
        ...base.extraction.warnings,
        ...(overlay.extraction?.warnings ?? []),
      ]),
      debug: base.extraction.debug ?? overlay.extraction?.debug,
    },
  };
  merged.confidence = calculateConfidence(merged);
  merged.ok = Boolean(merged.title || merged.price || merged.images.length > 0);
  return merged;
}

export function calculateConfidence(result: ProductExtractResult): ProductConfidence {
  const title = result.title ? 1 : 0;
  const price = result.price ? (result.currency ? 1 : 0.75) : 0;
  const images =
    result.images.length >= 3 ? 1 : result.images.length > 0 ? 0.65 : 0;
  const variantCount =
    result.variants.colors.length +
    result.variants.sizes.length +
    (result.variants.capacities?.length ?? 0) +
    (result.variants.dimensions?.length ?? 0) +
    (result.variants.styles?.length ?? 0);
  const variants = variantCount >= 4 ? 1 : variantCount > 0 ? 0.55 : 0;
  const overall = Math.round(((title + price + images + variants) / 4) * 100) / 100;
  return { title, price, images, variants, overall };
}

export function withWarning<T extends ProductExtractResult>(result: T, warning: string): T {
  if (!result.extraction.warnings.includes(warning)) {
    result.extraction.warnings.push(warning);
  }
  return result;
}

export function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function limitDebugData(value: unknown, maxLength = 16_000): unknown {
  const seen = new WeakSet<object>();
  const replacer = (_key: string, current: unknown): unknown => {
    if (typeof current === "object" && current !== null) {
      if (seen.has(current)) return "[Circular]";
      seen.add(current);
    }
    if (typeof current === "string" && current.length > 500) {
      return `${current.slice(0, 500)}…`;
    }
    return current;
  };

  try {
    const json = JSON.stringify(value, replacer);
    if (json.length <= maxLength) return JSON.parse(json) as unknown;
    return {
      truncated: true,
      preview: json.slice(0, maxLength),
    };
  } catch {
    return undefined;
  }
}

export function finalizeResult(result: ProductExtractResult): ProductExtractResult {
  const staleMissingWarnings = new Set([
    "Title not found",
    "Price not found",
    "Currency not found for extracted price",
    "Images not found",
    "Color variants not found",
    "Size variants not found",
  ]);
  const warnings = result.extraction.warnings.filter(
    (warning) => !staleMissingWarnings.has(warning),
  );
  if (!result.blocked) {
    if (!result.title) warnings.push("Title not found");
    if (!result.price) warnings.push("Price not found");
    if (!result.currency && result.price) warnings.push("Currency not found for extracted price");
    if (result.images.length === 0) warnings.push("Images not found");
    if (result.variants.colors.length === 0) warnings.push("Color variants not found");
    if (result.variants.sizes.length === 0) warnings.push("Size variants not found");
  }

  const finalized: ProductExtractResult = {
    ...result,
    images: dedupeImages(result.images, result.normalizedUrl),
    variants: {
      colors: dedupeVariantOptions(result.variants.colors),
      sizes: dedupeVariantOptions(result.variants.sizes),
      capacities: dedupeVariantOptions(result.variants.capacities ?? []),
      dimensions: dedupeVariantOptions(result.variants.dimensions ?? []),
      styles: dedupeVariantOptions(result.variants.styles ?? []),
      raw: result.variants.raw,
    },
    extraction: {
      ...result.extraction,
      warnings: dedupeStrings(warnings),
      debug: result.extraction.debug,
    },
  };
  finalized.confidence = calculateConfidence(finalized);
  finalized.ok = finalized.blocked
    ? false
    : Boolean(finalized.title || finalized.price || finalized.images.length > 0);
  if (!finalized.ok && !finalized.error) {
    finalized.error = finalized.blocked
      ? "Product page is blocked by the remote store"
      : "Unable to extract product data from this URL";
  }
  return finalized;
}

export function getUrlPathCode(url: URL, pattern: RegExp): string | undefined {
  const decodedPath = decodeURIComponent(url.pathname);
  return cleanText(decodedPath.match(pattern)?.[1]);
}

export function extractJsonSnippetValue(html: string, regex: RegExp): string | undefined {
  return cleanText(html.match(regex)?.[1]);
}

export function selectedParam(url: URL, names: string[]): string | undefined {
  for (const name of names) {
    const value = url.searchParams.get(name);
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  for (const [name, value] of url.searchParams.entries()) {
    if (names.some((candidate) => name.toLowerCase().includes(candidate.toLowerCase()))) {
      const cleaned = cleanText(value);
      if (cleaned) return cleaned;
    }
  }
  return undefined;
}

import type { ExtractorContext, PartialProductData, ProductVariantOption } from "./types";
import { cleanText, dedupeImages, dedupeVariantOptions, parseCurrency, parsePrice } from "./utils";

const PLAYWRIGHT_TIMEOUT_MS = 18_000;

export function canUsePlaywright(): boolean {
  return process.env.PRODUCT_EXTRACTOR_ENABLE_PLAYWRIGHT === "true";
}

type BrowserDomPayload = {
  title?: string;
  description?: string;
  priceText?: string;
  images: string[];
  colors: ProductVariantOption[];
  sizes: ProductVariantOption[];
  capacities: ProductVariantOption[];
  dimensions: ProductVariantOption[];
  styles: ProductVariantOption[];
};

function toPartialProductData(payload: BrowserDomPayload, baseUrl: string): PartialProductData {
  return {
    title: cleanText(payload.title),
    description: cleanText(payload.description),
    price: parsePrice(payload.priceText),
    currency: parseCurrency(payload.priceText),
    images: dedupeImages(payload.images, baseUrl),
    variants: {
      colors: dedupeVariantOptions(payload.colors),
      sizes: dedupeVariantOptions(payload.sizes),
      capacities: dedupeVariantOptions(payload.capacities),
      dimensions: dedupeVariantOptions(payload.dimensions),
      styles: dedupeVariantOptions(payload.styles),
    },
    extraction: {
      method: "playwright",
      warnings: [],
    },
  };
}

export async function extractWithPlaywright(
  context: ExtractorContext,
): Promise<PartialProductData> {
  if (!canUsePlaywright() && context.options.usePlaywright !== true) {
    return {
      extraction: {
        method: "playwright",
        warnings: ["Playwright disabled; running in HTML-only mode"],
      },
    };
  }

  let browser: Awaited<ReturnType<typeof import("playwright").chromium.launch>> | undefined;

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      timeout: PLAYWRIGHT_TIMEOUT_MS,
    });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1365, height: 900 },
    });

    await page.goto(context.normalized.normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: PLAYWRIGHT_TIMEOUT_MS,
    });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);

    const payload = await page.evaluate<BrowserDomPayload>(() => {
      const text = (value: string | null | undefined) =>
        value?.replace(/\s+/g, " ").trim() || undefined;
      const attr = (element: Element | null, name: string) =>
        element ? text(element.getAttribute(name)) : undefined;
      const visibleText = (element: Element | null) =>
        element ? text(element.textContent) : undefined;
      const imageValues = Array.from(
        document.querySelectorAll("img, source, [data-src], [data-image]"),
      )
        .flatMap((element) => [
          attr(element, "src"),
          attr(element, "srcset")?.split(",").at(-1)?.trim().split(/\s+/)[0],
          attr(element, "data-src"),
          attr(element, "data-image"),
        ])
        .filter((value): value is string => Boolean(value));

      const options = {
        colors: [] as ProductVariantOption[],
        sizes: [] as ProductVariantOption[],
        capacities: [] as ProductVariantOption[],
        dimensions: [] as ProductVariantOption[],
        styles: [] as ProductVariantOption[],
      };

      for (const element of Array.from(
        document.querySelectorAll("button, a, option, [role='option'], [aria-label]"),
      )) {
        const label =
          attr(element, "aria-label") ??
          attr(element, "title") ??
          attr(element, "value") ??
          visibleText(element);
        if (!label || label.length > 100) continue;
        const contextText = [
          label,
          attr(element, "data-testid"),
          attr(element, "data-test"),
          attr(element.closest("fieldset") ?? element, "aria-label"),
          visibleText(element.closest("fieldset") ?? element.parentElement ?? element),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const option = {
          label,
          value: attr(element, "value") ?? attr(element, "data-value"),
          available:
            element.getAttribute("disabled") !== null ||
            element.getAttribute("aria-disabled") === "true"
              ? false
              : undefined,
          url: attr(element, "href"),
          image: attr(element.querySelector("img") ?? element, "src"),
        };

        if (/colou?r|swatch|colorway|tono/.test(contextText)) options.colors.push(option);
        else if (/size|talle|talla|tamaño|shoe/.test(contextText)) options.sizes.push(option);
        else if (/capacity|storage|\bgb\b|\btb\b|capacidad/.test(contextText)) {
          options.capacities.push(option);
        } else if (/dimension|width|height|length|ancho|alto|largo/.test(contextText)) {
          options.dimensions.push(option);
        } else if (/style|edition|fit|modelo|estilo/.test(contextText)) {
          options.styles.push(option);
        }
      }

      const priceElement = document.querySelector(
        "[data-testid*='price' i], [data-test*='price' i], [class*='price' i], [id*='price' i], [itemprop='price']",
      );

      return {
        title:
          visibleText(document.querySelector("h1") ?? document.querySelector("[itemprop='name']")) ??
          document.title,
        description:
          attr(document.querySelector("meta[name='description']") ?? document.body, "content") ??
          visibleText(document.querySelector("[itemprop='description']")),
        priceText: visibleText(priceElement ?? document.body)?.match(
          /(?:US\$|\$|USD\s*)\s*\d[\d,]*(?:\.\d{2})?/,
        )?.[0],
        images: imageValues,
        ...options,
      };
    });

    return {
      ...toPartialProductData(payload, page.url()),
      extraction: {
        method: "playwright",
        warnings: [],
      },
    };
  } catch (error) {
    return {
      extraction: {
        method: "playwright",
        warnings: [
          `Playwright unavailable or failed in this runtime: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        ],
      },
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

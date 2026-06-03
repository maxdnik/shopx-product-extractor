import { describe, expect, it } from "vitest";
import { normalizeProductUrl } from "../normalize-url";
import { extractGenericProduct } from "../extractors/generic";
import type { ExtractorContext } from "../types";

function context(html: string): ExtractorContext {
  const normalized = normalizeProductUrl("https://example.com/products/widget?utm_source=test");
  return {
    normalized,
    html,
    fetchWarnings: [],
    options: { includeDebug: true },
  };
}

describe("extractGenericProduct", () => {
  it("extracts product data from layered metadata and DOM", async () => {
    const result = await extractGenericProduct(
      context(`
        <html>
          <head>
            <meta property="og:title" content="Fallback Widget" />
            <script type="application/ld+json">
              {
                "@type":"Product",
                "name":"Structured Widget",
                "description":"A useful widget",
                "image":["/widget-a.jpg"],
                "offers":{"price":"149.50","priceCurrency":"USD"}
              }
            </script>
          </head>
          <body>
            <h1>Visible Widget</h1>
            <img src="/widget-b.jpg" />
            <fieldset aria-label="Color">
              <button aria-label="Blue">Blue</button>
            </fieldset>
            <fieldset aria-label="Size">
              <button aria-label="M">M</button>
            </fieldset>
          </body>
        </html>
      `),
    );

    expect(result.ok).toBe(true);
    expect(result.title).toBe("Structured Widget");
    expect(result.price).toBe(149.5);
    expect(result.currency).toBe("USD");
    expect(result.images.length).toBeGreaterThanOrEqual(1);
    expect(result.variants.colors.map((option) => option.label)).toContain("Blue");
    expect(result.variants.sizes.map((option) => option.label)).toContain("M");
  });
});

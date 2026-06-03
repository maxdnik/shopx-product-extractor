import { describe, expect, it } from "vitest";
import { extractProduct } from "../index";

describe("extractProduct orchestrator", () => {
  it("returns invalid URL errors without throwing", async () => {
    const result = await extractProduct("not-a-url", { fetchHtml: false });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid URL");
  });

  it("selects the Nike extractor and preserves URL product code", async () => {
    const result = await extractProduct(
      "https://www.nike.com/us/es/t/example-product/HQ2592-106?utm_source=x",
      {
        fetchHtml: false,
        html: `
          <html>
            <head><meta property="og:title" content="Nike Test Product" /></head>
            <body>
              <h1>Nike Test Product</h1>
              <img src="https://static.nike.com/test.jpg" />
              <button aria-label="Size M">M</button>
              <a aria-label="Black color" href="/us/es/t/example-product/HQ2592-001">Black</a>
            </body>
          </html>
        `,
      },
    );

    expect(result.store).toBe("nike");
    expect(result.sku).toBe("HQ2592-106");
    expect(result.extraction.storeSpecific).toBe(true);
  });
});

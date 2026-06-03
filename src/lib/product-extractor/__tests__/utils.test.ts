import { describe, expect, it } from "vitest";
import {
  cleanText,
  dedupeImages,
  dedupeVariantOptions,
  extractJsonLdProducts,
  extractOpenGraph,
  isBlockedPage,
  loadHtml,
  parseCurrency,
  parsePrice,
} from "../utils";

describe("product extractor utils", () => {
  it("cleans whitespace", () => {
    expect(cleanText("  Hello\u00a0  world\n ")).toBe("Hello world");
    expect(cleanText("   ")).toBeUndefined();
  });

  it("parses prices and currencies without defaulting blindly", () => {
    expect(parsePrice("$129.99")).toBe(129.99);
    expect(parsePrice("US$ 1,299.00")).toBe(1299);
    expect(parseCurrency("$129.99")).toBe("USD");
    expect(parseCurrency("129.99")).toBeUndefined();
  });

  it("deduplicates image URLs", () => {
    expect(
      dedupeImages(["/a.jpg?w=100", "https://shop.test/a.jpg?w=200", "/b.jpg"], "https://shop.test/p"),
    ).toEqual([
      "https://shop.test/a.jpg?w=100",
      "https://shop.test/b.jpg",
    ]);
  });

  it("deduplicates variant options", () => {
    expect(
      dedupeVariantOptions([
        { label: "Blue", value: "blue" },
        { label: " Blue ", value: "blue" },
        { label: "Size Guide" },
        { label: "Product Details" },
        { label: "Red" },
      ]),
    ).toHaveLength(2);
  });

  it("detects blocked access-denied pages", () => {
    expect(
      isBlockedPage(
        "<html><title>adidas</title><body>Unfortunately we are unable to give you access to our site at this time.</body></html>",
        403,
      ),
    ).toBe(true);
  });

  it("extracts JSON-LD Product metadata", () => {
    const $ = loadHtml(`
      <script type="application/ld+json">
      {
        "@context":"https://schema.org",
        "@type":"Product",
        "name":"Test Shoe",
        "brand":{"@type":"Brand","name":"Acme"},
        "sku":"SKU-1",
        "image":["/shoe.jpg"],
        "offers":{"@type":"Offer","price":"99.95","priceCurrency":"USD","availability":"https://schema.org/InStock"}
      }
      </script>
    `);

    const [product] = extractJsonLdProducts($, "https://shop.test/product");
    expect(product.title).toBe("Test Shoe");
    expect(product.brand).toBe("Acme");
    expect(product.price).toBe(99.95);
    expect(product.currency).toBe("USD");
    expect(product.images).toEqual(["https://shop.test/shoe.jpg"]);
  });

  it("extracts OpenGraph metadata", () => {
    const $ = loadHtml(`
      <meta property="og:title" content="OG Product" />
      <meta property="og:image" content="/og.jpg" />
      <meta property="product:price:amount" content="49.00" />
      <meta property="product:price:currency" content="USD" />
    `);

    const product = extractOpenGraph($, "https://shop.test/p");
    expect(product.title).toBe("OG Product");
    expect(product.price).toBe(49);
    expect(product.currency).toBe("USD");
    expect(product.images).toEqual(["https://shop.test/og.jpg"]);
  });
});

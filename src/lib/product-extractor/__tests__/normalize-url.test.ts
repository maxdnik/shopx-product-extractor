import { describe, expect, it } from "vitest";
import { detectStore, normalizeProductUrl } from "../normalize-url";

describe("normalizeProductUrl", () => {
  it("removes tracking params and preserves product params", () => {
    const normalized = normalizeProductUrl(
      "https://www.gap.com/browse/product.do?pid=891438012&vid=1&utm_source=x&fbclid=y#pdp-page-content",
    );

    expect(normalized.domain).toBe("gap.com");
    expect(normalized.store).toBe("gap");
    expect(normalized.normalizedUrl).toContain("pid=891438012");
    expect(normalized.normalizedUrl).toContain("vid=1");
    expect(normalized.normalizedUrl).not.toContain("utm_source");
    expect(normalized.normalizedUrl).not.toContain("fbclid");
    expect(normalized.normalizedUrl).not.toContain("#");
  });

  it("removes Amazon search noise but keeps psc", () => {
    const normalized = normalizeProductUrl(
      "https://www.amazon.com/LEGO-Star-Wars/dp/B0FMZD93DV/ref=sr_1_2?keywords=lego&qid=1&psc=1",
    );

    expect(normalized.store).toBe("amazon");
    expect(normalized.normalizedUrl).toContain("/dp/B0FMZD93DV");
    expect(normalized.normalizedUrl).toContain("psc=1");
    expect(normalized.normalizedUrl).not.toContain("keywords");
    expect(normalized.normalizedUrl).not.toContain("qid");
  });
});

describe("detectStore", () => {
  it.each([
    ["nike.com", "nike"],
    ["www.amazon.com", "amazon"],
    ["www.thenorthface.com", "thenorthface"],
    ["gap.com", "gap"],
    ["gucci.com", "gucci"],
    ["adidas.com", "adidas"],
    ["patagonia.com", "generic"],
  ])("detects %s as %s", (domain, store) => {
    expect(detectStore(domain)).toBe(store);
  });
});

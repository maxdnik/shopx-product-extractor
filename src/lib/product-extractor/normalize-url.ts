import type { NormalizedProductUrl, StoreId } from "./types";

const TRACKING_PARAM_PREFIXES = ["utm_"];

const GLOBAL_TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "spm",
  "campaign",
  "adgroup",
  "creative",
  "keyword",
  "matchtype",
  "device",
  "placement",
]);

const AMAZON_NOISE_PARAMS = new Set([
  "crid",
  "dib",
  "dib_tag",
  "keywords",
  "qid",
  "sprefix",
  "sr",
  "sp_csd",
  "ref",
  "ref_",
  "pd_rd_w",
  "pd_rd_wg",
  "pd_rd_r",
  "pd_rd_i",
  "pd_rd_plhdr",
  "content-id",
  "pf_rd_p",
  "pf_rd_r",
  "hsa_cr_id",
  "aaxitk",
  "_encoding",
]);

const PRODUCT_PARAM_NAMES = new Set([
  "pid",
  "vid",
  "cid",
  "pcid",
  "color",
  "colour",
  "size",
  "sku",
  "style",
  "model",
  "masterid",
  "userselectedcolor",
  "psc",
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    GLOBAL_TRACKING_PARAMS.has(lower) ||
    TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))
  );
}

function isVariantParam(name: string): boolean {
  const lower = name.toLowerCase();
  return PRODUCT_PARAM_NAMES.has(lower) || lower.startsWith("dwvar_");
}

export function detectStore(domain: string): StoreId {
  const host = domain.toLowerCase().replace(/^www\./, "");

  if (host === "nike.com" || host.endsWith(".nike.com")) return "nike";
  if (host === "amazon.com" || host.endsWith(".amazon.com")) return "amazon";
  if (host === "thenorthface.com" || host.endsWith(".thenorthface.com")) {
    return "thenorthface";
  }
  if (host === "ralphlauren.com" || host.endsWith(".ralphlauren.com")) {
    return "ralphlauren";
  }
  if (host === "calvinklein.us" || host.endsWith(".calvinklein.us")) {
    return "calvinklein";
  }
  if (host === "gap.com" || host.endsWith(".gap.com")) return "gap";
  if (host === "gucci.com" || host.endsWith(".gucci.com")) return "gucci";
  if (host === "adidas.com" || host.endsWith(".adidas.com")) return "adidas";

  return "generic";
}

export function stripTrackingParams(inputUrl: URL): {
  url: URL;
  removedParams: string[];
  preservedParams: string[];
} {
  const url = new URL(inputUrl.toString());
  const store = detectStore(url.hostname);
  const removedParams: string[] = [];
  const preservedParams: string[] = [];

  for (const [name] of Array.from(url.searchParams.entries())) {
    const lower = name.toLowerCase();
    const shouldPreserve = isVariantParam(name);
    const shouldRemove =
      isTrackingParam(name) || (store === "amazon" && AMAZON_NOISE_PARAMS.has(lower));

    if (shouldPreserve) {
      preservedParams.push(name);
      continue;
    }

    if (shouldRemove) {
      url.searchParams.delete(name);
      removedParams.push(name);
      continue;
    }

    if (store === "amazon") {
      url.searchParams.delete(name);
      removedParams.push(name);
    } else {
      preservedParams.push(name);
    }
  }

  url.hash = "";
  return { url, removedParams, preservedParams };
}

export function normalizeProductUrl(input: string): NormalizedProductUrl {
  const sourceUrl = input.trim();
  if (!sourceUrl) {
    throw new Error("URL is required");
  }

  const parsed = new URL(sourceUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https product URLs are supported");
  }

  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  }

  const { url, removedParams, preservedParams } = stripTrackingParams(parsed);
  const domain = url.hostname.toLowerCase().replace(/^www\./, "");

  return {
    sourceUrl,
    normalizedUrl: url.toString(),
    domain,
    store: detectStore(domain),
    url,
    removedParams,
    preservedParams,
  };
}

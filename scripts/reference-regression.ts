import { extractProduct } from "../src/lib/product-extractor";
import type { ProductExtractResult } from "../src/lib/product-extractor/types";

type ReferenceCase = {
  name: string;
  url: string;
  store: string;
  mode: "product" | "blocked" | "product-or-diagnostic";
  titleIncludes?: string;
  brandIncludes?: string;
  price?: {
    min: number;
    max: number;
  };
  expectedPrice?: {
    value: number;
    tolerance: number;
  };
  minImages?: number;
  minColors?: number;
  minSizes?: number;
  expectedBlockedBrand?: string;
};

const FORBIDDEN_VARIANT_PATTERNS = [
  /\bBasketball\b/i,
  /\bRunning\b/i,
  /\bAll Shoes\b/i,
  /\bFather'?s Day Shoes\b/i,
  /\bShop by Color\b/i,
  /\bDark Neutrals\b/i,
  /\bCrimson\b/i,
  /\bHelp\b/i,
  /\bDetails\b/i,
  /\bMen'?s\b/i,
  /\bWomen'?s\b/i,
  /\bExtra \d+% off\b/i,
  /\bSize Guide\b/i,
  /\bProduct Details\b/i,
  /\bProduct detailsSize\b/i,
  /\bFabric & care\b/i,
  /\bShipping & returns\b/i,
  /\bZappos\b/i,
  /\bShop\b/i,
  /\bSale\b/i,
  /\bNew Arrivals\b/i,
  /\bClothing\b/i,
  /\bShoes\b/i,
  /\bAccessories\b/i,
  /^Guide$/i,
  /^on$/i,
];

const ACCESS_DENIED_TITLE = /unable to give you access|access denied|request blocked|robot check|captcha/i;

const references: ReferenceCase[] = [
  {
    name: "nike-pegasus",
    store: "nike",
    mode: "product",
    url: "https://www.nike.com/us/es/t/tenis-de-correr-en-pavimento-pegasus-premium-kWXqW9yR/HQ2592-106",
    titleIncludes: "Pegasus",
    brandIncludes: "Nike",
    price: { min: 50, max: 500 },
    minImages: 4,
    minColors: 2,
    minSizes: 4,
  },
  {
    name: "nike-phoenix",
    store: "nike",
    mode: "product",
    url: "https://www.nike.com/us/es/t/sudadera-oversized-de-cuello-redondo-sportswear-phoenix-fleece-6N8Z9QMG/IO0417-663",
    titleIncludes: "Phoenix",
    brandIncludes: "Nike",
    price: { min: 20, max: 200 },
    minImages: 4,
    minColors: 1,
    minSizes: 3,
  },
  {
    name: "amazon-lego",
    store: "amazon",
    mode: "product",
    url: "https://www.amazon.com/LEGO-Star-Wars-Mandalorian-construcci%C3%B3n/dp/B0FMZD93DV/ref=sr_1_2_sspa?crid=2K8O2OH4Z9VUR&dib=eyJ2IjoiMSJ9.Ig-mFp-Argeo9ObuJo4gHB94GSbM2Z5P8D6YAuYuuQPC6dvSQUaqmDKckBLHctscE9sJzZcYTyPYlU-Z3ZeHw5cAfkdpPujnXT8SgPB5RaLQ0g5BD5DPQ5aSZ3jyNVT2iaFnxnGOz9MbjiZmW8CSytQMjAkZp7Unk5dg3K1AlsncZMMGZ4vEKE4oTQEDq6A_85Foo8JqZs2-7peLTESK9MqC6gjkg9paNn51gwxZqFobqk_ZaXQnCrjQ4-kJYiHUC1lfCCzQ3AZFejkdY5uICHfzIwmGF6knMkKXonQHDK4.LI_9KUVEEixVKMpP20daXkVekwFjrm8yNz0b3jeceIc&dib_tag=se&keywords=lego+star+wars&qid=1780508463&sprefix=lego%2Caps%2C522&sr=8-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1",
    titleIncludes: "LEGO",
    brandIncludes: "Star Wars",
    price: { min: 20, max: 500 },
    expectedPrice: { value: 149.99, tolerance: 0.75 },
    minImages: 4,
    minColors: 0,
    minSizes: 0,
  },
  {
    name: "amazon-airpods",
    store: "amazon",
    mode: "product",
    url: "https://www.amazon.com/gp/aw/d/B0DGHMNQ5Z/?_encoding=UTF8&pd_rd_plhdr=t&aaxitk=9002a2e3a3b5f0fff554e7cc59bc23b2&hsa_cr_id=0&qid=1780508478&sr=1-2-9e67e56a-6f64-441f-a281-df67fc737124&ref_=sbx_s_sparkle_sbtcd_asin_0_img&pd_rd_w=acENw&content-id=amzn1.sym.2fb72bc8-96ef-420d-b08f-c04b69f36507%3Aamzn1.sym.2fb72bc8-96ef-420d-b08f-c04b69f36507&pf_rd_p=2fb72bc8-96ef-420d-b08f-c04b69f36507&pf_rd_r=056VG9D4PZ297DQV0G1D&pd_rd_wg=W39y7&pd_rd_r=89286264-3c51-4738-8d87-10e9bc9073b3",
    titleIncludes: "AirPods",
    brandIncludes: "Apple",
    price: { min: 20, max: 300 },
    expectedPrice: { value: 99, tolerance: 0.75 },
    minImages: 4,
    minColors: 0,
    minSizes: 0,
  },
  {
    name: "tnf-nuptse",
    store: "thenorthface",
    mode: "product-or-diagnostic",
    expectedBlockedBrand: "The North Face",
    url: "https://www.thenorthface.com/en-us/p/mens/mens-jackets-and-vests/mens-insulated-and-down-300771/mens-1996-retro-nuptse-jacket-NF0A3C8D?color=JY7&fitType=Standard",
    titleIncludes: "Nuptse",
    brandIncludes: "The North Face",
    price: { min: 50, max: 1000 },
    minImages: 2,
    minColors: 1,
    minSizes: 1,
  },
  {
    name: "tnf-jaida",
    store: "thenorthface",
    mode: "product-or-diagnostic",
    expectedBlockedBrand: "The North Face",
    url: "https://www.thenorthface.com/en-us/p/womens/womens-tops/womens-active-tops-224263/womens-jaida-full-zip-hooded-jacket-NF0A8G8K?color=FM2",
    titleIncludes: "Jaida",
    brandIncludes: "The North Face",
    price: { min: 20, max: 500 },
    minImages: 2,
    minColors: 1,
    minSizes: 1,
  },
  {
    name: "gap-tshirt",
    store: "gap",
    mode: "product",
    url: "https://www.gap.com/browse/product.do?pid=891438012&vid=1&pcid=5225&cid=5225&nav=meganav%3AMen%3ACategories%3AT-Shirts#pdp-page-content",
    titleIncludes: "T-Shirt",
    price: { min: 5, max: 100 },
    minImages: 4,
    minColors: 2,
    minSizes: 3,
  },
  {
    name: "gap-jeans",
    store: "gap",
    mode: "product",
    url: "https://www.gap.com/browse/product.do?pid=896592002&vid=1&pcid=5664&cid=5664&nav=meganav%3AWomen%3ACategories%3AJeans",
    titleIncludes: "Jeans",
    price: { min: 20, max: 200 },
    minImages: 4,
    minColors: 2,
    minSizes: 3,
  },
  {
    name: "gucci-loafer",
    store: "gucci",
    mode: "product-or-diagnostic",
    url: "https://www.gucci.com/us/en/pr/men/shoes-for-men/loafers-moccasins-for-men/mens-gucci-como-loafer-p-874936AAGSM2047",
    titleIncludes: "loafer",
    brandIncludes: "Gucci",
    price: { min: 200, max: 5000 },
    minImages: 2,
    minColors: 0,
    minSizes: 1,
  },
  {
    name: "adidas-samba",
    store: "adidas",
    mode: "blocked",
    expectedBlockedBrand: "adidas",
    url: "https://www.adidas.com/us/samba-og-shoes/B75806.html",
  },
  {
    name: "adidas-pants",
    store: "adidas",
    mode: "blocked",
    expectedBlockedBrand: "adidas",
    url: "https://www.adidas.com/us/adidas-originals-summer-glow-denim-firebird-track-pants/KX1195.html",
  },
  {
    name: "adidas-top",
    store: "adidas",
    mode: "blocked",
    expectedBlockedBrand: "adidas",
    url: "https://www.adidas.com/us/adidas-originals-summer-glow-knitted-firebird-track-top/KY2031.html",
  },
  {
    name: "hoka-skyward",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.hoka.com/en/us/womens-everyday-running-gear/skyward-x-2/1171926.html?dwvar_1171926_color=BSSM",
    titleIncludes: "Skyward",
    minImages: 1,
  },
  {
    name: "hoka-airolite",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.hoka.com/en/us/mens-tops/airolite-long-sleeve-2.0/1175772.html",
    titleIncludes: "Airolite",
    minImages: 1,
  },
  {
    name: "vans-tee",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.vans.com/en-us/p/mens/clothing/shirts-5810/beer-skull-ss-tee-VN000XBDWHT",
    titleIncludes: "Beer Skull",
    minImages: 1,
  },
  {
    name: "vans-oldskool",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.vans.com/en-us/p/otw-90083/lx-old-skool-36-mgs-VN000ZAZHAB",
    titleIncludes: "Old Skool",
    minImages: 1,
  },
  {
    name: "ralph-polo",
    store: "ralphlauren",
    mode: "product-or-diagnostic",
    expectedBlockedBrand: "Ralph Lauren",
    url: "https://www.ralphlauren.com/men-clothing-polo-shirts/soft-cotton-polo-shirt---all-fits/401482-P.html?masterId=401482&userSelectedColor=Refined%20Navy",
    titleIncludes: "Polo",
    brandIncludes: "Ralph",
    minImages: 1,
    minColors: 1,
    minSizes: 1,
  },
  {
    name: "ralph-linen",
    store: "ralphlauren",
    mode: "product-or-diagnostic",
    expectedBlockedBrand: "Ralph Lauren",
    url: "https://www.ralphlauren.com/women-clothing-shirts-blouses/classic-fit-linen-shirt/100044088.html?dwvar100044088_colorname=Classic%20Oxford%20White&cgid=women-clothing-shirts-blouses#ab=NA_WLP_Slot_2_S2_Image_SHOP&start=1&cgid=women-clothing-shirts-blouses",
    titleIncludes: "Linen",
    brandIncludes: "Ralph",
    minImages: 1,
    minColors: 1,
    minSizes: 1,
  },
  {
    name: "levis-501",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.levi.com/US/en_US/clothing/men/1980s-501-original-fit-mens-jeans/p/A58750016",
    titleIncludes: "501",
    brandIncludes: "Levi",
    minImages: 1,
  },
  {
    name: "levis-tank",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.levi.com/US/en_US/clothing/women/shirts/garment-dye-essential-racer-tank-top/p/A33810032",
    titleIncludes: "Tank",
    brandIncludes: "Levi",
    minImages: 1,
  },
  {
    name: "ck-boxer",
    store: "calvinklein",
    mode: "product-or-diagnostic",
    expectedBlockedBrand: "Calvin Klein",
    url: "https://www.calvinklein.us/en/underwear/men/mens-boxers/cotton-classics-3-pack-knit-boxer/NB4005-001.html?journey=Folder_0000101",
    titleIncludes: "Boxer",
    brandIncludes: "Calvin",
    minImages: 1,
    minColors: 1,
    minSizes: 1,
  },
  {
    name: "ck-jacket",
    store: "calvinklein",
    mode: "product-or-diagnostic",
    expectedBlockedBrand: "Calvin Klein",
    url: "https://www.calvinklein.us/en/women/apparel/womens-outerwear/quilted-liner-jacket/44G506G-PAS.html?journey=Tier_0000002",
    titleIncludes: "Jacket",
    brandIncludes: "Calvin",
    minImages: 1,
    minColors: 1,
    minSizes: 1,
  },
  {
    name: "backcountry-board",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.backcountry.com/rome-warden-snowboard-2026",
    titleIncludes: "Snowboard",
    minImages: 1,
  },
  {
    name: "backcountry-top",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.backcountry.com/fp-movement-high-plank-ots-layer-top-womens",
    titleIncludes: "Top",
    minImages: 1,
  },
  {
    name: "patagonia-rain",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.patagonia.com/es/product/mens-outdoor-everyday-rain-jacket/20850.html?dwvar_20850_color=WSTO",
    titleIncludes: "Rain",
    brandIncludes: "Patagonia",
    minImages: 1,
  },
  {
    name: "patagonia-shirt",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.patagonia.com/es/product/mens-long-sleeved-capilene-cool-daily-shirt/45181.html?dwvar_45181_color=BSLX",
    titleIncludes: "Capilene",
    brandIncludes: "Patagonia",
    minImages: 1,
  },
  {
    name: "bh-sony",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.bhphotovideo.com/c/product/1970580-REG/sony_ilce7rm6b_a7r_vi_mirrorless_camera.html",
    titleIncludes: "Sony",
    brandIncludes: "Sony",
    minImages: 1,
  },
  {
    name: "bh-bag",
    store: "generic",
    mode: "product-or-diagnostic",
    url: "https://www.bhphotovideo.com/c/product/1085206-REG/arco_cs_d20b_video_dr_bag_20.html",
    titleIncludes: "Bag",
    minImages: 1,
  },
];

const PLAYWRIGHT_REQUIRED_STORES = new Set([
  "amazon",
  "thenorthface",
  "ralphlauren",
  "calvinklein",
]);

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function allVariantLabels(result: ProductExtractResult): string[] {
  return [
    ...result.variants.colors,
    ...result.variants.sizes,
    ...(result.variants.capacities ?? []),
    ...(result.variants.dimensions ?? []),
    ...(result.variants.styles ?? []),
  ].map((option) => option.label);
}

function assertNoForbiddenVariants(reference: ReferenceCase, result: ProductExtractResult) {
  for (const label of allVariantLabels(result)) {
    for (const pattern of FORBIDDEN_VARIANT_PATTERNS) {
      assert(
        !pattern.test(label),
        `${reference.name}: forbidden variant label returned: "${label}" matched ${pattern}`,
      );
    }
  }
}

function assertNoBlockedTitle(reference: ReferenceCase, result: ProductExtractResult) {
  if (result.title) {
    assert(
      !ACCESS_DENIED_TITLE.test(result.title),
      `${reference.name}: blocked/access-denied page title was returned as product title: "${result.title}"`,
    );
  }
}

function assertDiagnostic(reference: ReferenceCase, result: ProductExtractResult) {
  assert(result.store === reference.store, `${reference.name}: expected store ${reference.store}, got ${result.store}`);
  assert(!result.ok, `${reference.name}: diagnostic cases must not return ok=true`);
  assertNoBlockedTitle(reference, result);
  assertNoForbiddenVariants(reference, result);
  assert(
    result.blocked || Boolean(result.error) || result.extraction.warnings.length > 0,
    `${reference.name}: diagnostic output must include blocked/error/warnings`,
  );
  if (result.blocked && reference.expectedBlockedBrand) {
    assert(
      result.brand === reference.expectedBlockedBrand,
      `${reference.name}: expected blocked brand ${reference.expectedBlockedBrand}, got ${result.brand}`,
    );
  }
}

function assertProduct(reference: ReferenceCase, result: ProductExtractResult) {
  assert(result.ok, `${reference.name}: expected ok=true, got ${JSON.stringify(result.error)}`);
  assert(!result.blocked, `${reference.name}: expected product output, got blocked=true`);
  assertNoBlockedTitle(reference, result);
  assertNoForbiddenVariants(reference, result);

  assert(result.store === reference.store, `${reference.name}: expected store ${reference.store}, got ${result.store}`);
  assert(result.title, `${reference.name}: title is missing`);
  if (reference.titleIncludes) {
    assert(
      result.title.toLowerCase().includes(reference.titleIncludes.toLowerCase()),
      `${reference.name}: title "${result.title}" does not include "${reference.titleIncludes}"`,
    );
  }

  if (reference.brandIncludes) {
    assert(result.brand, `${reference.name}: brand is missing`);
    assert(
      result.brand.toLowerCase().includes(reference.brandIncludes.toLowerCase()),
      `${reference.name}: brand "${result.brand}" does not include "${reference.brandIncludes}"`,
    );
  }

  if (reference.price) {
    assert(typeof result.price === "number", `${reference.name}: price is missing`);
    assert(
      result.price >= reference.price.min && result.price <= reference.price.max,
      `${reference.name}: price ${result.price} is outside expected range ${reference.price.min}-${reference.price.max}`,
    );
  }

  if (reference.expectedPrice) {
    assert(typeof result.price === "number", `${reference.name}: price is missing`);
    const delta = Math.abs(result.price - reference.expectedPrice.value);
    assert(
      delta <= reference.expectedPrice.tolerance,
      `${reference.name}: price ${result.price} differs materially from expected PDP price ${reference.expectedPrice.value} (tolerance ${reference.expectedPrice.tolerance})`,
    );
  }

  assert(
    result.images.length >= (reference.minImages ?? 0),
    `${reference.name}: expected at least ${reference.minImages ?? 0} images, got ${result.images.length}`,
  );
  assert(
    result.variants.colors.length >= (reference.minColors ?? 0),
    `${reference.name}: expected at least ${reference.minColors ?? 0} colors, got ${result.variants.colors.length}`,
  );
  assert(
    result.variants.sizes.length >= (reference.minSizes ?? 0),
    `${reference.name}: expected at least ${reference.minSizes ?? 0} sizes, got ${result.variants.sizes.length}`,
  );
}

function assertBlocked(reference: ReferenceCase, result: ProductExtractResult) {
  assert(result.store === reference.store, `${reference.name}: expected store ${reference.store}, got ${result.store}`);
  assert(result.blocked, `${reference.name}: expected blocked=true`);
  assert(!result.ok, `${reference.name}: blocked result must not return ok=true`);
  assert(result.blockReason, `${reference.name}: blockReason is missing`);
  assertNoBlockedTitle(reference, result);
  assertNoForbiddenVariants(reference, result);
  if (reference.expectedBlockedBrand) {
    assert(
      result.brand === reference.expectedBlockedBrand,
      `${reference.name}: expected blocked brand ${reference.expectedBlockedBrand}, got ${result.brand}`,
    );
  }
}

const startedAt = Date.now();
const failures: string[] = [];
const rows: Array<Record<string, unknown>> = [];

for (const reference of references) {
  const result = await extractProduct(reference.url, {
    timeoutMs: Number(process.env.PRODUCT_EXTRACTOR_REGRESSION_TIMEOUT_MS ?? 20_000),
    usePlaywright: PLAYWRIGHT_REQUIRED_STORES.has(reference.store),
  });

  rows.push({
    name: reference.name,
    store: result.store,
    ok: result.ok,
    blocked: Boolean(result.blocked),
    title: result.title ?? null,
    brand: result.brand ?? null,
    price: result.price ?? null,
    images: result.images.length,
    colors: result.variants.colors.map((option) => option.label),
    sizes: result.variants.sizes.map((option) => option.label),
    warnings: result.extraction.warnings.slice(0, 6),
  });

  try {
    if (reference.mode === "blocked") {
      assertBlocked(reference, result);
    } else if (reference.mode === "product") {
      assertProduct(reference, result);
    } else if (result.ok) {
      assertProduct(reference, result);
    } else {
      assertDiagnostic(reference, result);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      elapsedMs: Date.now() - startedAt,
      checked: references.length,
      failures,
      rows,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exitCode = 1;
}

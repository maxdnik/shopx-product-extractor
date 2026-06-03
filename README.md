# ShopX Product Extractor

Servidor Next.js + TypeScript para extraer información normalizada de productos de e-commerce bajo demanda.

## API

`POST /api/extract-product`

Body:

```json
{
  "url": "https://www.adidas.com/us/samba-og-shoes/B75806.html"
}
```

Response: `ProductExtractResult`

```ts
type ProductExtractResult = {
  ok: boolean;
  sourceUrl: string;
  normalizedUrl: string;
  store: string;
  domain: string;
  title?: string;
  brand?: string;
  description?: string;
  price?: number;
  currency?: string;
  availability?: string;
  selectedColor?: string;
  selectedSize?: string;
  sku?: string;
  model?: string;
  productId?: string;
  category?: string;
  images: string[];
  variants: {
    colors: Array<{ label: string; value?: string; available?: boolean; image?: string; url?: string }>;
    sizes: Array<{ label: string; value?: string; available?: boolean }>;
    capacities?: Array<{ label: string; value?: string; available?: boolean }>;
    dimensions?: Array<{ label: string; value?: string; available?: boolean }>;
    styles?: Array<{ label: string; value?: string; available?: boolean }>;
    raw?: unknown;
  };
  confidence: {
    title: number;
    price: number;
    images: number;
    variants: number;
    overall: number;
  };
  extraction: {
    method: "html" | "jsonld" | "embedded-json" | "playwright" | "store-specific" | "fallback";
    storeSpecific: boolean;
    warnings: string[];
    debug?: unknown;
  };
  error?: string;
};
```

## Arquitectura

- Normalización de URL y detección de tienda/dominio.
- Extracción rápida HTML-only:
  - JSON-LD Product.
  - OpenGraph y meta tags.
  - JSON embebido (`__NEXT_DATA__`, state precargado, scripts de producto).
  - Heurísticas DOM para título, precio, imágenes y variantes.
- Extractores específicos:
  - Nike
  - Amazon
  - The North Face
  - Gap
  - Gucci
  - Adidas
- Fallback genérico para otros dominios.
- Playwright opcional y dinámico, desactivado por defecto para no romper builds/runtimes serverless.

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

## Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
```

## Playwright

Por defecto el extractor corre en modo HTML-only, compatible con Vercel.

Para intentar extracción con navegador en un worker/servidor propio:

```bash
PRODUCT_EXTRACTOR_ENABLE_PLAYWRIGHT=true npm run dev
```

Si Playwright o los browsers no están disponibles, la API no falla: devuelve warnings y continúa con HTML-only.

## Curl smoke tests

Usar:

```bash
curl -sS -X POST http://localhost:3000/api/extract-product \
  -H "Content-Type: application/json" \
  -d '{"url":"URL_A_PROBAR"}' | jq
```

### Nike

```bash
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.nike.com/us/es/t/tenis-de-correr-en-pavimento-pegasus-premium-kWXqW9yR/HQ2592-106"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.nike.com/us/es/t/sudadera-oversized-de-cuello-redondo-sportswear-phoenix-fleece-6N8Z9QMG/IO0417-663"}' | jq
```

Mínimo esperado: `store: "nike"`, `sku/productId` desde la URL, título/imágenes si están expuestos, intento de `variants.colors` y `variants.sizes`, warnings claros si renderizan solo client-side.

### Amazon

```bash
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.amazon.com/LEGO-Star-Wars-Mandalorian-construcci%C3%B3n/dp/B0FMZD93DV/ref=sr_1_2_sspa?crid=2K8O2OH4Z9VUR&dib=eyJ2IjoiMSJ9.Ig-mFp-Argeo9ObuJo4gHB94GSbM2Z5P8D6YAuYuuQPC6dvSQUaqmDKckBLHctscE9sJzZcYTyPYlU-Z3ZeHw5cAfkdpPujnXT8SgPB5RaLQ0g5BD5DPQ5aSZ3jyNVT2iaFnxnGOz9MbjiZmW8CSytQMjAkZp7Unk5dg3K1AlsncZMMGZ4vEKE4oTQEDq6A_85Foo8JqZs2-7peLTESK9MqC6gjkg9paNn51gwxZqFobqk_ZaXQnCrjQ4-kJYiHUC1lfCCzQ3AZFejkdY5uICHfzIwmGF6knMkKXonQHDK4.LI_9KUVEEixVKMpP20daXkVekwFjrm8yNz0b3jeceIc&dib_tag=se&keywords=lego+star+wars&qid=1780508463&sprefix=lego%2Caps%2C522&sr=8-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.amazon.com/gp/aw/d/B0DGHMNQ5Z/?_encoding=UTF8&pd_rd_plhdr=t&aaxitk=9002a2e3a3b5f0fff554e7cc59bc23b2&hsa_cr_id=0&qid=1780508478&sr=1-2-9e67e56a-6f64-441f-a281-df67fc737124&ref_=sbx_s_sparkle_sbtcd_asin_0_img&pd_rd_w=acENw&content-id=amzn1.sym.2fb72bc8-96ef-420d-b08f-c04b69f36507%3Aamzn1.sym.2fb72bc8-96ef-420d-b08f-c04b69f36507&pf_rd_p=2fb72bc8-96ef-420d-b08f-c04b69f36507&pf_rd_r=056VG9D4PZ297DQV0G1D&pd_rd_wg=W39y7&pd_rd_r=89286264-3c51-4738-8d87-10e9bc9073b3"}' | jq
```

Mínimo esperado: `store: "amazon"`, ASIN en `sku/productId`, título/precio/imágenes si no hay bloqueo, warnings si Amazon devuelve captcha/robot-check.

### The North Face

```bash
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.thenorthface.com/en-us/p/mens/mens-jackets-and-vests/mens-insulated-and-down-300771/mens-1996-retro-nuptse-jacket-NF0A3C8D?utm_source=chatgpt.com"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.thenorthface.com/en-us/p/womens/womens-tops/womens-active-tops-224263/womens-jaida-full-zip-hooded-jacket-NF0A8G8K?color=FM2"}' | jq
```

Mínimo esperado: `store: "thenorthface"`, productId desde URL, precio/imágenes si están expuestos, colores/talles intentados, `selectedColor` desde query cuando exista.

### Gap

```bash
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.gap.com/browse/product.do?pid=891438012&vid=1&pcid=5225&cid=5225&nav=meganav%3AMen%3ACategories%3AT-Shirts#pdp-page-content"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.gap.com/browse/product.do?pid=896592002&vid=1&pcid=5664&cid=5664&nav=meganav%3AWomen%3ACategories%3AJeans"}' | jq
```

Mínimo esperado: `store: "gap"`, `productId` desde `pid`, precio/imágenes si están expuestos, colores/talles intentados.

### Gucci

```bash
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.gucci.com/us/en/pr/men/shoes-for-men/loafers-moccasins-for-men/mens-gucci-como-loafer-p-874936AAGSM2047"}' | jq
```

Mínimo esperado: `store: "gucci"`, productId/SKU desde URL si es parseable, título, precio/imágenes/descripción/talles si están expuestos.

### Adidas

```bash
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.adidas.com/us/samba-og-shoes/B75806.html"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.adidas.com/us/adidas-originals-summer-glow-denim-firebird-track-pants/KX1195.html"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.adidas.com/us/adidas-originals-summer-glow-knitted-firebird-track-top/KY2031.html"}' | jq
```

Mínimo esperado: `store: "adidas"`, productId desde basename `.html`, precio/imágenes si están expuestos, colores/talles intentados.

### Fallback genérico

```bash
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.hoka.com/en/us/womens-everyday-running-gear/skyward-x-2/1171926.html?dwvar_1171926_color=BSSM"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.vans.com/en-us/p/mens/clothing/shirts-5810/beer-skull-ss-tee-VN000XBDWHT"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.ralphlauren.com/men-clothing-polo-shirts/soft-cotton-polo-shirt---all-fits/401482-P.html?masterId=401482&userSelectedColor=Refined%20Navy"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.levi.com/US/en_US/clothing/men/1980s-501-original-fit-mens-jeans/p/A58750016"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.calvinklein.us/en/underwear/men/mens-boxers/cotton-classics-3-pack-knit-boxer/NB4005-001.html?journey=Folder_0000101"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.backcountry.com/rome-warden-snowboard-2026"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.patagonia.com/es/product/mens-outdoor-everyday-rain-jacket/20850.html?dwvar_20850_color=WSTO"}' | jq
curl -sS -X POST http://localhost:3000/api/extract-product -H "Content-Type: application/json" -d '{"url":"https://www.bhphotovideo.com/c/product/1970580-REG/sony_ilce7rm6b_a7r_vi_mirrorless_camera.html"}' | jq
```

Mínimo esperado: dominio correcto, `store: "generic"`, extracción desde JSON-LD/OpenGraph/meta/DOM, warnings para campos no encontrados.

## Notas de scraping legal/defensivo

- Extracción bajo demanda: no crawling masivo.
- No intenta evadir autenticación, paywalls ni controles de acceso.
- Si una tienda bloquea o limita la respuesta, el resultado incluye warnings en vez de inventar datos.
- En producción conviene agregar rate limiting, cache, observabilidad y cumplimiento de términos aplicables por tienda.

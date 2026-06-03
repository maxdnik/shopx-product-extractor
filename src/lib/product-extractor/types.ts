export type ExtractionMethod =
  | "html"
  | "jsonld"
  | "embedded-json"
  | "playwright"
  | "store-specific"
  | "fallback";

export type StoreId =
  | "nike"
  | "amazon"
  | "thenorthface"
  | "gap"
  | "gucci"
  | "adidas"
  | "generic";

export type ProductVariantOption = {
  label: string;
  value?: string;
  available?: boolean;
  image?: string;
  url?: string;
};

export type ProductVariants = {
  colors: ProductVariantOption[];
  sizes: ProductVariantOption[];
  capacities?: ProductVariantOption[];
  dimensions?: ProductVariantOption[];
  styles?: ProductVariantOption[];
  raw?: unknown;
};

export type ProductConfidence = {
  title: number;
  price: number;
  images: number;
  variants: number;
  overall: number;
};

export type ProductExtractionMetadata = {
  method: ExtractionMethod;
  storeSpecific: boolean;
  warnings: string[];
  debug?: unknown;
};

export type ProductExtractResult = {
  ok: boolean;
  blocked?: boolean;
  blockReason?: string;
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
  variants: ProductVariants;
  confidence: ProductConfidence;
  extraction: ProductExtractionMetadata;
  error?: string;
};

export type NormalizedProductUrl = {
  sourceUrl: string;
  normalizedUrl: string;
  domain: string;
  store: StoreId;
  url: URL;
  removedParams: string[];
  preservedParams: string[];
};

export type FetchHtmlResult = {
  ok: boolean;
  url: string;
  finalUrl?: string;
  status?: number;
  statusText?: string;
  html?: string;
  contentType?: string | null;
  error?: string;
  warnings: string[];
};

export type ExtractProductOptions = {
  html?: string;
  fetchHtml?: boolean;
  usePlaywright?: boolean;
  timeoutMs?: number;
  includeDebug?: boolean;
};

export type ExtractorContext = {
  normalized: NormalizedProductUrl;
  html?: string;
  finalUrl?: string;
  fetchStatus?: number;
  fetchWarnings: string[];
  options: Required<Pick<ExtractProductOptions, "includeDebug">> &
    Omit<ExtractProductOptions, "includeDebug">;
};

export type ProductExtractor = (
  context: ExtractorContext,
) => Promise<ProductExtractResult>;

export type EmbeddedJsonCandidate = {
  source: string;
  data: unknown;
};

export type JsonObject = Record<string, unknown>;

export type PartialProductData = Partial<
  Omit<ProductExtractResult, "confidence" | "extraction" | "variants" | "images">
> & {
  images?: string[];
  variants?: Partial<ProductVariants>;
  extraction?: Partial<ProductExtractionMetadata>;
};

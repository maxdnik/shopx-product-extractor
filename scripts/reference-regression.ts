import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractProduct } from "../src/lib/product-extractor";
import type { ProductExtractResult } from "../src/lib/product-extractor/types";

type FieldRule = {
  required?: boolean;
  minLength?: number;
  greaterThan?: number;
  min?: number;
  max?: number;
  expectedValue?: number;
  tolerance?: number;
  allowedValues?: string[];
  mustStartWith?: string;
  minItems?: number;
  includes?: string;
};

type Rules = Record<string, FieldRule> & {
  blockedTitlePatterns?: string[];
  garbageValues?: string[];
  forbiddenVariantPatterns?: string[];
};

type Reference = {
  id: string;
  store: string;
  url: string;
  allowDiagnostic?: boolean;
  expectedBlocked?: boolean;
  expectedBlockedBrand?: string;
  expected: Record<string, FieldRule>;
};

type ReferenceConfig = {
  globalRules: Rules;
  references: Reference[];
};

type Failure = {
  id: string;
  store: string;
  url: string;
  field: string;
  reason: string;
  expected?: unknown;
  actual?: unknown;
};

const config = JSON.parse(
  readFileSync(join(process.cwd(), "scripts/reference-regression/references.json"), "utf8"),
) as ReferenceConfig;

const PLAYWRIGHT_REQUIRED_STORES = new Set([
  "amazon",
  "thenorthface",
  "ralphlauren",
  "calvinklein",
]);

function mergedRule(reference: Reference, field: string): FieldRule {
  const rule = {
    ...(config.globalRules[field] ?? {}),
    ...(reference.expected[field] ?? {}),
  };
  if (reference.expected[field]?.required === false && reference.expected[field]?.minItems === undefined) {
    delete rule.minItems;
  }
  if (reference.expected[field]?.required === false && reference.expected[field]?.minLength === undefined) {
    delete rule.minLength;
  }
  return rule;
}

function variantLabels(result: ProductExtractResult): string[] {
  return [
    ...result.variants.colors,
    ...result.variants.sizes,
    ...(result.variants.capacities ?? []),
    ...(result.variants.dimensions ?? []),
    ...(result.variants.styles ?? []),
  ].map((option) => option.label);
}

function variantCount(result: ProductExtractResult): number {
  return variantLabels(result).length;
}

function fieldValue(result: ProductExtractResult, field: string): unknown {
  switch (field) {
    case "image":
      return result.images[0];
    case "sourceUrl":
      return result.sourceUrl;
    case "colors":
      return result.variants.colors;
    case "sizes":
      return result.variants.sizes;
    case "variants":
      return variantLabels(result);
    default:
      return (result as unknown as Record<string, unknown>)[field];
  }
}

function pushFailure(
  failures: Failure[],
  reference: Reference,
  field: string,
  reason: string,
  expected?: unknown,
  actual?: unknown,
) {
  failures.push({
    id: reference.id,
    store: reference.store,
    url: reference.url,
    field,
    reason,
    expected,
    actual,
  });
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function validateStringField(
  failures: Failure[],
  reference: Reference,
  field: string,
  rule: FieldRule,
  value: unknown,
) {
  if (isEmptyValue(value)) {
    if (rule.required) pushFailure(failures, reference, field, "required_missing", true, value);
    return;
  }

  if (typeof value !== "string") {
    pushFailure(failures, reference, field, "expected_string", "string", typeof value);
    return;
  }

  if (rule.minLength !== undefined && value.trim().length < rule.minLength) {
    pushFailure(failures, reference, field, "min_length_not_met", rule.minLength, value.length);
  }
  if (rule.mustStartWith && !value.startsWith(rule.mustStartWith)) {
    pushFailure(failures, reference, field, "must_start_with_not_met", rule.mustStartWith, value);
  }
  if (rule.includes && !value.toLowerCase().includes(rule.includes.toLowerCase())) {
    pushFailure(failures, reference, field, "expected_substring_missing", rule.includes, value);
  }
  if (rule.allowedValues && !rule.allowedValues.includes(value)) {
    pushFailure(failures, reference, field, "allowed_values_not_met", rule.allowedValues, value);
  }
}

function validateNumberField(
  failures: Failure[],
  reference: Reference,
  field: string,
  rule: FieldRule,
  value: unknown,
) {
  if (isEmptyValue(value)) {
    if (rule.required) pushFailure(failures, reference, field, "required_missing", true, value);
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushFailure(failures, reference, field, "expected_number", "number", value);
    return;
  }
  if (rule.greaterThan !== undefined && value <= rule.greaterThan) {
    pushFailure(failures, reference, field, "greater_than_not_met", rule.greaterThan, value);
  }
  if (rule.min !== undefined && value < rule.min) {
    pushFailure(failures, reference, field, "min_not_met", rule.min, value);
  }
  if (rule.max !== undefined && value > rule.max) {
    pushFailure(failures, reference, field, "max_not_met", rule.max, value);
  }
  if (rule.expectedValue !== undefined) {
    const tolerance = rule.tolerance ?? 0;
    const delta = Math.abs(value - rule.expectedValue);
    if (delta > tolerance) {
      pushFailure(failures, reference, field, "expected_value_not_met", {
        value: rule.expectedValue,
        tolerance,
      }, value);
    }
  }
}

function validateArrayField(
  failures: Failure[],
  reference: Reference,
  field: string,
  rule: FieldRule,
  value: unknown,
) {
  if (!Array.isArray(value)) {
    if (rule.required) pushFailure(failures, reference, field, "required_missing", true, value);
    return;
  }
  if (rule.required && value.length === 0) {
    pushFailure(failures, reference, field, "required_min_items_not_met", rule.minItems ?? 1, 0);
  }
  if (rule.minItems !== undefined && value.length < rule.minItems) {
    pushFailure(failures, reference, field, "required_min_items_not_met", rule.minItems, value.length);
  }
}

function validateBlockedAndGarbage(
  failures: Failure[],
  reference: Reference,
  result: ProductExtractResult,
) {
  const title = result.title ?? "";
  for (const pattern of config.globalRules.blockedTitlePatterns ?? []) {
    if (new RegExp(pattern, "i").test(title)) {
      pushFailure(failures, reference, "title", "blocked_title_pattern", pattern, title);
    }
  }

  const values = [
    result.title,
    result.brand,
    result.description,
    ...variantLabels(result),
  ].filter((value): value is string => typeof value === "string");

  for (const value of values) {
    for (const garbage of config.globalRules.garbageValues ?? []) {
      if (value.trim().toLowerCase() === garbage.toLowerCase()) {
        pushFailure(failures, reference, "value", "garbage_value", garbage, value);
      }
    }
  }

  for (const label of variantLabels(result)) {
    for (const pattern of config.globalRules.forbiddenVariantPatterns ?? []) {
      if (new RegExp(pattern, "i").test(label)) {
        pushFailure(failures, reference, "variants", "forbidden_variant_value", pattern, label);
      }
    }
  }
}

function validateReference(reference: Reference, result: ProductExtractResult): Failure[] {
  const failures: Failure[] = [];

  if (reference.expectedBlocked) {
    if (!result.blocked) {
      pushFailure(failures, reference, "blocked", "expected_blocked_not_met", true, result.blocked);
    }
    if (reference.expectedBlockedBrand && result.brand !== reference.expectedBlockedBrand) {
      pushFailure(failures, reference, "brand", "expected_blocked_brand_not_met", reference.expectedBlockedBrand, result.brand);
    }
    validateBlockedAndGarbage(failures, reference, result);
    return failures;
  }

  if (reference.allowDiagnostic && !result.ok) {
    if (!(result.blocked || result.error || result.extraction.warnings.length > 0)) {
      pushFailure(failures, reference, "diagnostic", "diagnostic_missing_error_or_warning", true, result);
    }
    if (result.blocked && reference.expectedBlockedBrand && result.brand !== reference.expectedBlockedBrand) {
      pushFailure(failures, reference, "brand", "expected_blocked_brand_not_met", reference.expectedBlockedBrand, result.brand);
    }
    validateBlockedAndGarbage(failures, reference, result);
    return failures;
  }

  if (!result.ok) {
    pushFailure(failures, reference, "ok", "product_extraction_not_ok", true, result.error);
  }

  if (result.store !== reference.store) {
    pushFailure(failures, reference, "store", "store_mismatch", reference.store, result.store);
  }

  for (const field of [
    "title",
    "brand",
    "store",
    "price",
    "currency",
    "image",
    "images",
    "description",
    "sourceUrl",
    "availability",
    "colors",
    "sizes",
    "variants",
  ]) {
    const rule = mergedRule(reference, field);
    const value = field === "variants" ? variantLabels(result) : fieldValue(result, field);
    if (field === "price") {
      validateNumberField(failures, reference, field, rule, value);
    } else if (["images", "colors", "sizes", "variants"].includes(field)) {
      validateArrayField(failures, reference, field, rule, value);
    } else {
      validateStringField(failures, reference, field, rule, value);
    }
  }

  if (mergedRule(reference, "variants").required && variantCount(result) === 0) {
    pushFailure(failures, reference, "variants", "required_min_items_not_met", 1, 0);
  }

  validateBlockedAndGarbage(failures, reference, result);
  return failures;
}

const startedAt = Date.now();
const failures: Failure[] = [];
const rows: Array<Record<string, unknown>> = [];

for (const reference of config.references) {
  const result = await extractProduct(reference.url, {
    timeoutMs: Number(process.env.PRODUCT_EXTRACTOR_REGRESSION_TIMEOUT_MS ?? 20_000),
    usePlaywright: PLAYWRIGHT_REQUIRED_STORES.has(reference.store),
  });

  rows.push({
    id: reference.id,
    store: result.store,
    ok: result.ok,
    blocked: Boolean(result.blocked),
    title: result.title ?? null,
    brand: result.brand ?? null,
    price: result.price ?? null,
    currency: result.currency ?? null,
    image: result.images[0] ?? null,
    images: result.images.length,
    colors: result.variants.colors.map((option) => option.label),
    sizes: result.variants.sizes.map((option) => option.label),
    variants: variantCount(result),
    warnings: result.extraction.warnings.slice(0, 6),
  });

  failures.push(...validateReference(reference, result));
}

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      elapsedMs: Date.now() - startedAt,
      checked: config.references.length,
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

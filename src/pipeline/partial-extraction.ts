import type { Evidence } from '../domain/evidence.js';
import type { PartialProductExtractResult, ProductExtractFieldName } from '../domain/product-extract-result.js';

export type PartialExtraction = {
  layer: string;
  fields: PartialProductExtractResult;
  evidence: Evidence[];
  fieldsUpdated: ProductExtractFieldName[];
  warnings: string[];
};

export function emptyPartialExtraction(layer: string): PartialExtraction {
  return {
    layer,
    fields: {},
    evidence: [],
    fieldsUpdated: [],
    warnings: []
  };
}

import type { PartialExtraction } from './partial-extraction.js';

export type ExtractionLayer = {
  name: string;
  run(): Promise<PartialExtraction>;
};

export async function runLayersSequentially(layers: ExtractionLayer[]): Promise<PartialExtraction[]> {
  const results: PartialExtraction[] = [];
  for (const layer of layers) {
    results.push(await layer.run());
  }
  return results;
}

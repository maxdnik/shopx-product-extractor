import type { ExtractionLayerTrace } from '../domain/product-extract-result.js';
import type { PartialExtraction } from './partial-extraction.js';

export async function traceLayer<T extends PartialExtraction>(
  name: string,
  run: () => Promise<T>
): Promise<{ partial: T; trace: ExtractionLayerTrace }> {
  const started = new Date();
  const startMs = performance.now();
  try {
    const partial = await run();
    const finished = new Date();
    return {
      partial,
      trace: {
        name,
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: Math.round(performance.now() - startMs),
        fieldsUpdated: partial.fieldsUpdated
      }
    };
  } catch (error) {
    const finished = new Date();
    return {
      partial: {
        layer: name,
        fields: {},
        evidence: [],
        fieldsUpdated: [],
        warnings: [error instanceof Error ? error.message : String(error)]
      } as unknown as T,
      trace: {
        name,
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: Math.round(performance.now() - startMs),
        fieldsUpdated: [],
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export type AiExtractionRequest = {
  url: string;
  missingFields: string[];
  prompt: string;
};

export type AiClient = {
  extractProduct(request: AiExtractionRequest): Promise<unknown>;
};

export class DisabledAiClient implements AiClient {
  async extractProduct(): Promise<unknown> {
    throw new Error('AI fallback is disabled. Configure an AiClient to enable it.');
  }
}

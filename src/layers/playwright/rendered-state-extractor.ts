import { parseEmbeddedProductJson } from '../structured-data/embedded-json-parser.js';

export function parseRenderedState(html: string, pageUrl: string) {
  return parseEmbeddedProductJson(html, pageUrl);
}

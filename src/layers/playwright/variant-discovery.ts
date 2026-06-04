import type { Page } from 'playwright';
import { field, type ProductVariant } from '../../domain/product-extract-result.js';
import { uniqNormalized } from '../../normalization/text.js';

export type RenderedVariantOptions = {
  colors: string[];
  sizes: string[];
  variants: ProductVariant[];
};

export async function discoverRenderedVariantOptions(page: Page): Promise<RenderedVariantOptions> {
  const options = await page.evaluate(() => {
    const optionLabels = Array.from(document.querySelectorAll('select option, [role="option"], input[type="radio"]'))
      .map((element) => {
        if (element instanceof HTMLOptionElement) return element.textContent ?? '';
        if (element instanceof HTMLInputElement) {
          const idLabel = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent : '';
          return element.getAttribute('aria-label') ?? idLabel ?? element.value ?? '';
        }
        return element.getAttribute('aria-label') ?? element.textContent ?? '';
      })
      .filter(Boolean);

    const buttons = Array.from(document.querySelectorAll('button[aria-label], button[data-value], [data-option-value]'))
      .map((element) => element.getAttribute('aria-label') ?? element.getAttribute('data-value') ?? element.getAttribute('data-option-value') ?? element.textContent ?? '')
      .filter(Boolean);

    return [...optionLabels, ...buttons].slice(0, 250);
  });

  const colors = uniqNormalized(options.filter(isLikelyColor));
  const sizes = uniqNormalized(options.filter(isLikelySize));

  return { colors, sizes, variants: [] };
}

function isLikelySize(value: string): boolean {
  return /^(xxs|xs|s|m|l|xl|xxl|xxxl|\d{1,2}(?:\.\d)?|[0-9]{2,3}cm)$/i.test(value.trim());
}

function isLikelyColor(value: string): boolean {
  return /^[a-z][a-z\s/-]{2,30}$/i.test(value.trim()) && !isLikelySize(value) && !/select|choose|size|color|colour/i.test(value);
}

export function optionOnlyVariant(id: string, color: string | null, size: string | null): ProductVariant {
  return {
    id: field(id, 'PLAYWRIGHT_RENDERED_DOM', 0.45),
    sku: field<string>(null, 'PLAYWRIGHT_RENDERED_DOM', 0),
    title: field<string>(null, 'PLAYWRIGHT_RENDERED_DOM', 0),
    price: field<number>(null, 'PLAYWRIGHT_RENDERED_DOM', 0),
    currency: field<string>(null, 'PLAYWRIGHT_RENDERED_DOM', 0),
    color: field(color, 'PLAYWRIGHT_RENDERED_DOM', color ? 0.55 : 0),
    size: field(size, 'PLAYWRIGHT_RENDERED_DOM', size ? 0.55 : 0),
    availability: field('UNKNOWN', 'PLAYWRIGHT_RENDERED_DOM', 0),
    image: field<string>(null, 'PLAYWRIGHT_RENDERED_DOM', 0),
    options: {}
  };
}

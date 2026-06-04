import type { Page } from 'playwright';
import { normalizeAvailability, type ProductAvailability } from '../../domain/availability.js';

export async function detectRenderedAvailability(page: Page): Promise<ProductAvailability> {
  const signals = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
      .map((element) => `${element.textContent ?? ''} ${(element as HTMLButtonElement).disabled ? 'disabled' : ''}`)
      .join(' ');
    const bodyText = document.body?.innerText?.slice(0, 20_000) ?? '';
    return `${buttons}\n${bodyText}`;
  });

  return normalizeAvailability(signals);
}

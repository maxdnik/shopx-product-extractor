import type { Page } from 'playwright';
import { normalizeImageUrl } from '../../normalization/images.js';

export async function detectRenderedImages(page: Page, pageUrl: string): Promise<string[]> {
  const rawImages = await page.evaluate(() =>
    Array.from(document.images)
      .map((image) => image.currentSrc || image.src || image.getAttribute('data-src') || image.getAttribute('data-zoom-image') || '')
      .filter(Boolean)
      .slice(0, 100)
  );

  return [...new Set(rawImages.map((image) => normalizeImageUrl(image, pageUrl)).filter((image): image is string => Boolean(image)))];
}

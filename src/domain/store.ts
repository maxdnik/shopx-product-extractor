export const PLATFORMS = ['SHOPIFY', 'WOOCOMMERCE', 'MAGENTO', 'BIGCOMMERCE', 'SFCC', 'CUSTOM', 'UNKNOWN'] as const;

export type EcommercePlatform = (typeof PLATFORMS)[number];

export type StoreInfo = {
  domain: string;
  name?: string;
  platform: EcommercePlatform;
  platformConfidence: number;
};

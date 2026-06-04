import type { EcommercePlatform } from '../../domain/store.js';

export type PlatformSignal = {
  platform: EcommercePlatform;
  pattern: RegExp;
  weight: number;
  description: string;
};

export const PLATFORM_SIGNALS: PlatformSignal[] = [
  { platform: 'SHOPIFY', pattern: /window\.Shopify\b|ShopifyAnalytics|cdn\/shop\/|myshopify\.com|\/products\/[^"']+\.js/i, weight: 0.35, description: 'Shopify global/script/product endpoint signal' },
  { platform: 'SHOPIFY', pattern: /cdn\.shopify\.com|shopify-section|data-shopify/i, weight: 0.25, description: 'Shopify asset/theme signal' },
  { platform: 'WOOCOMMERCE', pattern: /woocommerce|wc-(?:add-to-cart|single-product|store)|wp-json\/wc|wp-content\/plugins\/woocommerce/i, weight: 0.35, description: 'WooCommerce asset/API signal' },
  { platform: 'WOOCOMMERCE', pattern: /class=["'][^"']*product[^"']*type-product|add_to_cart_button/i, weight: 0.18, description: 'WooCommerce product markup signal' },
  { platform: 'MAGENTO', pattern: /Magento_|x-magento-|mage\/|requirejs-config|customer-data|catalog\/product\/view/i, weight: 0.35, description: 'Magento script/app signal' },
  { platform: 'MAGENTO', pattern: /data-role=["']swatch-options|spConfig|jsonConfig/i, weight: 0.25, description: 'Magento configurable product signal' },
  { platform: 'BIGCOMMERCE', pattern: /BigCommerce|bc-sf-filter|stencil|window\.BCData|cdn\d*\.bigcommerce\.com/i, weight: 0.35, description: 'BigCommerce storefront signal' },
  { platform: 'BIGCOMMERCE', pattern: /data-product-id|productView|add-to-cart-wrapper/i, weight: 0.18, description: 'BigCommerce product markup signal' },
  { platform: 'SFCC', pattern: /demandware|\/on\/demandware\.store\/|dwvar_|dwfrm_|Salesforce Commerce Cloud/i, weight: 0.4, description: 'Salesforce Commerce Cloud Demandware signal' },
  { platform: 'SFCC', pattern: /data-pid=|product-detail.*data-product/i, weight: 0.18, description: 'SFCC product detail signal' }
];

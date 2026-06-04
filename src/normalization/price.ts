const CURRENCY_SYMBOLS: Record<string, string> = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '₩': 'KRW',
  '₽': 'RUB',
  '₺': 'TRY',
  '₴': 'UAH',
  '₪': 'ILS',
  '₫': 'VND'
};

const ISO_CURRENCY = /\b[A-Z]{3}\b/;

export type ParsedPrice = {
  amount: number | null;
  currency: string | null;
};

export function parsePrice(input: unknown, explicitCurrency?: unknown): ParsedPrice {
  const currency = normalizeCurrency(explicitCurrency) ?? (typeof input === 'string' ? detectCurrency(input) : null);

  if (typeof input === 'number' && Number.isFinite(input)) {
    return { amount: input, currency };
  }

  if (typeof input !== 'string') {
    return { amount: null, currency };
  }

  const numeric = extractNumericPrice(input);
  return { amount: numeric, currency };
}

export function normalizeCurrency(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (CURRENCY_SYMBOLS[trimmed]) return CURRENCY_SYMBOLS[trimmed];
  const match = trimmed.toUpperCase().match(ISO_CURRENCY);
  return match?.[0] ?? null;
}

function detectCurrency(input: string): string | null {
  for (const [symbol, currency] of Object.entries(CURRENCY_SYMBOLS)) {
    if (input.includes(symbol)) return currency;
  }
  return normalizeCurrency(input);
}

function extractNumericPrice(input: string): number | null {
  const match = input.replace(/\s/g, '').match(/[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|[-+]?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const raw = match[0];
  const decimalSeparator = inferDecimalSeparator(raw);
  const normalized =
    decimalSeparator === ','
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function inferDecimalSeparator(raw: string): '.' | ',' {
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  if (lastComma > lastDot) return ',';
  return '.';
}

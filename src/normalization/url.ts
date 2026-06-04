const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_',
  'spm'
]);

export type NormalizedUrl = {
  inputUrl: string;
  normalizedUrl: string;
  storeDomain: string;
};

export function normalizeProductUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = '';

  for (const param of [...url.searchParams.keys()]) {
    if (param.startsWith('utm_') || TRACKING_PARAMS.has(param.toLowerCase())) {
      url.searchParams.delete(param);
    }
  }

  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.pathname = normalizePathname(url.pathname);

  return {
    inputUrl: input,
    normalizedUrl: url.toString(),
    storeDomain: url.hostname.replace(/^www\./, '')
  };
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/{2,}/g, '/');
}

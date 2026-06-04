import type { EcommercePlatform } from '../../domain/store.js';
import { PLATFORM_SIGNALS, type PlatformSignal } from './platform-signals.js';

export type PlatformDetectionResult = {
  platform: EcommercePlatform;
  confidence: number;
  signals: Array<{
    platform: EcommercePlatform;
    description: string;
    weight: number;
  }>;
};

export function detectPlatform(html: string, url: string): PlatformDetectionResult {
  const haystack = `${url}\n${html.slice(0, 750_000)}`;
  const matchedSignals = PLATFORM_SIGNALS.filter((signal) => signal.pattern.test(haystack));
  const scores = scoreSignals(matchedSignals);
  const [platform, score] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['CUSTOM', 0];

  if (!platform || score === 0) {
    return { platform: 'CUSTOM', confidence: 0.35, signals: [] };
  }

  return {
    platform,
    confidence: Math.min(0.98, score),
    signals: matchedSignals
      .filter((signal) => signal.platform === platform)
      .map((signal) => ({
        platform: signal.platform,
        description: signal.description,
        weight: signal.weight
      }))
  };
}

function scoreSignals(signals: PlatformSignal[]): Map<EcommercePlatform, number> {
  const scores = new Map<EcommercePlatform, number>();
  for (const signal of signals) {
    scores.set(signal.platform, (scores.get(signal.platform) ?? 0) + signal.weight);
  }
  return scores;
}

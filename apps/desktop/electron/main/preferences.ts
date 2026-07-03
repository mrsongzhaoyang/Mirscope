import type { AppPreferences } from '@mirscope/shared';
import { DEFAULT_APP_PREFERENCES } from '@mirscope/shared';

export function parsePreferences(raw: string | null): AppPreferences {
  if (!raw) return { ...DEFAULT_APP_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      wordCloudLimit: clamp(parsed.wordCloudLimit ?? DEFAULT_APP_PREFERENCES.wordCloudLimit, 20, 120),
      templateMinScore: clamp(parsed.templateMinScore ?? DEFAULT_APP_PREFERENCES.templateMinScore, 60, 100),
      languageMixedThreshold: clamp(
        parsed.languageMixedThreshold ?? DEFAULT_APP_PREFERENCES.languageMixedThreshold,
        0.1,
        0.9
      ),
      languageChineseThreshold: clamp(
        parsed.languageChineseThreshold ?? DEFAULT_APP_PREFERENCES.languageChineseThreshold,
        0.5,
        1
      ),
    };
  } catch {
    return { ...DEFAULT_APP_PREFERENCES };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

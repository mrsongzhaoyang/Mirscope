import { safeStorage } from 'electron';

const PLAIN_PREFIX = 'plain:';
const ENC_PREFIX = 'enc:';

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  if (safeStorage.isEncryptionAvailable()) {
    return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64');
  }
  return PLAIN_PREFIX + plain;
}

export function decryptSecret(stored: string): string {
  if (!stored) return '';
  if (stored.startsWith(ENC_PREFIX)) {
    if (!safeStorage.isEncryptionAvailable()) return '';
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
    return safeStorage.decryptString(buf);
  }
  if (stored.startsWith(PLAIN_PREFIX)) {
    return stored.slice(PLAIN_PREFIX.length);
  }
  return stored;
}

export function encryptAIConfig(config: { apiKey: string; [key: string]: unknown }): string {
  const { apiKey, ...rest } = config;
  return JSON.stringify({ ...rest, apiKey: encryptSecret(apiKey) });
}

export function decryptAIConfig(raw: string | null): {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
} {
  if (!raw) {
    return { provider: 'openai', apiKey: '', model: 'gpt-4o-mini' };
  }
  try {
    const parsed = JSON.parse(raw) as {
      provider?: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };
    return {
      provider: parsed.provider ?? 'openai',
      apiKey: decryptSecret(parsed.apiKey ?? ''),
      baseUrl: parsed.baseUrl,
      model: parsed.model ?? 'gpt-4o-mini',
    };
  } catch {
    return { provider: 'openai', apiKey: '', model: 'gpt-4o-mini' };
  }
}

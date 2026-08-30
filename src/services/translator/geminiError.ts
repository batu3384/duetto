export type GeminiLimitKind = 'rate' | 'daily';

export function classifyGeminiLimit(
  status: number,
  body: { error?: { message?: string; status?: string } }
): GeminiLimitKind | null {
  if (status !== 429 && body?.error?.status !== 'RESOURCE_EXHAUSTED') return null;
  const msg = (body?.error?.message || '').toLowerCase();
  if (/per day|perday|daily|per user per day/i.test(msg)) return 'daily';
  if (/per minute|perminute|requests per minute|rpm|rate limit/i.test(msg)) return 'rate';
  // Playback bursts usually hit RPM, not daily quota.
  return 'rate';
}

export function geminiRateLimitMessage(): string {
  return 'Gemini dakikalık istek sınırı. 15–30 sn bekle, tekrar dene.';
}

export function geminiDailyQuotaMessage(): string {
  return 'Gemini günlük kotası doldu. AI Studio’da kota kontrol et veya birkaç saat bekle.';
}

export function explainGeminiError(status: number, body: { error?: { message?: string; status?: string } }): string {
  const msg = (body?.error?.message || '').trim();
  const code = body?.error?.status || '';
  if (status === 400 || code === 'INVALID_ARGUMENT' || /api key not valid|api_key_invalid/i.test(msg)) {
    return 'API anahtarı geçersiz. AI Studio’dan yeni anahtar kopyala (AIza… ile başlar).';
  }
  if (status === 403 || code === 'PERMISSION_DENIED') {
    return 'Bu anahtarın Gemini API izni yok. AI Studio’da Generative Language API açık olsun.';
  }
  if (status === 404 || code === 'NOT_FOUND' || /not found|no longer available/i.test(msg)) {
    return `Model bulunamadı (${status}). Gemini sekmesinden 3.5 Flash Lite veya Flash Latest dene.`;
  }
  const limitKind = classifyGeminiLimit(status, body);
  if (limitKind === 'daily') return geminiDailyQuotaMessage();
  if (limitKind === 'rate') return geminiRateLimitMessage();
  if (/AIza[0-9A-Za-z_-]{8,}/.test(msg)) return `Gemini hata (${status})`;
  return msg || `Gemini hata (${status})`;
}

export function isGeminiQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /429|resource_exhausted|günlük kota|dakikalık istek|quota exceeded/i.test(message);
}

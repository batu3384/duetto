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
  if (status === 429 || code === 'RESOURCE_EXHAUSTED') {
    return 'Gemini kotası doldu. Birkaç dakika bekle veya AI Studio’da kota kontrol et.';
  }
  if (/AIza[0-9A-Za-z_-]{8,}/.test(msg)) return `Gemini hata (${status})`;
  return msg || `Gemini hata (${status})`;
}

export function isGeminiQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /429|quota|resource_exhausted|kota/i.test(message);
}

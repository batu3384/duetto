export const CUE_TEXT_MAX = 500;
export const REST_BATCH_CAP = 8;

export type CaptionFailReason = 'timeout' | 'http' | 'type' | 'denied';

export function shouldChainRest(fillLecture: boolean, batchesDone: number, cap = REST_BATCH_CAP): boolean {
  return fillLecture === true && batchesDone < cap;
}

export function shouldRetryLateTranslation(alreadyRetried: boolean): boolean {
  return alreadyRetried !== true;
}

export function captionFailureMessage(reason: CaptionFailReason | null): string {
  if (reason === 'timeout') return 'Altyazı isteği zaman aşımına uğradı. Yenilemeyi dene.';
  if (reason === 'http') return 'Altyazı adresi yanıt vermedi.';
  if (reason === 'type') return 'Altyazı dosyası geçersiz.';
  if (reason === 'denied') return 'Altyazı adresi kabul edilmedi.';
  return 'Kaynak altyazı bulunamadı. Videoyu oynatın veya “Altyazıyı yenile” seçin.';
}

export function asCaptionFail(value: unknown): CaptionFailReason | null {
  return value === 'timeout' || value === 'http' || value === 'type' || value === 'denied' ? value : null;
}

export function formatSourceStatus(error: string | null, label: string, loading: boolean): string {
  return error || label || (loading ? 'Altyazı aranıyor…' : 'Kaynak yok');
}

export function clipCueText(text: string): string {
  const trimmed = (text || '').trim();
  return trimmed.length <= CUE_TEXT_MAX ? trimmed : trimmed.slice(0, CUE_TEXT_MAX);
}

export function shouldRetryCaptionSearch(opts: {
  hasCues: boolean;
  sourceError: boolean;
  nativeOnly: boolean;
}): boolean {
  return !opts.hasCues || opts.sourceError || opts.nativeOnly;
}

/** Aynı ders, gerçek VTT cue’ları varsa video düğümü değişse de silme. */
export function shouldKeepLectureCues(opts: {
  sameLecture: boolean;
  cueCount: number;
  nativeOnly: boolean;
}): boolean {
  return opts.sameLecture && opts.cueCount > 0 && !opts.nativeOnly;
}

/** Menü etiketi yoksa DOM satırını kaynak sayma. */
export function acceptNativeCaption(label: string, matchesSource: boolean, matchesTarget: boolean): boolean {
  if (!label.trim()) return false;
  if (matchesSource) return true;
  return !matchesTarget;
}

type TimedCue = { id: string; startTime: number; endTime: number; translation?: string };

/** Canlı pencerenin dışında kalan çevrilmemiş satırlar. Pencere liveWindowCues ile aynı: 1 geri, 12 ileri. */
export function nextRestCues<T extends TimedCue>(cues: T[], aroundTime: number, limit = 12): T[] {
  let index = cues.findIndex((cue) => aroundTime >= cue.startTime && aroundTime <= cue.endTime);
  if (index < 0) index = cues.findIndex((cue) => cue.startTime >= aroundTime);
  if (index < 0) index = 0;
  const live = new Set(cues.slice(Math.max(0, index - 1), index + 12).map((cue) => cue.id));
  const pending = cues.filter((cue) => !cue.translation?.trim() && !live.has(cue.id));
  const ahead = pending.filter((cue) => cue.startTime >= aroundTime - 0.5);
  const behind = pending.filter((cue) => cue.startTime < aroundTime - 0.5);
  return [...ahead, ...behind].slice(0, limit);
}

/** Tracks henüz yoksa lecture cache kullan; fingerprint gelince eşleşmezse yenilenir. */
export function cacheMatchesCaptionSource(
  cachedFingerprint: string | undefined,
  sourceFingerprint: string
): boolean {
  if (!sourceFingerprint) return true;
  return !!cachedFingerprint && cachedFingerprint === sourceFingerprint;
}

export function formatSourceStatus(error: string | null, label: string, loading: boolean): string {
  return error || label || (loading ? 'Altyazı aranıyor…' : 'Kaynak yok');
}

export function shouldRetryCaptionSearch(opts: {
  hasCues: boolean;
  sourceError: boolean;
  nativeOnly: boolean;
}): boolean {
  return !opts.hasCues || opts.sourceError || opts.nativeOnly;
}

/** Tracks henüz yoksa lecture cache kullan; fingerprint gelince eşleşmezse yenilenir. */
export function cacheMatchesCaptionSource(
  cachedFingerprint: string | undefined,
  sourceFingerprint: string
): boolean {
  if (!sourceFingerprint) return true;
  return !!cachedFingerprint && cachedFingerprint === sourceFingerprint;
}

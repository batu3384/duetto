import type { SubtitleCue } from '../../types/index.ts';

export function translationJobKey(payload: {
  cues?: SubtitleCue[];
  lectureId?: unknown;
  sourceFingerprint?: unknown;
  translationFingerprint?: unknown;
}): string | null {
  const lectureId = typeof payload?.lectureId === 'string' ? payload.lectureId : '';
  const sourceFingerprint =
    typeof payload?.sourceFingerprint === 'string' ? payload.sourceFingerprint : '';
  const translationFingerprint =
    typeof payload?.translationFingerprint === 'string' ? payload.translationFingerprint : '';
  const cueIds = Array.isArray(payload?.cues)
    ? payload.cues.map((cue) => (typeof cue?.id === 'string' ? cue.id : '')).join(',')
    : '';
  if (!lectureId || !sourceFingerprint || !translationFingerprint || !cueIds) return null;
  return `${lectureId}|${sourceFingerprint}|${translationFingerprint}|${cueIds}`;
}

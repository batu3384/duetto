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
  const cueIdentity = Array.isArray(payload?.cues)
    ? payload.cues
        .map((cue) => {
          if (typeof cue?.id !== 'string') return '';
          return `${cue.id}:${cue.startTime}:${cue.endTime}:${cue.text}`;
        })
        .join(',')
    : '';
  if (!lectureId || !sourceFingerprint || !translationFingerprint || !cueIdentity) return null;
  return `${lectureId}|${sourceFingerprint}|${translationFingerprint}|${cueIdentity}`;
}

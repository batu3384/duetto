import { CourseTranscript, PendingSeek } from '../types';

const PREFIX = 'duetto_tx_';
const LEGACY_PREFIX = 'dualis_tx_';
const SEEK_KEY = 'duetto_pending_seek';
const LEGACY_SEEK_KEY = 'dualis_pending_seek';

export function transcriptStorageId(lectureId: string, sourceLang: string, targetLang: string): string {
  return `${lectureId}::${sourceLang}::${targetLang}`;
}

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function saveTranscript(transcript: CourseTranscript): Promise<void> {
  if (!hasStorage()) return;
  const translated = transcript.cues.filter((c) => c.translation && c.translation.length > 0).length;
  if (transcript.cues.length === 0 || translated < 1) {
    return;
  }
  const key = PREFIX + transcript.id;
  await chrome.storage.local.set({ [key]: transcript });
  await chrome.storage.local.remove(LEGACY_PREFIX + transcript.id);
}

export async function getTranscript(storageId: string): Promise<CourseTranscript | undefined> {
  if (!hasStorage()) return undefined;
  const key = PREFIX + storageId;
  const legacyKey = LEGACY_PREFIX + storageId;
  const result = await chrome.storage.local.get([key, legacyKey]);
  const hit = (result[key] || result[legacyKey]) as CourseTranscript | undefined;
  if (hit && result[legacyKey] && !result[key]) {
    await chrome.storage.local.set({ [key]: hit });
    await chrome.storage.local.remove(legacyKey);
  }
  return hit;
}

export async function listTranscripts(): Promise<CourseTranscript[]> {
  if (!hasStorage()) return [];
  const area = chrome.storage.local as chrome.storage.LocalStorageArea & { getKeys?: () => Promise<string[]> };
  let keys: string[];
  // ponytail: getKeys Chrome 130+; dump fallback still loads other keys into this function only
  if (typeof area.getKeys === 'function') {
    keys = (await area.getKeys()).filter((k) => k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX));
  } else {
    keys = Object.keys(await area.get(null)).filter((k) => k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX));
  }
  if (!keys.length) return [];
  const bag = await area.get(keys);
  const out: CourseTranscript[] = [];
  const seen = new Set<string>();
  for (const [k, value] of Object.entries(bag)) {
    if (!value || typeof value !== 'object' || !('cues' in (value as object))) continue;
    const tx = value as CourseTranscript;
    if (seen.has(tx.id)) continue;
    seen.add(tx.id);
    out.push(tx);
    if (k.startsWith(LEGACY_PREFIX)) {
      await chrome.storage.local.set({ [PREFIX + tx.id]: tx });
      await chrome.storage.local.remove(k);
    }
  }
  return out;
}

export async function setPendingSeek(seek: PendingSeek): Promise<void> {
  if (!hasStorage()) return;
  await chrome.storage.local.set({ [SEEK_KEY]: seek });
  await chrome.storage.local.remove(LEGACY_SEEK_KEY);
}

export async function consumePendingSeek(): Promise<PendingSeek | undefined> {
  if (!hasStorage()) return undefined;
  const result = await chrome.storage.local.get([SEEK_KEY, LEGACY_SEEK_KEY]);
  const seek = (result[SEEK_KEY] || result[LEGACY_SEEK_KEY]) as PendingSeek | undefined;
  if (seek) {
    await chrome.storage.local.remove([SEEK_KEY, LEGACY_SEEK_KEY]);
  }
  return seek;
}

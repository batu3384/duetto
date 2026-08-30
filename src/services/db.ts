import type { CourseTranscript, ExtensionSettings, PendingSeek } from '../types/index.ts';
import { extensionAlive, isStaleExtensionError } from './storage.ts';

const PREFIX = 'duetto_tx_';
const LEGACY_PREFIX = 'dualis_tx_';
const SEEK_KEY = 'duetto_pending_seek';
const LEGACY_SEEK_KEY = 'dualis_pending_seek';

export function transcriptStorageId(lectureId: string, sourceLang: string, targetLang: string): string {
  return `${lectureId}::${sourceLang}::${targetLang}`;
}

export function transcriptTranslationFingerprint(
  settings: Pick<ExtensionSettings, 'targetLang' | 'geminiModel' | 'geminiTemperature' | 'termLockEnabled' | 'customProtectedTerms'>
): string {
  const terms = settings.termLockEnabled
    ? Array.from(new Set((settings.customProtectedTerms || []).map((term) => term.trim().toLowerCase()).filter(Boolean))).sort()
    : [];
  return [
    'v1',
    (settings.targetLang || 'tr').toLowerCase(),
    settings.geminiModel || '',
    String(settings.geminiTemperature ?? 0.2),
    settings.termLockEnabled ? 'terms-on' : 'terms-off',
    terms.join(','),
  ].join('|');
}

function hasStorage(): boolean {
  return extensionAlive() && typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

async function localGet(keys: string | string[] | null): Promise<Record<string, unknown>> {
  if (!hasStorage()) return {};
  try {
    return await chrome.storage.local.get(keys);
  } catch (err) {
    if (isStaleExtensionError(err)) return {};
    throw err;
  }
}

async function localSet(items: Record<string, unknown>): Promise<void> {
  if (!hasStorage()) return;
  try {
    await chrome.storage.local.set(items);
  } catch (err) {
    if (isStaleExtensionError(err)) return;
    throw err;
  }
}

async function localRemove(keys: string | string[]): Promise<void> {
  if (!hasStorage()) return;
  try {
    await chrome.storage.local.remove(keys);
  } catch (err) {
    if (isStaleExtensionError(err)) return;
    throw err;
  }
}

export async function saveTranscript(transcript: CourseTranscript): Promise<void> {
  if (!hasStorage()) return;
  const translated = transcript.cues.filter((c) => c.translation && c.translation.length > 0).length;
  if (transcript.cues.length === 0 || translated < 1) {
    return;
  }
  const key = PREFIX + transcript.id;
  await localSet({ [key]: transcript });
  await localRemove(LEGACY_PREFIX + transcript.id);
}

export async function getTranscript(storageId: string): Promise<CourseTranscript | undefined> {
  if (!hasStorage()) return undefined;
  const key = PREFIX + storageId;
  const legacyKey = LEGACY_PREFIX + storageId;
  const result = await localGet([key, legacyKey]);
  const hit = (result[key] || result[legacyKey]) as CourseTranscript | undefined;
  if (hit && result[legacyKey] && !result[key]) {
    await localSet({ [key]: hit });
    await localRemove(legacyKey);
  }
  return hit;
}

export async function listTranscripts(): Promise<CourseTranscript[]> {
  if (!hasStorage()) return [];
  const area = chrome.storage.local as chrome.storage.LocalStorageArea & { getKeys?: () => Promise<string[]> };
  let keys: string[];
  try {
    // ponytail: getKeys Chrome 130+; dump fallback still loads other keys into this function only
    if (typeof area.getKeys === 'function') {
      keys = (await area.getKeys()).filter((k) => k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX));
    } else {
      keys = Object.keys(await localGet(null)).filter((k) => k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX));
    }
  } catch (err) {
    if (isStaleExtensionError(err)) return [];
    throw err;
  }
  if (!keys.length) return [];
  const bag = await localGet(keys);
  const out: CourseTranscript[] = [];
  const seen = new Set<string>();
  for (const [k, value] of Object.entries(bag)) {
    if (!value || typeof value !== 'object' || !('cues' in (value as object))) continue;
    const tx = value as CourseTranscript;
    if (seen.has(tx.id)) continue;
    seen.add(tx.id);
    out.push(tx);
    if (k.startsWith(LEGACY_PREFIX)) {
      await localSet({ [PREFIX + tx.id]: tx });
      await localRemove(k);
    }
  }
  return out;
}

export async function setPendingSeek(seek: PendingSeek): Promise<void> {
  if (!hasStorage()) return;
  await localSet({ [SEEK_KEY]: seek });
  await localRemove(LEGACY_SEEK_KEY);
}

export async function consumePendingSeek(): Promise<PendingSeek | undefined> {
  if (!hasStorage()) return undefined;
  const result = await localGet([SEEK_KEY, LEGACY_SEEK_KEY]);
  const seek = (result[SEEK_KEY] || result[LEGACY_SEEK_KEY]) as PendingSeek | undefined;
  if (seek) {
    await localRemove([SEEK_KEY, LEGACY_SEEK_KEY]);
  }
  return seek;
}

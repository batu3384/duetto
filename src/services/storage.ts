import { DEFAULT_SETTINGS, type ExtensionSettings, type SubtitleStyle } from '../types/index.ts';
import {
  clampDockOpacity,
  clampOffsetY,
  clampOutlineWidth,
  clampPct,
  isEdgeStyle,
  migrateFontFamily,
  resolveAlign,
  resolveEdgeStyle,
  resolvePlacement,
  resolveVideoFit,
  safeCssColor,
} from './subtitleLook.ts';

export const SETTINGS_KEY = 'duetto_settings';
export const SECRET_KEY = 'duetto_secret';
const LEGACY_SETTINGS_KEYS = ['dualis_settings', 'lingoflow_pro_settings', 'udemy_supercharged_settings'];
const LEGACY_SECRET_KEY = 'dualis_secret';

let cachedSettings: ExtensionSettings | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let stashAsked = false;
let syncingKeyFlag = false;

function mergeSubStyle(raw: Partial<SubtitleStyle> | undefined, patch?: Partial<SubtitleStyle>): SubtitleStyle {
  const base = raw || {};
  const merged: SubtitleStyle = {
    ...DEFAULT_SETTINGS.subStyle,
    ...base,
  };
  const edgeSrc = patch || base;
  if (isEdgeStyle(edgeSrc.edgeStyle)) {
    merged.edgeStyle = edgeSrc.edgeStyle;
  } else if (edgeSrc.textStroke === false) {
    merged.edgeStyle = 'none';
  } else if (edgeSrc.textStroke === true && (merged.edgeStyle === 'none' || !isEdgeStyle(merged.edgeStyle))) {
    merged.edgeStyle = 'outline';
  } else {
    merged.edgeStyle = resolveEdgeStyle(merged);
  }
  merged.textStroke = merged.edgeStyle !== 'none';
  merged.outlineWidth = clampOutlineWidth(merged.outlineWidth);
  merged.align = resolveAlign(merged.align);
  merged.fontFamily = migrateFontFamily(merged.fontFamily);
  merged.placement = resolvePlacement(merged.placement);
  merged.videoFit = resolveVideoFit(merged.videoFit);
  merged.dockAmbient = merged.dockAmbient !== false;
  merged.primaryColor = safeCssColor(merged.primaryColor, DEFAULT_SETTINGS.subStyle.primaryColor);
  merged.secondaryColor = safeCssColor(merged.secondaryColor, DEFAULT_SETTINGS.subStyle.secondaryColor);
  merged.boxColor = safeCssColor(merged.boxColor, DEFAULT_SETTINGS.subStyle.boxColor);
  merged.edgeColor = safeCssColor(merged.edgeColor, DEFAULT_SETTINGS.subStyle.edgeColor);
  merged.dockColor = safeCssColor(merged.dockColor, DEFAULT_SETTINGS.subStyle.dockColor);
  merged.dockOpacity = clampDockOpacity(merged.dockOpacity);
  // v2.15: eski varsayılan 100 + ambient karartma slider'ı ezmişti. Yüklemede 100 = slaytla eşleş.
  if (!patch && merged.dockAmbient && base.dockOpacity === 100) {
    merged.dockOpacity = 0;
  }
  merged.bgOpacity = clampPct(merged.bgOpacity, 55);
  merged.offsetY = clampOffsetY(merged.offsetY);
  merged.pauseOnHover = merged.pauseOnHover !== false;
  return merged;
}

const SLIDER_KEYS = new Set(['bgOpacity', 'dockOpacity', 'primaryFontSize', 'secondaryFontSize', 'offsetY', 'outlineWidth']);

function isSliderOnlyPatch(sub: Partial<SubtitleStyle> | undefined): boolean {
  if (!sub) return false;
  const keys = Object.keys(sub);
  return keys.length > 0 && keys.every((k) => SLIDER_KEYS.has(k));
}

/** Popup + service worker. Content script (udemy.com) never reads/writes the key. */
export function secretsAllowed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.location.protocol === 'chrome-extension:';
  } catch {
    return false;
  }
}

export function dropSecret(settings: ExtensionSettings): ExtensionSettings {
  return { ...settings, geminiApiKey: '' };
}

export function keyIsConfigured(
  settings: Pick<ExtensionSettings, 'geminiApiKey' | 'geminiKeyConfigured'>
): boolean {
  return !!settings.geminiApiKey?.trim() || settings.geminiKeyConfigured === true;
}

export function attachSecret(settings: ExtensionSettings, key: string): ExtensionSettings {
  return { ...settings, geminiApiKey: key };
}

export function readSecretFromBag(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && typeof (value as { geminiApiKey?: unknown }).geminiApiKey === 'string') {
    return (value as { geminiApiKey: string }).geminiApiKey.trim();
  }
  return '';
}

export function blobKeyFromSettings(raw: Partial<ExtensionSettings> | undefined): string {
  return typeof raw?.geminiApiKey === 'string' ? raw.geminiApiKey.trim() : '';
}

export function mergeSettings(raw: Partial<ExtensionSettings> | undefined): ExtensionSettings {
  const r = raw || {};
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    geminiApiKey: '',
    geminiKeyConfigured: r.geminiKeyConfigured === true,
    customProtectedTerms: Array.isArray(r.customProtectedTerms) ? r.customProtectedTerms : [],
    subStyle: mergeSubStyle(r.subStyle),
  };
}

function readChrome(area: chrome.storage.StorageArea, keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve({});
      return;
    }
    area.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        resolve({});
        return;
      }
      resolve(result || {});
    });
  });
}

function writeChrome(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve();
      return;
    }
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function removeChrome(keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve();
      return;
    }
    chrome.storage.local.remove(keys, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

export function invalidateSettingsCache(): void {
  cachedSettings = null;
}

function askSwToStashKey(): void {
  if (stashAsked || secretsAllowed()) return;
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  stashAsked = true;
  chrome.runtime.sendMessage({ type: 'STASH_GEMINI_KEY' }, () => {
    void chrome.runtime.lastError;
  });
}

async function readSecret(): Promise<string> {
  if (!secretsAllowed() || typeof chrome === 'undefined' || !chrome.storage) return '';
  const bag = await readChrome(chrome.storage.local, [SECRET_KEY, LEGACY_SECRET_KEY]);
  const current = readSecretFromBag(bag[SECRET_KEY]);
  if (current) return current;
  const legacy = readSecretFromBag(bag[LEGACY_SECRET_KEY]);
  if (legacy) {
    await writeSecret(legacy);
    await removeChrome([LEGACY_SECRET_KEY]);
    return legacy;
  }
  return '';
}

async function persistKeyFlag(configured: boolean): Promise<void> {
  if (!secretsAllowed() || syncingKeyFlag) return;
  const bag = await readChrome(chrome.storage.local, [SETTINGS_KEY]);
  const prev = (bag[SETTINGS_KEY] || {}) as Partial<ExtensionSettings>;
  if (prev.geminiKeyConfigured === configured) return;
  syncingKeyFlag = true;
  try {
    await writeChrome({
      [SETTINGS_KEY]: {
        ...prev,
        geminiApiKey: blobKeyFromSettings(prev) ? prev.geminiApiKey : '',
        geminiKeyConfigured: configured,
      },
    });
  } finally {
    syncingKeyFlag = false;
  }
}

async function writeSecret(key: string): Promise<void> {
  if (!secretsAllowed()) return;
  const trimmed = key.trim();
  if (!trimmed) {
    await removeChrome([SECRET_KEY]);
    await persistKeyFlag(false);
    return;
  }
  await writeChrome({ [SECRET_KEY]: { geminiApiKey: trimmed } });
  await persistKeyFlag(true);
}

/** Move a leftover key out of the public settings blob. SW / popup only. */
export async function stashGeminiKeyFromSettingsBlob(): Promise<void> {
  if (!secretsAllowed() || typeof chrome === 'undefined' || !chrome.storage) return;
  const local = await readChrome(chrome.storage.local, [SETTINGS_KEY]);
  const raw = local[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
  const blobKey = blobKeyFromSettings(raw);
  if (!blobKey) return;
  const existing = await readSecret();
  if (!existing) await writeSecret(blobKey);
  await writeChrome({ [SETTINGS_KEY]: { ...raw, geminiApiKey: '' } });
}

export async function getSettings(opts?: { fresh?: boolean }): Promise<ExtensionSettings> {
  if (!opts?.fresh && cachedSettings) {
    return secretsAllowed() ? cachedSettings : settingsForPage(cachedSettings);
  }

  if (typeof chrome === 'undefined' || !chrome.storage) {
    cachedSettings = { ...DEFAULT_SETTINGS, subStyle: { ...DEFAULT_SETTINGS.subStyle } };
    return cachedSettings;
  }

  const local = await readChrome(chrome.storage.local, [SETTINGS_KEY, ...LEGACY_SETTINGS_KEYS]);
  const sync = await readChrome(chrome.storage.sync, [SETTINGS_KEY, ...LEGACY_SETTINGS_KEYS]);

  const localRaw = (local[SETTINGS_KEY] ||
    LEGACY_SETTINGS_KEYS.map((k) => local[k]).find(Boolean)) as Partial<ExtensionSettings> | undefined;
  const syncRaw = (sync[SETTINGS_KEY] ||
    LEGACY_SETTINGS_KEYS.map((k) => sync[k]).find(Boolean)) as Partial<ExtensionSettings> | undefined;
  const raw = localRaw || syncRaw;

  if (blobKeyFromSettings(raw)) askSwToStashKey();

  const loaded = mergeSettings(raw);
  if (!local[SETTINGS_KEY] && raw) {
    const fromLocalBlob = blobKeyFromSettings(localRaw);
    cachedSettings = dropSecret(loaded);
    await saveSettings(loaded, { immediate: true, skipMerge: true });
    chrome.storage.sync.remove([...LEGACY_SETTINGS_KEYS, SETTINGS_KEY]);
    chrome.storage.local.remove(LEGACY_SETTINGS_KEYS);
    if (secretsAllowed() && fromLocalBlob) {
      const existing = await readSecret();
      if (!existing) await writeSecret(fromLocalBlob);
    }
    if (secretsAllowed()) await stashGeminiKeyFromSettingsBlob();
    const key = await readSecret();
    cachedSettings = attachSecret(dropSecret(cachedSettings), key);
    cachedSettings.geminiKeyConfigured = !!key || cachedSettings.geminiKeyConfigured === true;
    if (secretsAllowed()) await persistKeyFlag(!!key);
    return secretsAllowed() ? cachedSettings : settingsForPage(cachedSettings);
  }

  if (secretsAllowed()) await stashGeminiKeyFromSettingsBlob();
  const key = await readSecret();
  cachedSettings = attachSecret(loaded, key);
  cachedSettings.geminiKeyConfigured = !!key || loaded.geminiKeyConfigured === true;
  if (secretsAllowed()) await persistKeyFlag(!!key);
  return secretsAllowed() ? cachedSettings : settingsForPage(cachedSettings);
}

export function mergePublicPersist(
  updated: ExtensionSettings,
  prev: Partial<ExtensionSettings> | undefined
): ExtensionSettings {
  const next = dropSecret(updated);
  const keep = blobKeyFromSettings(prev);
  if (keep) next.geminiApiKey = keep;
  if (!secretsAllowed()) {
    next.geminiKeyConfigured = prev?.geminiKeyConfigured === true || next.geminiKeyConfigured === true;
  } else {
    next.geminiKeyConfigured = next.geminiKeyConfigured === true;
  }
  return next;
}

async function persistPublicSettings(updated: ExtensionSettings): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  const bag = await readChrome(chrome.storage.local, [SETTINGS_KEY]);
  const prev = bag[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
  await writeChrome({ [SETTINGS_KEY]: mergePublicPersist(updated, prev) });
}

export function applySettingsCache(settings: ExtensionSettings): void {
  cachedSettings = secretsAllowed() ? settings : settingsForPage(settings);
}

export async function saveSettings(
  settings: Partial<ExtensionSettings>,
  opts?: { immediate?: boolean; skipMerge?: boolean }
): Promise<ExtensionSettings> {
  const current = opts?.skipMerge
    ? dropSecret(settings as ExtensionSettings)
    : dropSecret(cachedSettings || (await getSettings()));
  const updated: ExtensionSettings = opts?.skipMerge
    ? dropSecret(settings as ExtensionSettings)
    : dropSecret({
        ...current,
        ...settings,
        subStyle: mergeSubStyle(
          {
            ...current.subStyle,
            ...(settings.subStyle || {}),
          },
          settings.subStyle
        ),
      });

  const touchingKey = !opts?.skipMerge && Object.prototype.hasOwnProperty.call(settings, 'geminiApiKey');
  if (touchingKey && secretsAllowed()) {
    const nextKey = typeof settings.geminiApiKey === 'string' ? settings.geminiApiKey : '';
    await writeSecret(nextKey);
    updated.geminiKeyConfigured = !!nextKey.trim();
  } else if (!secretsAllowed()) {
    updated.geminiKeyConfigured = current.geminiKeyConfigured === true || updated.geminiKeyConfigured === true;
  }

  const persist = () => persistPublicSettings(updated);

  const debounceStyleOnly =
    !opts?.immediate && settings.subStyle && Object.keys(settings).length === 1 && isSliderOnlyPatch(settings.subStyle);
  if (debounceStyleOnly) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void persist();
    }, 150);
  } else {
    if (saveTimer) clearTimeout(saveTimer);
    await persist();
  }

  const key = await readSecret();
  cachedSettings = attachSecret(updated, key);
  cachedSettings.geminiKeyConfigured = !!key || updated.geminiKeyConfigured === true;
  return secretsAllowed() ? cachedSettings : settingsForPage(cachedSettings);
}

export async function flushPendingSave(): Promise<void> {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  if (cachedSettings) await persistPublicSettings(dropSecret(cachedSettings));
}

/** Content: ask SW so the key-present flag is truthful. Popup/SW use getSettings. */
export function getPageSettings(): Promise<ExtensionSettings> {
  if (secretsAllowed()) return getSettings({ fresh: true });
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      void getSettings({ fresh: true }).then(resolve);
      return;
    }
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (chrome.runtime.lastError || !res || typeof res !== 'object') {
        void getSettings({ fresh: true }).then(resolve);
        return;
      }
      const page = settingsForPage(mergeSettings(res as Partial<ExtensionSettings>));
      applySettingsCache(page);
      resolve(page);
    });
  });
}

/** Content script / tab messages: never include the API key. */
export function settingsForPage(settings: ExtensionSettings): ExtensionSettings {
  return {
    ...dropSecret(settings),
    geminiKeyConfigured: keyIsConfigured(settings),
  };
}

export function senderMayReadSecrets(sender: {
  tab?: { id?: number };
  url?: string;
  origin?: string;
  id?: string;
}): boolean {
  if (sender.tab) return false;
  const url = sender.url || sender.origin || '';
  if (url.startsWith('chrome-extension://')) return true;
  return typeof chrome !== 'undefined' && !!sender.id && sender.id === chrome.runtime?.id;
}

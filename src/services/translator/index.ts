import { ExtensionSettings, SubtitleCue } from '../../types';
import { pingGemini, translatePhraseWithGemini, translateWithGemini, type TranslationPatch } from './gemini';
import { primaryLang } from '../vttParser';

export type { TranslationPatch };

const PHRASE_MAX = 120;

export function requireGeminiKey(settings: ExtensionSettings): string {
  const key = settings.geminiApiKey?.trim();
  if (!key) {
    throw new Error('Gemini API anahtarı yok. Uzantı simgesi → Gemini sekmesinden ekleyin.');
  }
  return key;
}

export async function translatePhrase(
  text: string,
  settings: ExtensionSettings,
  targetLang: string,
  opts?: { bypassCooldown?: boolean }
): Promise<string> {
  const q = text.trim().slice(0, PHRASE_MAX);
  if (!q) return '';
  const tl = (targetLang || 'tr').toLowerCase();
  const key = requireGeminiKey(settings);
  return translatePhraseWithGemini(
    q,
    key,
    tl,
    settings.geminiModel || 'gemini-3.5-flash-lite',
    typeof settings.geminiTemperature === 'number' ? settings.geminiTemperature : 0.2,
    opts
  );
}

export async function translateCues(
  cues: SubtitleCue[],
  settings: ExtensionSettings,
  onProgress?: (completed: number, total: number) => void,
  opts?: { aroundTime?: number; onBatch?: (patches: TranslationPatch[]) => void; abort?: AbortSignal }
): Promise<SubtitleCue[]> {
  const targetLang = settings.targetLang || 'tr';
  const sourceLang = settings.sourceLang || 'en';
  const model = settings.geminiModel || 'gemini-3.5-flash-lite';
  const temperature = typeof settings.geminiTemperature === 'number' ? settings.geminiTemperature : 0.2;

  if (primaryLang(sourceLang) === primaryLang(targetLang)) {
    const out = cues.map((c) => ({ ...c, translation: c.translation || c.text }));
    opts?.onBatch?.(out.map((c) => ({ id: c.id, translation: c.translation || c.text })));
    onProgress?.(cues.length, cues.length);
    return out;
  }

  const key = requireGeminiKey(settings);
  const customTerms = settings.termLockEnabled ? settings.customProtectedTerms || [] : [];

  return translateWithGemini(
    cues,
    key,
    sourceLang,
    targetLang,
    model,
    temperature,
    customTerms,
    onProgress,
    settings.termLockEnabled,
    opts?.aroundTime ?? 0,
    opts?.onBatch,
    opts?.abort
  );
}

export interface GeminiPipelineTestResult {
  success: boolean;
  latencyMs: number;
  model: string;
  phrase?: { source: string; translation: string };
  subtitle?: { source: string; translation: string };
  error?: string;
}

/** Popup test — SW taze storage okur; ping + bir kelime. Numaralı cue parse’a bağlı değil. */
export async function testGeminiPipeline(settings: ExtensionSettings): Promise<GeminiPipelineTestResult> {
  const start = performance.now();
  const model = settings.geminiModel || 'gemini-3.5-flash-lite';
  const targetLang = settings.targetLang || 'tr';
  const key = requireGeminiKey(settings);

  await pingGemini(key, model);
  const phraseSrc = 'hook';
  const phraseTr = await translatePhrase(phraseSrc, settings, targetLang, { bypassCooldown: true });
  if (!phraseTr) throw new Error('Gemini kelime çevirisi boş.');

  return {
    success: true,
    latencyMs: Math.round(performance.now() - start),
    model,
    phrase: { source: phraseSrc, translation: phraseTr },
  };
}

import type { SubtitleCue } from '../../types';
import { buildTranslationSystemPrompt, extractGlossaryTerms } from './glossary';
import { groupCuesForLiveTranslation, parseBatchTranslation } from '../vttParser';
import { cleanPhraseTranslation } from './phraseClean';
import { explainGeminiError } from './geminiError';

export type TranslationPatch = { id: string; translation: string };

export function geminiGenerateUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

export function geminiHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

function geminiOutputText(data: { candidates?: { content?: { parts?: { text?: string }[] } }[] }): string {
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}

async function generateGeminiText(
  apiKey: string,
  model: string,
  temperature: number,
  prompt: string,
  maxOutputTokens: number,
  abort?: AbortSignal
): Promise<string> {
  const timeout = AbortSignal.timeout(25000);
  const signal =
    abort && typeof AbortSignal.any === 'function' ? AbortSignal.any([timeout, abort]) : timeout;
  const response = await fetch(geminiGenerateUrl(model), {
    method: 'POST',
    headers: geminiHeaders(apiKey),
    signal,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(explainGeminiError(response.status, errData));
  }
  const text = geminiOutputText(await response.json());
  if (!text) throw new Error('Gemini boş cevap döndü.');
  return text;
}

export async function pingGemini(apiKey: string, model: string): Promise<string> {
  return generateGeminiText(apiKey, model, 0, 'Reply with exactly: OK', 8);
}

export async function translateWithGemini(
  cues: SubtitleCue[],
  apiKey: string,
  targetLang: string = 'tr',
  model: string = 'gemini-3.5-flash-lite',
  temperature: number = 0.2,
  customTerms: string[] = [],
  onProgress?: (completed: number, total: number) => void,
  termLockEnabled: boolean = true,
  aroundTime: number = 0,
  onBatch?: (patches: TranslationPatch[]) => void,
  abort?: AbortSignal
): Promise<SubtitleCue[]> {
  if (!apiKey) {
    throw new Error('Gemini API anahtarı girilmedi.');
  }

  const updatedCues = cues.map((c) => ({ ...c }));
  const pending = updatedCues.filter((c) => !c.translation?.trim());
  if (!pending.length) {
    onProgress?.(cues.length, cues.length);
    return updatedCues;
  }

  const batches = groupCuesForLiveTranslation(pending, aroundTime);
  let processedCount = cues.length - pending.length;
  let lastBatchErr: unknown = null;
  onProgress?.(processedCount, cues.length);

  for (const batch of batches) {
    if (abort?.aborted) break;
    const batchTerms = termLockEnabled ? extractGlossaryTerms(batch.cues.map((c) => c.text).join(' ')) : [];
    const allTerms = termLockEnabled ? Array.from(new Set([...batchTerms, ...customTerms])) : [];
    const systemInstruction = buildTranslationSystemPrompt(targetLang, allTerms);
    const maxOutputTokens = Math.min(2048, 96 * batch.cues.length + 64);
    const prompt = `${systemInstruction}

Translate these lecture lines into natural conversational ${targetLang.toUpperCase()}.
Keep each id in brackets exactly. One line per id.

Lines:
${batch.combinedText}`;

    let lastErr: unknown = null;
    let patches: TranslationPatch[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const retryHint =
          attempt === 0
            ? ''
            : '\nReply with ONLY lines like [cue-0] translation. Same ids as input.';
        const rawOutput = await generateGeminiText(
          apiKey,
          model,
          temperature,
          prompt + retryHint,
          maxOutputTokens,
          abort
        );
        const translationMap = parseBatchTranslation(rawOutput, batch.cues);
        if (translationMap.size === 0) throw new Error('empty batch parse');
        patches = [];
        for (const cue of batch.cues) {
          const translatedText = translationMap.get(cue.id);
          if (!translatedText) continue;
          const targetCue = updatedCues.find((c) => c.id === cue.id);
          if (!targetCue) continue;
          targetCue.translation = translatedText;
          patches.push({ id: cue.id, translation: translatedText });
        }
        if (!patches.length) throw new Error('empty batch parse');
        lastErr = null;
        break;
      } catch (err) {
        if (abort?.aborted || (err as { name?: string }).name === 'AbortError') {
          return updatedCues;
        }
        lastErr = err;
        console.error('[Duetto] Gemini batch error:', err);
      }
    }
    if (lastErr) {
      lastBatchErr = lastErr;
    } else if (patches.length) {
      onBatch?.(patches);
    }

    processedCount += batch.cues.length;
    onProgress?.(Math.min(processedCount, cues.length), cues.length);
  }

  if (abort?.aborted) return updatedCues;

  if (updatedCues.every((c) => !c.translation)) {
    const hint = lastBatchErr instanceof Error ? lastBatchErr.message : 'Gemini çeviri üretmedi.';
    throw new Error(hint);
  }

  return updatedCues;
}

export async function translatePhraseWithGemini(
  text: string,
  apiKey: string,
  targetLang: string,
  model: string = 'gemini-3.5-flash-lite',
  temperature: number = 0.2
): Promise<string> {
  if (!apiKey) throw new Error('Gemini API anahtarı girilmedi.');
  const lang = targetLang.toUpperCase();
  const prompt = `Translate this single lecture word or short phrase into ${lang}. If it is a software term, give a short ${lang} gloss (max 8 words) and keep the term. Reply with only the translation, no quotes.\n\n${text}`;
  const out = cleanPhraseTranslation(
    await generateGeminiText(apiKey, model, Math.min(temperature, 0.2), prompt, 64)
  );
  if (!out) throw new Error('empty gemini phrase');
  return out;
}

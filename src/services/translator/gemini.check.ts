import { explainGeminiError, classifyGeminiLimit, isGeminiQuotaError } from './geminiError.ts';
import { cleanPhraseTranslation } from './phraseClean.ts';
import { translationJobKey } from './jobKey.ts';
import type { SubtitleCue } from '../../types/index.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL', msg);
    process.exitCode = 1;
  } else {
    console.log('ok', msg);
  }
}

assert(cleanPhraseTranslation('  "hook"  ') === 'hook', 'strip quotes');
assert(cleanPhraseTranslation("«kanca»") === 'kanca', 'strip guillemets');
assert(cleanPhraseTranslation('ilk satır\nikinci') === 'ilk satır', 'first line only');
assert(cleanPhraseTranslation('') === '', 'empty stays empty');
assert(
  explainGeminiError(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }).includes('geçersiz'),
  'invalid key mapped'
);
assert(explainGeminiError(429, { error: { status: 'RESOURCE_EXHAUSTED' } }).includes('dakikalık'), 'rate limit mapped');
assert(
  explainGeminiError(429, { error: { message: 'Quota exceeded for GenerateRequestsPerDay' } }).includes('günlük'),
  'daily quota mapped'
);
assert(classifyGeminiLimit(429, { error: { message: 'requests per minute' } }) === 'rate', 'rpm classified');
assert(explainGeminiError(404, { error: { status: 'NOT_FOUND' } }).includes('Model'), '404 mapped');
assert(explainGeminiError(500, { error: { message: 'fail AIzaSyDummyKeyForTestOnly' } }) === 'Gemini hata (500)', 'redact key token');
assert(isGeminiQuotaError(new Error('Gemini dakikalık istek sınırı')), 'rate error detected');
assert(isGeminiQuotaError(new Error('Gemini günlük kotası doldu')), 'daily quota error detected');
assert(isGeminiQuotaError(new Error('RESOURCE_EXHAUSTED')), 'resource exhaustion detected');
assert(!isGeminiQuotaError(new Error('Gemini timeout')), 'non-quota error preserved');
const jobCues: SubtitleCue[] = [{ id: 'cue-1', startTime: 0, endTime: 1, text: 'hello' }];
assert(
  translationJobKey({
    cues: jobCues,
    lectureId: '9166924',
    sourceFingerprint: 'v1:en|english|/en.vtt',
    translationFingerprint: 'v1|tr|model',
  }) === '9166924|v1:en|english|/en.vtt|v1|tr|model|cue-1',
  'translation job key is deterministic'
);
assert(
  translationJobKey({ cues: jobCues, lectureId: '9166924' }) === null,
  'incomplete translation job identity is rejected'
);

if (process.exitCode) {
  console.error('gemini phrase check failed');
  process.exit(1);
}
console.log('gemini phrase check passed');

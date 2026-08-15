import { explainGeminiError } from './geminiError.ts';
import { cleanPhraseTranslation } from './phraseClean.ts';

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
assert(explainGeminiError(429, { error: { status: 'RESOURCE_EXHAUSTED' } }).includes('kota'), 'quota mapped');
assert(explainGeminiError(404, { error: { status: 'NOT_FOUND' } }).includes('Model'), '404 mapped');
assert(explainGeminiError(500, { error: { message: 'fail AIzaSyDummyKeyForTestOnly' } }) === 'Gemini hata (500)', 'redact key token');

if (process.exitCode) {
  console.error('gemini phrase check failed');
  process.exit(1);
}
console.log('gemini phrase check passed');

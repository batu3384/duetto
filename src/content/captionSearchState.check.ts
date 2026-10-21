import assert from 'node:assert/strict';
import { cacheMatchesCaptionSource, formatSourceStatus, shouldRetryCaptionSearch, shouldKeepLectureCues, acceptNativeCaption, clipCueText, nextRestCues } from './captionSearchState.ts';

assert(formatSourceStatus('Kaynak yok', 'English', false) === 'Kaynak yok', 'error wins');
assert(formatSourceStatus(null, 'English', true) === 'English', 'label beats loading');
assert(formatSourceStatus(null, '', true) === 'Altyazı aranıyor…', 'loading fallback');
assert(formatSourceStatus(null, '', false) === 'Kaynak yok', 'empty fallback');

assert(
  shouldRetryCaptionSearch({ hasCues: false, sourceError: true, nativeOnly: false }),
  'retry after failed search'
);
assert(
  shouldRetryCaptionSearch({ hasCues: true, sourceError: false, nativeOnly: true }),
  'retry native-only when tracks may arrive'
);
assert(
  !shouldRetryCaptionSearch({ hasCues: true, sourceError: false, nativeOnly: false }),
  'loaded vtt does not retry'
);

assert(cacheMatchesCaptionSource('v1:en|english|/en.vtt', ''), 'unknown source still uses lecture cache');
assert(cacheMatchesCaptionSource('v1:en|english|/en.vtt', 'v1:en|english|/en.vtt'), 'same fingerprint hits');
assert(!cacheMatchesCaptionSource('v1:en|english|/en.vtt', 'v1:tr|turkish|/tr.vtt'), 'lang mismatch misses');
assert(!cacheMatchesCaptionSource('', 'v1:en|english|/en.vtt'), 'legacy cache skipped once source known');

assert(
  shouldKeepLectureCues({ sameLecture: true, cueCount: 4, nativeOnly: false }),
  'real cues survive a video node swap'
);
assert(
  !shouldKeepLectureCues({ sameLecture: true, cueCount: 2, nativeOnly: true }),
  'native-only cues reload on the new node'
);
assert(
  !shouldKeepLectureCues({ sameLecture: false, cueCount: 4, nativeOnly: false }),
  'lecture change drops cues'
);

assert(acceptNativeCaption('', true, false) === false, 'unlabeled native text is not source');
assert(acceptNativeCaption('English', true, false) === true, 'source label accepted');
assert(acceptNativeCaption('Türkçe', false, true) === false, 'target label rejected');
assert(acceptNativeCaption('Deutsch', false, false) === true, 'other labeled caption can be source');

assert(clipCueText('  kısa  ') === 'kısa', 'clip trims');
assert(clipCueText('x'.repeat(600)).length === 500, 'clip caps cue text');

const many = Array.from({ length: 16 }, (_, i) => ({
  id: `c${i}`,
  startTime: i * 2,
  endTime: i * 2 + 2,
  text: 't',
  translation: i === 0 ? 'ok' : undefined,
}));
const rest = nextRestCues(many, 0);
assert(rest.map((cue) => cue.id).join(',') === 'c12,c13,c14,c15', 'rest starts after the live window');

console.log('captionSearchState check passed');

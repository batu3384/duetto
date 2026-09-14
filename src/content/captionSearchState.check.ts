import assert from 'node:assert/strict';
import { cacheMatchesCaptionSource, formatSourceStatus, shouldRetryCaptionSearch } from './captionSearchState.ts';

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

console.log('captionSearchState check passed');

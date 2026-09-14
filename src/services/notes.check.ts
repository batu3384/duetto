import assert from 'node:assert/strict';
import { noteSaveFeedback } from './noteSaveFeedback.ts';

assert(noteSaveFeedback(true, true) === 'Not + kare kaydedildi', 'kept frame');
assert(noteSaveFeedback(false, true) === 'Not kaydedildi (kare sığmadı)', 'quota drop');
assert(noteSaveFeedback(false, false) === 'Not kaydedildi (kare alınamadı)', 'no frame');

console.log('notes check passed');

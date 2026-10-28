import assert from 'node:assert/strict';
import { csvCell, wordsToCsv } from './words.ts';

assert(csvCell('hook') === '"hook"', 'plain cell');
assert(csvCell('say "hi"') === '"say ""hi"""', 'quote escape');
assert(csvCell('=cmd') === '"\'=cmd"', 'formula prefix');

const csv = wordsToCsv([
  {
    id: '1',
    word: 'hook',
    translation: 'kanca',
    lectureTitle: 'Intro',
    time: 12.8,
    createdAt: Date.parse('2026-10-28T10:00:00.000Z'),
  },
]);
assert(csv.startsWith('word,translation,lecture,time_sec,created_at\n'), 'header');
assert(csv.includes('"hook","kanca","Intro","12"'), 'row');

console.log('words check passed');

import {
  cueAtTime,
  cueTranslationCoverage,
  groupCuesForBatchTranslation,
  groupCuesForLiveTranslation,
  isRealSubtitleText,
  liveWindowCues,
  orderCuesForLiveTranslation,
  parseBatchTranslation,
  parseLabeledCueLines,
  parseVTT,
  stripGeminiFences,
  trackMatchesSource,
  vttTimeToSeconds,
} from './vttParser.ts';
import { extractGlossaryTerms } from './translator/glossary.ts';
import type { SubtitleCue } from '../types/index.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL', msg);
    process.exitCode = 1;
  } else {
    console.log('ok', msg);
  }
}

assert(!isRealSubtitleText('thumb-sprites.jpg#xywh=1,2,3,4'), 'sprite text rejected');
assert(isRealSubtitleText('Hello world'), 'dialogue accepted');
assert(Math.abs(vttTimeToSeconds('00:01:02.500') - 62.5) < 0.001, 'hms time');
assert(Math.abs(vttTimeToSeconds('01:02.500') - 62.5) < 0.001, 'ms time');

const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:02.000
Hello props

2
00:00:03.000 --> 00:00:04.000
thumb-sprites.jpg#xywh=0,0,1,1
`;
const cues = parseVTT(vtt);
assert(cues.length === 1 && cues[0].text === 'Hello props', 'parse skips sprite cue');

const fake: SubtitleCue[] = [
  { id: 'a', startTime: 0, endTime: 1, text: 'one' },
  { id: 'b', startTime: 1, endTime: 2, text: 'two' },
];
const batches = groupCuesForBatchTranslation(fake, 1);
assert(batches.length === 2 && batches[0].combinedText.startsWith('[a]'), 'batch uses cue id');

const terms = extractGlossaryTerms('use the React props and virtual DOM please');
assert(terms.includes('props') && terms.includes('virtual dom'), 'glossary n-gram + word');

const ids = new Set(['cue-0', 'cue-1']);
const labeled = parseLabeledCueLines('[cue-0] bir\n[cue-1] iki', ids);
assert(labeled.get('cue-0') === 'bir' && labeled.get('cue-1') === 'iki', 'id labeled parse');
const wrapped = parseLabeledCueLines('[cue-0] merhaba\ndünya\n[cue-1] tamam', ids);
assert(wrapped.get('cue-0') === 'merhaba dünya', 'continuation appends to last id');
const fenced = parseLabeledCueLines('```\n[cue-0] kanca\n```', ids);
assert(fenced.get('cue-0') === 'kanca', 'strips fences then parses');
const shifted = parseLabeledCueLines('alpha\nbeta', ids);
assert(shifted.size === 0, 'no positional fallback');
assert(parseLabeledCueLines('[cue-9] too big', ids).size === 0, 'unknown id dropped');
assert(stripGeminiFences('```json\n[cue-0] x\n```') === '[cue-0] x', 'fence strip');

const idxBatch: SubtitleCue[] = [
  { id: 'cue-12', startTime: 0, endTime: 1, text: 'one' },
  { id: 'cue-13', startTime: 1, endTime: 2, text: 'two' },
];
const fromIndex = parseBatchTranslation('[0] bir\n[1] iki', idxBatch);
assert(fromIndex.get('cue-12') === 'bir' && fromIndex.get('cue-13') === 'iki', 'batch-local [n] maps to cue id');
const mixed = parseBatchTranslation('[cue-12] bir\n[1] iki', idxBatch);
assert(mixed.get('cue-12') === 'bir' && mixed.get('cue-13') === 'iki', 'id + leftover index merge');
const unlabeled = parseBatchTranslation('alpha\nbeta', idxBatch);
assert(unlabeled.size === 0, 'unlabeled still rejected');

const liveCues: SubtitleCue[] = [
  { id: 'cue-0', startTime: 0, endTime: 1, text: 'a' },
  { id: 'cue-1', startTime: 1, endTime: 2, text: 'b' },
  { id: 'cue-2', startTime: 2, endTime: 3, text: 'c' },
  { id: 'cue-3', startTime: 3, endTime: 4, text: 'd' },
];
assert(liveWindowCues(liveCues, 2.2, 8, 1)[0].id === 'cue-1', 'live window includes one behind');
assert(liveWindowCues(liveCues, 2.2, 8, 1).some((c) => c.id === 'cue-2'), 'live window includes now');
const liveBatches = groupCuesForLiveTranslation(liveCues, 0.2, 3, 10);
assert(liveBatches[0].cues[0].id === 'cue-0' && liveBatches[0].cues.length === 3, 'first live batch is current window');
const midBatches = groupCuesForLiveTranslation(liveCues, 2.2, 3, 10);
assert(
  midBatches[0].cues[0].id === 'cue-2' && midBatches[0].cues.every((c) => c.startTime >= 2),
  'mid-lecture first batch is now+ahead not past'
);

const overlap = [
  { id: 'a', startTime: 0, endTime: 2, text: 'a' },
  { id: 'b', startTime: 1, endTime: 3, text: 'b' },
];
assert(cueAtTime(overlap, 1.5)?.id === 'b', 'overlap prefers later start');
assert(cueAtTime(overlap, 9) === null, 'gap is null');

assert(cueTranslationCoverage([{ id: 'a', startTime: 0, endTime: 1, text: 'x' }]) === 0, 'no trans');
assert(
  cueTranslationCoverage([
    { id: 'a', startTime: 0, endTime: 1, text: 'x', translation: 'y' },
    { id: 'b', startTime: 1, endTime: 2, text: 'z' },
  ]) === 0.5,
  'half coverage'
);

assert(trackMatchesSource('en', 'English', 'en'), 'en track');
assert(!trackMatchesSource('en', 'English', 'tr'), 'en not stolen for tr');
assert(trackMatchesSource('tr', 'Türkçe', 'tr'), 'tr label');

if (process.exitCode) {
  console.error('self-check failed');
  process.exit(1);
}
console.log('self-check passed');

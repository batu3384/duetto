import {
  captionSourceFingerprint,
  cleanVttText,
  cueAtTime,
  cueTranslationCoverage,
  groupCuesForBatchTranslation,
  groupCuesForLiveTranslation,
  isRealSubtitleText,
  isCaptionTrack,
  liveWindowCues,
  orderCuesForLiveTranslation,
  parseBatchTranslation,
  parseLabeledCueLines,
  parseVTT,
  selectCaptionResourceUrl,
  selectPreferredCaptionTrack,
  stripGeminiFences,
  trackMatchesSource,
  vttTimeToSeconds,
} from './vttParser.ts';
import { extractGlossaryTerms } from './translator/glossary.ts';
import { transcriptTranslationFingerprint } from './db.ts';
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
assert(Number.isNaN(vttTimeToSeconds('00:61.000')), 'invalid seconds rejected');

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
assert(cleanVttText('<i>Hello</i> &amp; world') === 'Hello & world', 'text entities cleaned');
assert(
  parseVTT('WEBVTT\n\n00:00:04.000 --> 00:00:03.000\nInvalid timing\n').length === 0,
  'invalid timing cue rejected'
);

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

const translationSettings = {
  targetLang: 'tr',
  geminiModel: 'gemini-2.5-flash-lite',
  geminiTemperature: 0.2,
  termLockEnabled: true,
  customProtectedTerms: ['React', 'hook'],
};
const translationFingerprint = transcriptTranslationFingerprint(translationSettings);
assert(
  translationFingerprint ===
    transcriptTranslationFingerprint({ ...translationSettings, customProtectedTerms: ['hook', 'React'] }),
  'translation fingerprint ignores term order'
);
assert(
  translationFingerprint !==
    transcriptTranslationFingerprint({ ...translationSettings, geminiModel: 'gemini-2.5-flash' }),
  'translation fingerprint changes with model'
);

assert(trackMatchesSource('eng', '', 'en'), 'iso639-2 eng matches en');
assert(trackMatchesSource('en', 'English', 'en'), 'en track');
assert(trackMatchesSource('en_US', 'English [Auto]', 'en'), 'en_US locale matches en');
assert(trackMatchesSource('en-GB', '', 'en'), 'en-GB matches en');
assert(trackMatchesSource('English', '', 'en'), 'english language name matches en');
assert(trackMatchesSource('', 'English [CC]', 'en'), 'english label matches en');
assert(trackMatchesSource('', 'EN [Auto]', 'en'), 'EN label matches en');
assert(!trackMatchesSource('en', 'English', 'tr'), 'en not stolen for tr');
assert(trackMatchesSource('tr', 'Türkçe', 'tr'), 'tr label');
const manualEnglish = { language: 'en', label: 'English', mode: 'hidden' };
const autoEnglish = { language: 'en', label: 'English (auto-generated)', mode: 'hidden' };
const showingAutoEnglish = { language: 'en', label: 'English (auto-generated)', mode: 'showing', kind: 'captions' };
const turkish = { language: 'tr', label: 'Türkçe', mode: 'showing', kind: 'captions' };
const descriptionEnglish = { language: 'en', label: 'English description', mode: 'hidden', kind: 'descriptions' };
manualEnglish.kind = 'captions';
autoEnglish.kind = 'captions';
assert(
  selectPreferredCaptionTrack([manualEnglish, showingAutoEnglish, turkish], 'en') === showingAutoEnglish,
  'showing source track wins'
);
assert(
  selectPreferredCaptionTrack([autoEnglish, manualEnglish], 'en') === manualEnglish,
  'manual source track wins when none showing'
);
assert(
  selectPreferredCaptionTrack([descriptionEnglish, manualEnglish], 'en') === manualEnglish,
  'description track is excluded'
);
assert(selectPreferredCaptionTrack([turkish], 'en') === null, 'unmatched caption is not used as source');
assert(
  selectPreferredCaptionTrack(
    [{ language: '', label: '', mode: 'showing', kind: 'captions' }],
    'en',
    'tr'
  )?.mode === 'showing',
  'visible showing track used when language metadata empty'
);
assert(
  selectPreferredCaptionTrack(
    [
      { language: '', label: '', mode: 'showing', kind: 'captions' },
      { language: 'tr', label: 'Türkçe', mode: 'hidden', kind: 'captions' },
    ],
    'en',
    'tr'
  ) === null,
  'unlabeled showing track is not guessed when other tracks exist'
);
assert(
  selectCaptionResourceUrl(
    ['https://cdn.udemy.com/captions/tr.vtt', 'https://vse-vod-subtitles.udemycdn.com/hash/file.vtt'],
    'en',
    'tr'
  ) === 'https://vse-vod-subtitles.udemycdn.com/hash/file.vtt',
  'untagged current vtt used despite leftover turkish'
);
assert(
  selectPreferredCaptionTrack([turkish, { language: 'pt', label: 'Português', kind: 'captions' }], 'en', 'tr')
    === null,
  'fallback does not guess unrelated language'
);
assert(
  selectPreferredCaptionTrack(
    [
      { language: 'tr', label: 'Türkçe', mode: 'showing', kind: 'captions' },
      { language: 'en', label: 'English', mode: 'hidden', kind: 'captions' },
    ],
    'en',
    'tr'
  )?.language === 'en',
  'hidden english wins over showing turkish'
);
assert(
  captionSourceFingerprint({ language: 'en', label: 'English', mode: 'hidden' }, '/captions/en.vtt') ===
    captionSourceFingerprint({ language: 'en', label: 'English', mode: 'showing' }, '/captions/en.vtt'),
  'source fingerprint ignores display mode'
);
assert(
  captionSourceFingerprint({ language: 'en', label: 'English' }, '/captions/en.vtt?token=one') ===
    captionSourceFingerprint({ language: 'en', label: 'English' }, '/captions/en.vtt?token=two'),
  'source fingerprint does not persist URL tokens'
);
assert(
  captionSourceFingerprint({ language: 'en', label: 'English' }, '/captions/en.vtt') !==
    captionSourceFingerprint({ language: 'en', label: 'English (auto-generated)' }, '/captions/en.vtt'),
  'source fingerprint changes with source label'
);
assert(isCaptionTrack({ kind: '' }), 'empty kind treated as caption');
assert(isCaptionTrack({ kind: 'subtitles' }), 'subtitles kind');
assert(!isCaptionTrack({ kind: 'descriptions' }), 'descriptions excluded');
assert(!isCaptionTrack({ kind: 'metadata' }), 'metadata excluded');
assert(
  selectPreferredCaptionTrack([{ language: 'en', label: 'English', kind: '' }], 'en')?.label === 'English',
  'empty-kind english track selectable'
);
assert(
  selectCaptionResourceUrl(
    [
      'https://cdn.udemy.com/captions/en.vtt?token=one',
      'https://cdn.udemy.com/captions/en.vtt?token=two',
    ],
    'en'
  ) === 'https://cdn.udemy.com/captions/en.vtt?token=two',
  'signed duplicate network captions keep latest url'
);
assert(
  selectCaptionResourceUrl(
    ['https://cdn.udemy.com/captions/en.vtt', 'https://cdn.udemy.com/captions/en-auto.vtt'],
    'en'
  ) === 'https://cdn.udemy.com/captions/en.vtt',
  'ambiguous network captions prefer manual over auto'
);
assert(
  selectCaptionResourceUrl(['https://vse-vod-subtitles.udemycdn.com/hash/file.vtt'], 'en') ===
    'https://vse-vod-subtitles.udemycdn.com/hash/file.vtt',
  'language-less udemy vtt still selected'
);
assert(
  selectCaptionResourceUrl(['https://cdn.udemy.com/captions/tr.vtt'], 'en', 'tr') === null,
  'target-language-only network caption rejected as source'
);
assert(
  selectCaptionResourceUrl(
    ['https://cdn.udemy.com/captions/tr.vtt', 'https://cdn.udemy.com/captions/en.vtt'],
    'en',
    'tr'
  ) === 'https://cdn.udemy.com/captions/en.vtt',
  'english network caption wins over turkish'
);
assert(
  selectCaptionResourceUrl(['https://cdn.udemy.com/thumb-sprites/en.vtt'], 'en') === null,
  'sprite network caption rejected'
);
assert(
  selectCaptionResourceUrl(['https://evil.example/captions/en.vtt'], 'en') === null,
  'external network caption rejected'
);

if (process.exitCode) {
  console.error('self-check failed');
  process.exit(1);
}
console.log('self-check passed');

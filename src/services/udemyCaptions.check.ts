import assert from 'node:assert/strict';
import {
  captionLocaleMatches,
  findUdemyCourseId,
  isNumericLectureId,
  waitForTrackCues,
} from './udemyCaptions.ts';

assert(captionLocaleMatches('en_US', 'en'), 'en_US matches en');
assert(captionLocaleMatches('en-GB', 'en'), 'en-GB matches en');
assert(!captionLocaleMatches('tr_TR', 'en'), 'tr does not match en');
assert(captionLocaleMatches('tr', 'tr'), 'tr matches tr');
assert(isNumericLectureId('123456'), 'numeric lecture id');
assert(!isNumericLectureId('/course/foo/learn/lecture'), 'pathname is not lecture id');

const doc = {
  querySelector: (sel: string) =>
    sel === '[data-course-id]' ? { getAttribute: (a: string) => (a === 'data-course-id' ? '12345' : null) } : null,
} as Document;
assert(findUdemyCourseId(doc) === '12345', 'data-course-id parsed');

const doc2 = {
  querySelector: () => null,
  documentElement: { innerHTML: '{"course_id": 98765}' },
} as Document;
assert(findUdemyCourseId(doc2) === null, 'does not scrape full innerHTML');

class FakeTrack {
  cues: { length: number } | null = null;
  private listeners = new Set<() => void>();
  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener);
  }
}

const empty = new FakeTrack();
const started = Date.now();
await waitForTrackCues(empty, 40);
assert(Date.now() - started < 200, 'cue wait times out');
assert(empty.listeners.size === 0, 'cue wait removes listener');

console.log('udemyCaptions check passed');

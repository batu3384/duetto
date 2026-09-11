import assert from 'node:assert/strict';
import {
  captionLocaleMatches,
  findUdemyCourseId,
} from './udemyCaptions.ts';

assert(captionLocaleMatches('en_US', 'en'), 'en_US matches en');
assert(captionLocaleMatches('en-GB', 'en'), 'en-GB matches en');
assert(!captionLocaleMatches('tr_TR', 'en'), 'tr does not match en');
assert(captionLocaleMatches('tr', 'tr'), 'tr matches tr');

const doc = {
  querySelector: (sel: string) =>
    sel === '[data-course-id]' ? { getAttribute: (a: string) => (a === 'data-course-id' ? '12345' : null) } : null,
  documentElement: { innerHTML: '' },
} as Document;
assert(findUdemyCourseId(doc) === '12345', 'data-course-id parsed');

const doc2 = {
  querySelector: () => null,
  documentElement: { innerHTML: '{"course_id": 98765}' },
} as Document;
assert(findUdemyCourseId(doc2) === '98765', 'course_id from page json');

console.log('udemyCaptions check passed');

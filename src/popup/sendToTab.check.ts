import assert from 'node:assert/strict';
import { isUdemyPageUrl } from './sendToTab.ts';

assert(isUdemyPageUrl('https://www.udemy.com/course/foo/learn/lecture/1'), 'www udemy');
assert(isUdemyPageUrl('https://udemy.com/'), 'apex udemy');
assert(!isUdemyPageUrl('https://evil.com/udemy.com'), 'foreign host rejected');
assert(!isUdemyPageUrl(''), 'empty rejected');

console.log('sendToTab check passed');

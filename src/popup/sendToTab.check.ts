import assert from 'node:assert/strict';
import { isUdemyPageUrl, tabSendFailure } from './sendToTab.ts';

assert(isUdemyPageUrl('https://www.udemy.com/course/foo/learn/lecture/1'), 'www udemy');
assert(isUdemyPageUrl('https://udemy.com/'), 'apex udemy');
assert(!isUdemyPageUrl('https://evil.com/udemy.com'), 'foreign host rejected');
assert(!isUdemyPageUrl(''), 'empty rejected');
assert(tabSendFailure(false, null) === 'Açık Udemy ders sekmesi yok.', 'missing tab');
assert(tabSendFailure(true, 'Receiving end does not exist.')?.includes('yenile'), 'dead content script');
assert(tabSendFailure(true, null) === null, 'delivered');

console.log('sendToTab check passed');

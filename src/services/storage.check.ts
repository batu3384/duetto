import {
  attachSecret,
  blobKeyFromSettings,
  dropSecret,
  keyIsConfigured,
  isStaleExtensionError,
  mergePublicPersist,
  mergeSettings,
  readSecretFromBag,
  senderMayReadSecrets,
  settingsForPage,
} from './storage.ts';
import { DEFAULT_SETTINGS } from '../types/index.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL', msg);
    process.exitCode = 1;
  } else {
    console.log('ok', msg);
  }
}

const withKey = { ...DEFAULT_SETTINGS, geminiApiKey: 'AIzaSyDummyKeyForTestOnly' };
assert(dropSecret(withKey).geminiApiKey === '', 'dropSecret strips key');
assert(attachSecret(dropSecret(withKey), 'abc').geminiApiKey === 'abc', 'attachSecret sets key');
assert(mergeSettings(withKey).geminiApiKey === '', 'mergeSettings never keeps blob key');
assert(settingsForPage(withKey).geminiApiKey === '', 'settingsForPage strips');
assert(settingsForPage(withKey).geminiKeyConfigured === true, 'settingsForPage flags configured key');
assert(settingsForPage(dropSecret(withKey)).geminiKeyConfigured === false, 'settingsForPage flags missing key');
assert(
  settingsForPage({ ...dropSecret(withKey), geminiKeyConfigured: true }).geminiKeyConfigured === true,
  'settingsForPage keeps public flag without exposing key'
);
assert(keyIsConfigured({ geminiApiKey: '', geminiKeyConfigured: true }) === true, 'keyIsConfigured uses flag');
assert(keyIsConfigured({ geminiApiKey: '', geminiKeyConfigured: false }) === false, 'keyIsConfigured empty');
assert(mergeSettings({ geminiKeyConfigured: true }).geminiKeyConfigured === true, 'mergeSettings keeps flag');
assert(mergeSettings({}).geminiKeyConfigured === false, 'mergeSettings default flag false');
assert(blobKeyFromSettings(withKey) === 'AIzaSyDummyKeyForTestOnly', 'blobKeyFromSettings reads');
assert(blobKeyFromSettings({}).length === 0, 'blobKeyFromSettings empty');
assert(readSecretFromBag({ geminiApiKey: '  xyz  ' }) === 'xyz', 'secret bag object');
assert(readSecretFromBag('  raw  ') === 'raw', 'secret bag string');
assert(readSecretFromBag(null) === '', 'secret bag null');
assert(senderMayReadSecrets({ tab: { id: 1 }, url: 'https://www.udemy.com/' }) === false, 'content cannot read secrets');
assert(senderMayReadSecrets({ url: 'chrome-extension://abc/popup.html' }) === true, 'popup may read secrets');
assert(senderMayReadSecrets({ origin: 'chrome-extension://abc' }) === true, 'popup origin may read secrets');
assert(senderMayReadSecrets({ tab: { id: 2 }, id: 'ext' }) === false, 'content with extension id still denied');

const preserved = mergePublicPersist(dropSecret(withKey), { geminiApiKey: 'keep-me' });
assert(preserved.geminiApiKey === 'keep-me', 'public persist never clobbers leftover blob key');
assert(mergePublicPersist(withKey, {}).geminiApiKey === '', 'no leftover means stripped public blob');
const flagged = { ...dropSecret(withKey), geminiKeyConfigured: true };
assert(mergePublicPersist(flagged, {}).geminiKeyConfigured === true, 'public persist keeps configured flag');
assert(DEFAULT_SETTINGS.subStyle.dockAmbient === true, 'default dock ambient on');
assert(
  mergeSettings({ subStyle: { dockOpacity: 100, dockAmbient: true } }).subStyle.dockOpacity === 0,
  'legacy ambient 100 → 0'
);
assert(
  mergeSettings({ subStyle: { dockOpacity: 55, dockAmbient: true } }).subStyle.dockOpacity === 55,
  'chosen dock opacity kept'
);
assert(isStaleExtensionError(new Error('Extension context invalidated.')), 'stale extension detected');
assert(!isStaleExtensionError(new Error('quota exceeded')), 'non-stale error');

if (process.exitCode) {
  console.error('storage check failed');
  process.exit(1);
}
console.log('storage check passed');

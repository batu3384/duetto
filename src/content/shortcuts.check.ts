import assert from 'node:assert/strict';
import { isDuettoShortcutKey } from './shortcutKeys.ts';

assert(isDuettoShortcutKey('s'), 's is shortcut');
assert(isDuettoShortcutKey('D'), 'D is shortcut');
assert(isDuettoShortcutKey('['), 'bracket is shortcut');
assert(!isDuettoShortcutKey('s', true, false, false), 'ctrl+s is not Duetto');
assert(!isDuettoShortcutKey('k'), 'k is not shortcut');

console.log('shortcuts check passed');

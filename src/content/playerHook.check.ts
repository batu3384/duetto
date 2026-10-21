import assert from 'node:assert/strict';
import { chooseLectureVideo, displayedPlaybackSpeed } from './playerHook.ts';

const video = (paused: boolean, readyState: number, videoWidth: number) =>
  ({ paused, readyState, videoWidth }) as HTMLVideoElement;

const paused = video(true, 4, 1920);
const playing = video(false, 4, 1280);
const unloaded = video(false, 0, 0);

assert(chooseLectureVideo([paused, playing]) === playing, 'playing lecture video wins');
assert(chooseLectureVideo([unloaded, paused]) === paused, 'ready video wins');
assert(chooseLectureVideo([]) === null, 'empty video list returns null');
assert(displayedPlaybackSpeed(true, 1.25, 2.5) === 1.25, 'silence skip hides boosted rate');
assert(displayedPlaybackSpeed(false, 1.25, 1.5) === 1.5, 'normal rate is the video rate');

console.log('playerHook check passed');

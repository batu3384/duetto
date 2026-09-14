import assert from 'node:assert/strict';
import { chooseLectureVideo } from './playerHook.ts';

const video = (paused: boolean, readyState: number, videoWidth: number) =>
  ({ paused, readyState, videoWidth }) as HTMLVideoElement;

const paused = video(true, 4, 1920);
const playing = video(false, 4, 1280);
const unloaded = video(false, 0, 0);

assert(chooseLectureVideo([paused, playing]) === playing, 'playing lecture video wins');
assert(chooseLectureVideo([unloaded, paused]) === paused, 'ready video wins');
assert(chooseLectureVideo([]) === null, 'empty video list returns null');

console.log('playerHook check passed');

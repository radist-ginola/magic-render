const assert = require('node:assert/strict');
const { buildExactDurationComposition, calculateTotalDuration, removeTrack, reorderTracks, shuffleTracks } = require('../.test-dist/main/services/audio/playlistAlgorithms.js');

const tracks = [
  { path: 'A.mp3', durationSeconds: 30, order: 0 },
  { path: 'B.mp3', durationSeconds: 50, order: 1 },
  { path: 'C.mp3', durationSeconds: 20, order: 2 },
];

assert.equal(calculateTotalDuration(tracks), 100);
assert.deepEqual(reorderTracks(tracks, 2, 0).map((t) => t.path), ['C.mp3', 'A.mp3', 'B.mp3']);
assert.deepEqual(removeTrack(tracks, 1).map((t) => t.path), ['A.mp3', 'C.mp3']);
assert.deepEqual(shuffleTracks(['A', 'B', 'C'], () => 0.9), ['A', 'B', 'C']);

const short = buildExactDurationComposition([{ path: 'A.mp3', durationSeconds: 30, order: 0 }, { path: 'B.mp3', durationSeconds: 20, order: 1 }], 75, false);
assert.equal(short.totalDurationSeconds, 75);
assert.deepEqual(short.segments.map((s) => [s.path, s.durationSeconds]), [['A.mp3', 30], ['B.mp3', 20], ['A.mp3', 25]]);

const long = buildExactDurationComposition([{ path: 'A.mp3', durationSeconds: 60, order: 0 }, { path: 'B.mp3', durationSeconds: 50, order: 1 }], 75, false);
assert.equal(long.totalDurationSeconds, 75);
assert.deepEqual(long.segments.map((s) => [s.path, s.durationSeconds]), [['A.mp3', 60], ['B.mp3', 15]]);

const one = buildExactDurationComposition([{ path: 'A.mp3', durationSeconds: 20, order: 0 }], 55, false);
assert.equal(one.totalDurationSeconds, 55);
assert.equal(one.segments.length, 3);

const shuffled = buildExactDurationComposition(tracks, 60, true, () => 0.99);
assert.equal(shuffled.shuffle, true);
assert.equal(shuffled.totalDurationSeconds, 60);
assert.equal(shuffled.orderedTracks.length, 3);

console.log('PLAYLIST ALGORITHM TEST: PASSED (3 composition scenarios).');

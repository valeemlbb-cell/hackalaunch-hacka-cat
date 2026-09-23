/**
 * Fixture market source.
 *
 * Replays a recorded/synthetic tape from fixtures/tape.json. Fully offline and
 * fully deterministic, which is what makes the tests, the backtest and the
 * demo video reproducible on any machine with no keys and no network.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseAll } from './source.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TAPE = path.resolve(HERE, '../../fixtures/tape.json');

/**
 * @param {object} [options]
 * @param {string} [options.file] path to a tape JSON file
 * @param {number} [options.startAt] epoch ms for frame 0
 */
export function createFixtureSource(options = {}) {
  const file = options.file ?? DEFAULT_TAPE;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const frames = raw.frames ?? [];
  if (frames.length === 0) throw new Error(`tape ${file} has no frames`);

  const frameSeconds = raw.frameSeconds ?? 60;
  const startAt = options.startAt ?? raw.startAt ?? Date.UTC(2026, 8, 24, 0, 0, 0);
  let cursor = 0;

  return {
    name: 'fixture',
    frameSeconds,
    frameCount: frames.length,
    /** Wall-clock time the current frame represents. */
    clock() {
      return startAt + cursor * frameSeconds * 1000;
    },
    reset() { cursor = 0; },
    get cursor() { return cursor; },
    /** Returns the current frame and advances. Loops at the end of the tape. */
    async listTokens() {
      const frame = frames[Math.min(cursor, frames.length - 1)];
      cursor = Math.min(cursor + 1, frames.length);
      return normaliseAll(frame);
    },
    /** Peek without advancing (used by the backtester's mark-to-market pass). */
    async peek() {
      return normaliseAll(frames[Math.min(cursor, frames.length - 1)]);
    },
    get exhausted() { return cursor >= frames.length; },
  };
}

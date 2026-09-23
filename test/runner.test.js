import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runnerScore, exitSignal, volumeAccelerationRatio, ageMinutes,
  RUNNER_THRESHOLD, MIN_AGE_MINUTES,
} from '../src/strategy/runner.js';
import { loadConfig } from '../src/config.js';

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const config = loadConfig({}, {});

function snapshot(overrides = {}) {
  return {
    mint: 'M', symbol: 'MEOW',
    priceUsd: 0.001,
    liquidityUsd: 60000,
    volume24hUsd: 240000, // baseline 10k/hour
    volume5mUsd: 5000, // 60k/hour -> 6x
    priceChange5m: 12,
    priceChange1h: 55,
    priceChange24h: 90,
    holders: 800,
    holdersDelta1h: 120,
    createdAt: NOW - 120 * 60000,
    ...overrides,
  };
}

test('volumeAccelerationRatio compares 5m to the 24h hourly baseline', () => {
  assert.equal(volumeAccelerationRatio({ volume5mUsd: 5000, volume24hUsd: 240000 }), 6);
  assert.equal(volumeAccelerationRatio({ volume5mUsd: 0, volume24hUsd: 240000 }), 0);
  // No history at all but trading now: treat as maximally hot, not as zero.
  assert.ok(volumeAccelerationRatio({ volume5mUsd: 100, volume24hUsd: 0 }) > 10);
});

test('ageMinutes handles a missing creation time', () => {
  assert.equal(ageMinutes({ createdAt: NOW - 600000 }, NOW), 10);
  assert.equal(ageMinutes({}, NOW), Number.POSITIVE_INFINITY);
});

test('a hot token is a runner', () => {
  const result = runnerScore(snapshot(), NOW);
  assert.ok(result.isRunner, `expected runner, got ${result.score}`);
  assert.ok(result.score >= RUNNER_THRESHOLD);
  assert.equal(result.breakdown.accelRatio, 6);
});

test('a flat token is not a runner', () => {
  const result = runnerScore(snapshot({
    priceChange5m: 0, priceChange1h: 0, volume5mUsd: 800, holdersDelta1h: 0,
  }), NOW);
  assert.equal(result.isRunner, false);
});

test('a bleeding token is heavily discounted', () => {
  const hot = runnerScore(snapshot(), NOW).score;
  const bleeding = runnerScore(snapshot({ priceChange5m: -9, priceChange1h: -30 }), NOW);
  assert.ok(bleeding.score < hot * 0.5);
  assert.ok(bleeding.notes.some((note) => note.includes('bleeding')));
});

test('a token younger than the minimum age is almost fully discounted', () => {
  const fresh = runnerScore(snapshot({ createdAt: NOW - 60000 }), NOW);
  const mature = runnerScore(snapshot(), NOW);
  assert.ok(fresh.score < mature.score * 0.3);
  assert.ok(fresh.notes[0].includes('too fresh'));
  assert.ok(ageMinutes({ createdAt: NOW - 60000 }, NOW) < MIN_AGE_MINUTES);
});

test('an old thin token is stale, an old deep token is established', () => {
  const twoYears = NOW - 730 * 24 * 60 * 60000;
  const thin = runnerScore(snapshot({ createdAt: twoYears, liquidityUsd: 40000 }), NOW);
  assert.ok(thin.notes.some((note) => note.includes('stale')));

  const deep = runnerScore(snapshot({ createdAt: twoYears, liquidityUsd: 4000000 }), NOW);
  assert.ok(deep.notes.some((note) => note.includes('established')));
  assert.ok(deep.score > thin.score, 'POPCAT must not be disqualified for being old');
});

test('scores are bounded and the breakdown is complete', () => {
  const extreme = runnerScore(snapshot({
    priceChange5m: 5000, priceChange1h: 9000, volume5mUsd: 1e9, liquidityUsd: 1e9,
  }), NOW);
  assert.ok(extreme.score <= 1);
  for (const key of ['volumeAcceleration', 'shortMomentum', 'mediumMomentum', 'liquidityDepth', 'holderGrowth']) {
    assert.ok(Number.isFinite(extreme.breakdown[key]), `missing ${key}`);
  }
});

// --- exits -----------------------------------------------------------------

const position = {
  mint: 'M', symbol: 'MEOW', qty: 1000, entryPrice: 0.001,
  costUsd: 1, feesUsd: 0, openedAt: NOW - 10 * 60000, peakPrice: 0.001,
};

test('take profit fires at the configured gain', () => {
  const signal = exitSignal(position, snapshot({ priceUsd: 0.001 * (1 + config.takeProfitPct / 100 + 0.01) }), config, NOW);
  assert.ok(signal.exit);
  assert.match(signal.reason, /take profit/);
});

test('stop loss fires at the configured loss', () => {
  const signal = exitSignal(position, snapshot({ priceUsd: 0.001 * (1 - config.stopLossPct / 100 - 0.01) }), config, NOW);
  assert.ok(signal.exit);
  assert.match(signal.reason, /stop loss/);
});

test('trailing stop fires only when the position is in profit', () => {
  const peaked = { ...position, peakPrice: 0.002 };
  const inProfit = exitSignal(peaked, snapshot({ priceUsd: 0.0014 }), config, NOW);
  assert.ok(inProfit.exit);
  assert.match(inProfit.reason, /trailing stop/);

  const underwater = exitSignal({ ...position, peakPrice: 0.00101 }, snapshot({ priceUsd: 0.00095 }), config, NOW);
  assert.equal(underwater.exit, false);
});

test('max hold time forces an exit', () => {
  const old = { ...position, openedAt: NOW - (config.maxHoldMinutes + 1) * 60000 };
  const signal = exitSignal(old, snapshot({ priceUsd: 0.00101 }), config, NOW);
  assert.ok(signal.exit);
  assert.match(signal.reason, /max hold/);
});

test('dead volume forces an exit after the grace period', () => {
  const signal = exitSignal(position, snapshot({ priceUsd: 0.00101, volume5mUsd: 10 }), config, NOW);
  assert.ok(signal.exit);
  assert.match(signal.reason, /volume died/);
});

test('a healthy position is held', () => {
  const signal = exitSignal(position, snapshot({ priceUsd: 0.0011 }), config, NOW);
  assert.equal(signal.exit, false);
  assert.equal(signal.reason, 'holding');
});

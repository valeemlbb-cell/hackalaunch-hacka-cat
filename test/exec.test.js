import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaperExecutor, priceImpactBps } from '../src/exec/paper.js';
import { hashRecord, buildRecord, MEMO_TAG, explorerUrl, loadKeypair } from '../src/exec/devnet.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({}, {});
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const snapshot = { mint: 'MEOW', symbol: 'MEOW', priceUsd: 0.001, liquidityUsd: 100000 };

test('price impact grows with size and is zero for nothing', () => {
  assert.equal(priceImpactBps(0, 100000), 0);
  assert.ok(priceImpactBps(10000, 100000) > priceImpactBps(100, 100000));
  assert.equal(priceImpactBps(100, 0), 10000, 'unknown depth is assumed terrible');
});

test('a paper buy fills above the quote and charges fees', async () => {
  const executor = createPaperExecutor(config);
  const fill = await executor.buy({ snapshot, sizeUsd: 100, at: NOW });
  assert.ok(fill.price > fill.quotedPrice, 'buys pay slippage');
  assert.equal(fill.costUsd, 100);
  assert.ok(fill.feesUsd > 0);
  assert.ok(Math.abs(fill.qty * fill.price - 100) < 1e-6);
});

test('a paper sell fills below the quote', async () => {
  const executor = createPaperExecutor(config);
  const position = { mint: 'MEOW', symbol: 'MEOW', qty: 100000 };
  const fill = await executor.sell({ snapshot, position, at: NOW });
  assert.ok(fill.price < fill.quotedPrice, 'sells pay slippage');
  assert.ok(fill.proceedsUsd > 0);
  assert.ok(fill.feesUsd > 0);
});

test('a round trip at an unchanged price loses exactly the costs', async () => {
  const executor = createPaperExecutor(config);
  const buy = await executor.buy({ snapshot, sizeUsd: 100, at: NOW });
  const sell = await executor.sell({ snapshot, position: { ...snapshot, qty: buy.qty }, at: NOW });
  const net = sell.proceedsUsd - sell.feesUsd - buy.costUsd - buy.feesUsd;
  assert.ok(net < 0, 'a flat round trip must not be profitable');
  assert.ok(net > -10, `costs are implausibly large: ${net}`);
});

test('a thin pool costs more than a deep pool', async () => {
  const executor = createPaperExecutor(config);
  const deep = await executor.buy({ snapshot, sizeUsd: 500, at: NOW });
  const thin = await executor.buy({ snapshot: { ...snapshot, liquidityUsd: 9000 }, sizeUsd: 500, at: NOW });
  assert.ok(thin.slippageBps > deep.slippageBps);
});

// --- devnet anchoring (pure parts, no network) -----------------------------

test('buildRecord produces a compact, complete record', () => {
  const record = buildRecord('buy', {
    mint: 'MEOW', symbol: 'MEOW', price: 0.0012345678901234, qty: 1234.5678,
    costUsd: 100.123456, feesUsd: 0.5, at: NOW,
  }, { c: 1, r: 0.8 });
  assert.equal(record.k, 'buy');
  assert.equal(record.m, 'MEOW');
  assert.equal(record.t, NOW);
  assert.equal(record.c, 1);
  assert.ok(JSON.stringify(record).length < 300, 'must fit comfortably in a memo');
});

test('the hash chain is deterministic and order sensitive', () => {
  const record = buildRecord('buy', {
    mint: 'M', symbol: 'S', price: 1, qty: 1, costUsd: 1, feesUsd: 0, at: NOW,
  });
  const first = hashRecord(record, 'genesis');
  assert.equal(first, hashRecord(record, 'genesis'), 'same input -> same hash');
  assert.notEqual(first, hashRecord(record, 'other-prev'), 'prev hash is part of the hash');
  assert.notEqual(first, hashRecord({ ...record, q: 2 }, 'genesis'), 'payload is part of the hash');
  assert.equal(first.length, 32);
});

test('the memo tag is stable — verifiers key off it', () => {
  assert.equal(MEMO_TAG, 'CATNIP1');
});

test('explorer links point at devnet', () => {
  assert.match(explorerUrl('sig123'), /^https:\/\/explorer\.solana\.com\/tx\/sig123\?cluster=devnet$/);
});

test('a missing keypair fails loudly with instructions, never a default', () => {
  assert.throws(() => loadKeypair(undefined), /CATNIP_KEYPAIR is not set/);
  assert.throws(() => loadKeypair('./definitely-not-here.json'), /not found/);
});

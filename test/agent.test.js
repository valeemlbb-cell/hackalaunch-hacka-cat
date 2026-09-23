import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent } from '../src/agent.js';
import { createFixtureSource } from '../src/market/fixture.js';
import { createPaperExecutor } from '../src/exec/paper.js';
import { loadConfig } from '../src/config.js';
import { normaliseSnapshot, normaliseAll } from '../src/market/source.js';
import { mapPair } from '../src/market/dexscreener.js';

const config = loadConfig({}, {});

function newAgent(overrides = {}) {
  const source = createFixtureSource({});
  const executor = createPaperExecutor(loadConfig(overrides, {}));
  return {
    source,
    agent: createAgent({ config: loadConfig(overrides, {}), source, executor }),
  };
}

test('the fixture tape loads and advances', async () => {
  const source = createFixtureSource({});
  assert.ok(source.frameCount > 10);
  const first = await source.listTokens();
  assert.ok(first.length > 5);
  assert.equal(source.cursor, 1);
  const second = await source.listTokens();
  assert.notEqual(first[0].priceUsd, second[0].priceUsd, 'the tape must actually move');
  source.reset();
  assert.equal(source.cursor, 0);
});

test('a full backtest is profitable on the reference tape and is deterministic', async () => {
  const runOnce = async () => {
    const { source, agent } = newAgent();
    while (!source.exhausted) await agent.tick(source.clock());
    await agent.liquidate(source.clock());
    return agent.summary();
  };
  const first = await runOnce();
  const second = await runOnce();

  assert.deepEqual(first, second, 'the same tape must produce the same result every time');
  assert.ok(first.closedTrades >= 4, `expected trades, got ${first.closedTrades}`);
  assert.ok(first.returnPct > 0, `expected a positive return, got ${first.returnPct}`);
  assert.equal(first.openPositions, 0, 'liquidate must flatten the book');
});

test('the agent never buys a trap, a dog or a honeypot', async () => {
  const { source, agent } = newAgent();
  while (!source.exhausted) await agent.tick(source.clock());
  const bought = new Set(agent.portfolio.trades.filter((t) => t.side === 'buy').map((t) => t.symbol));

  for (const forbidden of ['CATALYST', 'CONCAT', 'DOGWIFCAT', 'BONKAI']) {
    assert.ok(!bought.has(forbidden), `${forbidden} is not a cat and must never be bought`);
  }
  assert.ok(!bought.has('KITTYX'), 'KITTYX has a live mint authority — the risk guard must block it');
  assert.ok(!bought.has('KUCING'), 'KUCING is too thin to exit — the liquidity guard must block it');
  assert.ok(bought.size > 0, 'the agent must actually trade something');
});

test('the position cap is respected for the whole run', async () => {
  const { source, agent } = newAgent({ maxOpenPositions: 2 });
  while (!source.exhausted) {
    await agent.tick(source.clock());
    assert.ok(
      Object.keys(agent.portfolio.positions).length <= 2,
      'the agent exceeded its own open-position cap',
    );
  }
});

test('the agent never spends cash it does not have', async () => {
  const { source, agent } = newAgent({ startingCashUsd: 60, maxPositionUsd: 40 });
  while (!source.exhausted) {
    await agent.tick(source.clock());
    assert.ok(agent.portfolio.cashUsd >= -1e-6, `negative cash: ${agent.portfolio.cashUsd}`);
  }
});

test('every buy carries the evidence that produced it', async () => {
  const { source, agent } = newAgent();
  let buys = 0;
  while (!source.exhausted) {
    const { decisions } = await agent.tick(source.clock());
    for (const decision of decisions.filter((d) => d.kind === 'buy')) {
      buys += 1;
      assert.ok(decision.catScore > 0 && decision.runnerScore > 0);
      assert.match(decision.why, /cat signal/);
      assert.match(decision.why, /baseline/);
    }
  }
  assert.ok(buys > 0);
});

test('skips are reported with a reason', async () => {
  const { source, agent } = newAgent();
  const { decisions } = await agent.tick(source.clock());
  const skips = decisions.filter((d) => d.kind === 'skip');
  assert.ok(skips.length > 0);
  assert.ok(skips.every((skip) => typeof skip.reason === 'string' && skip.reason.length > 0));
});

// --- market source hardening ----------------------------------------------

test('unusable snapshots are dropped rather than crashing the loop', () => {
  assert.equal(normaliseSnapshot(null), null);
  assert.equal(normaliseSnapshot({ mint: 'M' }), null, 'missing fields');
  assert.equal(normaliseSnapshot({
    mint: 'M', symbol: 'S', priceUsd: 0, liquidityUsd: 1, createdAt: 1,
  }), null, 'zero price');

  const cleaned = normaliseAll([
    null,
    { mint: 'M', symbol: 'S', priceUsd: '0.5', liquidityUsd: 'oops', createdAt: 1 },
  ]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].priceUsd, 0.5);
  assert.equal(cleaned[0].liquidityUsd, 0, 'garbage numbers become 0, not NaN');
});

test('dexscreener pairs map onto snapshots, non-solana pairs are ignored', () => {
  const pair = {
    chainId: 'solana', dexId: 'pumpswap', url: 'https://dexscreener.com/x',
    baseToken: { address: 'Mint1', name: 'Solana Cat', symbol: 'SOLCAT' },
    priceUsd: '0.00003625',
    volume: { h24: 46870.47, m5: 14.29 },
    priceChange: { m5: -1.38, h1: -18.66, h24: -61.75 },
    txns: { h1: { buys: 21, sells: 17 } },
    liquidity: { usd: 20772.4 },
    pairCreatedAt: 1789672541000,
  };
  const snapshot = mapPair(pair);
  assert.equal(snapshot.mint, 'Mint1');
  assert.equal(snapshot.symbol, 'SOLCAT');
  assert.equal(snapshot.priceUsd, 0.00003625);
  assert.equal(snapshot.liquidityUsd, 20772.4);
  assert.equal(snapshot.holdersDelta1h, 4);
  assert.equal(mapPair({ ...pair, chainId: 'ethereum' }), null);
  assert.equal(mapPair(null), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkToken, checkPortfolio, positionSizeUsd } from '../src/risk/guards.js';
import { loadConfig } from '../src/config.js';
import { createPortfolio, openPosition } from '../src/portfolio.js';

const config = loadConfig({}, {});
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

const healthy = {
  mint: 'GoodMint', symbol: 'MEOW',
  priceUsd: 0.001, liquidityUsd: 60000, volume24hUsd: 300000,
  holders: 900, topHolderPct: 8, lpBurnedPct: 100,
  mintAuthority: null, freezeAuthority: null,
};

test('a healthy token passes every hard filter', () => {
  const result = checkToken(healthy, config);
  assert.ok(result.pass, result.violations.join('; '));
});

test('thin liquidity is rejected', () => {
  const result = checkToken({ ...healthy, liquidityUsd: 500 }, config);
  assert.equal(result.pass, false);
  assert.match(result.violations[0], /liquidity/);
});

test('a live mint authority is rejected', () => {
  const result = checkToken({ ...healthy, mintAuthority: 'RugAuth' }, config);
  assert.equal(result.pass, false);
  assert.ok(result.violations.some((v) => v.includes('mint authority')));
});

test('a freeze authority is rejected', () => {
  const result = checkToken({ ...healthy, freezeAuthority: 'FreezeAuth' }, config);
  assert.ok(result.violations.some((v) => v.includes('freeze authority')));
});

test('a concentrated top holder is rejected', () => {
  const result = checkToken({ ...healthy, topHolderPct: 60 }, config);
  assert.ok(result.violations.some((v) => v.includes('top holder')));
});

test('unknown holder count is tolerated, a tiny known one is not', () => {
  assert.ok(checkToken({ ...healthy, holders: 0 }, config).pass, 'unknown must not block');
  assert.equal(checkToken({ ...healthy, holders: 3 }, config).pass, false);
});

test('a token with no price is rejected', () => {
  assert.equal(checkToken({ ...healthy, priceUsd: 0 }, config).pass, false);
});

// --- portfolio-level -------------------------------------------------------

function portfolioWith(positions = 0) {
  let portfolio = createPortfolio(config.startingCashUsd);
  for (let index = 0; index < positions; index += 1) {
    portfolio = openPosition(portfolio, {
      mint: `Mint${index}`, symbol: `S${index}`, qty: 100, price: 0.1,
      costUsd: 20, feesUsd: 0.1, at: NOW,
    });
  }
  return portfolio;
}

test('an empty portfolio accepts a new position', () => {
  assert.ok(checkPortfolio(healthy, portfolioWith(0), config, NOW).pass);
});

test('the open position cap is enforced', () => {
  const result = checkPortfolio(healthy, portfolioWith(config.maxOpenPositions), config, NOW);
  assert.equal(result.pass, false);
  assert.ok(result.violations.some((v) => v.includes('open positions')));
});

test('a token already held is refused', () => {
  const portfolio = openPosition(portfolioWith(0), {
    mint: healthy.mint, symbol: 'MEOW', qty: 1, price: 1, costUsd: 1, feesUsd: 0, at: NOW,
  });
  const result = checkPortfolio(healthy, portfolio, config, NOW);
  assert.ok(result.violations.includes('already holding'));
});

test('blocklisted mints are refused', () => {
  const blocked = loadConfig({ blocklist: [healthy.mint] }, {});
  const result = checkPortfolio(healthy, portfolioWith(0), blocked, NOW);
  assert.ok(result.violations.includes('mint is blocklisted'));
});

test('the re-entry cooldown is enforced', () => {
  const portfolio = { ...portfolioWith(0), lastExitAt: { [healthy.mint]: NOW - 60000 } };
  const result = checkPortfolio(healthy, portfolio, config, NOW);
  assert.ok(result.violations.includes('re-entry cooldown active'));
});

test('the daily loss limit flattens the agent', () => {
  const portfolio = { ...portfolioWith(0), realisedPnlUsd: -config.dailyLossLimitUsd - 1 };
  const result = checkPortfolio(healthy, portfolio, config, NOW);
  assert.ok(result.violations.some((v) => v.includes('daily loss limit')));
});

// --- sizing ----------------------------------------------------------------

test('size scales with confidence and never exceeds the per-trade cap', () => {
  const portfolio = portfolioWith(0);
  const low = positionSizeUsd({ portfolio, config, confidence: 0.1, liquidityUsd: 1e9 });
  const high = positionSizeUsd({ portfolio, config, confidence: 1, liquidityUsd: 1e9 });
  assert.ok(high > low);
  assert.ok(high <= config.maxPositionUsd);
});

test('size is capped by the pool so the agent never becomes the pool', () => {
  const portfolio = portfolioWith(0);
  const size = positionSizeUsd({ portfolio, config, confidence: 1, liquidityUsd: 1000 });
  assert.ok(size <= 1000 * (config.maxPoolSharePct / 100) + 1e-9, `got ${size}`);
});

test('size never exceeds the cash on hand', () => {
  const broke = { ...portfolioWith(0), cashUsd: 7 };
  assert.ok(positionSizeUsd({ portfolio: broke, config, confidence: 1, liquidityUsd: 1e9 }) <= 7);
});

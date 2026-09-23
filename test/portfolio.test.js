import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPortfolio, openPosition, closePosition, markPeak, equityUsd, summarise,
} from '../src/portfolio.js';

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const buyFill = {
  mint: 'MEOW', symbol: 'MEOW', qty: 1000, price: 0.1,
  costUsd: 100, feesUsd: 0.5, at: NOW,
};

test('a new portfolio is all cash', () => {
  const portfolio = createPortfolio(1000);
  assert.equal(portfolio.cashUsd, 1000);
  assert.equal(equityUsd(portfolio), 1000);
  assert.deepEqual(portfolio.positions, {});
});

test('opening a position debits cash and fees without mutating the input', () => {
  const before = createPortfolio(1000);
  const after = openPosition(before, buyFill);
  assert.equal(before.cashUsd, 1000, 'input portfolio must not be mutated');
  assert.equal(after.cashUsd, 899.5);
  assert.equal(after.feesUsd, 0.5);
  assert.equal(after.positions.MEOW.qty, 1000);
});

test('opening beyond the cash on hand throws', () => {
  const portfolio = createPortfolio(50);
  assert.throws(() => openPosition(portfolio, buyFill), /insufficient cash/);
});

test('closing at a profit credits cash and books realised PnL', () => {
  let portfolio = openPosition(createPortfolio(1000), buyFill);
  portfolio = closePosition(portfolio, {
    mint: 'MEOW', symbol: 'MEOW', qty: 1000, price: 0.15,
    proceedsUsd: 150, feesUsd: 0.75, at: NOW + 60000,
  }, 'take profit');

  assert.equal(portfolio.cashUsd, 899.5 + 149.25);
  assert.equal(portfolio.realisedPnlUsd, 149.25 - 100 - 0.5);
  assert.equal(portfolio.wins, 1);
  assert.equal(portfolio.losses, 0);
  assert.equal(Object.keys(portfolio.positions).length, 0);
  assert.equal(portfolio.lastExitAt.MEOW, NOW + 60000);
});

test('closing at a loss counts as a loss', () => {
  let portfolio = openPosition(createPortfolio(1000), buyFill);
  portfolio = closePosition(portfolio, {
    mint: 'MEOW', symbol: 'MEOW', qty: 1000, price: 0.05,
    proceedsUsd: 50, feesUsd: 0.25, at: NOW + 60000,
  }, 'stop loss');
  assert.ok(portfolio.realisedPnlUsd < 0);
  assert.equal(portfolio.losses, 1);
});

test('closing an unknown position throws', () => {
  assert.throws(
    () => closePosition(createPortfolio(1000), { mint: 'NOPE', proceedsUsd: 1, feesUsd: 0, at: NOW }),
    /no open position/,
  );
});

test('markPeak only ratchets upwards', () => {
  let portfolio = openPosition(createPortfolio(1000), buyFill);
  portfolio = markPeak(portfolio, 'MEOW', 0.2);
  assert.equal(portfolio.positions.MEOW.peakPrice, 0.2);
  portfolio = markPeak(portfolio, 'MEOW', 0.05);
  assert.equal(portfolio.positions.MEOW.peakPrice, 0.2);
  assert.equal(markPeak(portfolio, 'UNKNOWN', 9), portfolio);
});

test('equity marks open positions to market, falling back to cost', () => {
  const portfolio = openPosition(createPortfolio(1000), buyFill);
  assert.equal(equityUsd(portfolio, { MEOW: 0.2 }), 899.5 + 200);
  assert.equal(equityUsd(portfolio, {}), 899.5 + 100, 'no price -> hold at cost');
});

test('summarise reports a win rate and a return', () => {
  let portfolio = openPosition(createPortfolio(1000), buyFill);
  portfolio = closePosition(portfolio, {
    mint: 'MEOW', symbol: 'MEOW', qty: 1000, price: 0.15,
    proceedsUsd: 150, feesUsd: 0.75, at: NOW + 60000,
  }, 'tp');
  const summary = summarise(portfolio, {});
  assert.equal(summary.closedTrades, 1);
  assert.equal(summary.winRatePct, 100);
  assert.ok(summary.returnPct > 0);
});

test('an empty portfolio summarises without dividing by zero', () => {
  const summary = summarise(createPortfolio(500), {});
  assert.equal(summary.winRatePct, 0);
  assert.equal(summary.returnPct, 0);
});

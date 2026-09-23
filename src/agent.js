/**
 * The agent loop.
 *
 * One tick:
 *   1. pull a market snapshot
 *   2. manage open positions first (exits before entries — never add risk
 *      while a stop is waiting to fire)
 *   3. score the rest: cat? runner? safe? affordable?
 *   4. execute, account, log
 *
 * The loop is pure with respect to the portfolio: it threads an immutable
 * portfolio object through, so a tick can be replayed and a backtest and a
 * live run execute identical code.
 */

import { selectCats, CAT_THRESHOLD } from './cat/detector.js';
import { runnerScore, exitSignal, RUNNER_THRESHOLD } from './strategy/runner.js';
import { checkToken, checkPortfolio, positionSizeUsd } from './risk/guards.js';
import {
  createPortfolio, openPosition, closePosition, markPeak, summarise, equityUsd,
} from './portfolio.js';

export function createAgent({
  config, source, executor, logger,
  catThreshold = CAT_THRESHOLD,
  runnerThreshold = RUNNER_THRESHOLD,
}) {
  let portfolio = createPortfolio(config.startingCashUsd);
  let lastPrices = {};

  async function tick(now = Date.now()) {
    const snapshots = await source.listTokens(now);
    const byMint = new Map(snapshots.map((snapshot) => [snapshot.mint, snapshot]));
    lastPrices = Object.fromEntries(snapshots.map((s) => [s.mint, s.priceUsd]));
    const decisions = [];

    // --- 1. manage what we already hold ------------------------------------
    for (const position of Object.values(portfolio.positions)) {
      const snapshot = byMint.get(position.mint);
      if (!snapshot) continue;
      portfolio = markPeak(portfolio, position.mint, snapshot.priceUsd);
      const current = portfolio.positions[position.mint];
      const signal = exitSignal(current, snapshot, config, now);
      if (!signal.exit) continue;

      const fill = await executor.sell({ snapshot, position: current, at: now, reason: signal.reason });
      portfolio = closePosition(portfolio, fill, signal.reason);
      const trade = portfolio.trades[portfolio.trades.length - 1];
      const decision = {
        kind: 'sell',
        symbol: fill.symbol,
        mint: fill.mint,
        price: fill.price,
        proceedsUsd: fill.proceedsUsd,
        pnlUsd: trade.pnlUsd,
        reason: signal.reason,
        signature: fill.anchor?.signature,
        explorer: fill.anchor?.explorer,
        at: now,
      };
      decisions.push(decision);
      logger?.event(decision);
    }

    // --- 2. hunt new cat runners -------------------------------------------
    const cats = selectCats(snapshots, catThreshold);
    for (const candidate of cats) {
      const runner = runnerScore(candidate, now);
      if (!runner.isRunner || runner.score < runnerThreshold) {
        decisions.push(recordSkip(candidate, `not running (${runner.score.toFixed(2)})`, now, logger));
        continue;
      }

      const tokenCheck = checkToken(candidate, config);
      if (!tokenCheck.pass) {
        decisions.push(recordSkip(candidate, tokenCheck.violations[0], now, logger));
        continue;
      }

      const portfolioCheck = checkPortfolio(candidate, portfolio, config, now);
      if (!portfolioCheck.pass) {
        decisions.push(recordSkip(candidate, portfolioCheck.violations[0], now, logger));
        continue;
      }

      const confidence = candidate.cat.score * runner.score;
      const sizeUsd = positionSizeUsd({
        portfolio, config, confidence, liquidityUsd: candidate.liquidityUsd,
      });
      if (sizeUsd < 5) {
        decisions.push(recordSkip(candidate, `size $${sizeUsd.toFixed(2)} below minimum`, now, logger));
        continue;
      }

      const fill = await executor.buy({
        snapshot: candidate,
        sizeUsd,
        at: now,
        catScore: Number(candidate.cat.score.toFixed(3)),
        runnerScore: Number(runner.score.toFixed(3)),
      });
      portfolio = openPosition(portfolio, fill, {
        catScore: candidate.cat.score,
        runnerScore: runner.score,
        reason: `${candidate.cat.reason} | ${describeRunner(runner)}`,
      });

      const decision = {
        kind: 'buy',
        symbol: fill.symbol,
        mint: fill.mint,
        price: fill.price,
        costUsd: fill.costUsd,
        catScore: candidate.cat.score,
        runnerScore: runner.score,
        why: `${candidate.cat.reason} | ${describeRunner(runner)}`,
        signature: fill.anchor?.signature,
        explorer: fill.anchor?.explorer,
        at: now,
      };
      decisions.push(decision);
      logger?.event(decision);
    }

    return { decisions, portfolio, snapshots };
  }

  return {
    tick,
    get portfolio() { return portfolio; },
    get lastPrices() { return lastPrices; },
    summary: () => summarise(portfolio, lastPrices),
    equity: () => equityUsd(portfolio, lastPrices),
    /** Close everything at the last seen price (end of a backtest or Ctrl-C). */
    async liquidate(now = Date.now()) {
      const closed = [];
      for (const position of Object.values(portfolio.positions)) {
        const price = lastPrices[position.mint] ?? position.entryPrice;
        const snapshot = { mint: position.mint, symbol: position.symbol, priceUsd: price, liquidityUsd: 1e9 };
        const fill = await executor.sell({ snapshot, position, at: now, reason: 'liquidate' });
        portfolio = closePosition(portfolio, fill, 'liquidate');
        closed.push(fill);
        logger?.event({
          kind: 'sell',
          symbol: fill.symbol,
          mint: fill.mint,
          price: fill.price,
          proceedsUsd: fill.proceedsUsd,
          pnlUsd: portfolio.trades[portfolio.trades.length - 1].pnlUsd,
          reason: 'liquidate',
          signature: fill.anchor?.signature,
          at: now,
        });
      }
      return closed;
    },
  };
}

function recordSkip(candidate, reason, at, logger) {
  const decision = {
    kind: 'skip', symbol: candidate.symbol, mint: candidate.mint, reason, at,
  };
  logger?.event(decision);
  return decision;
}

function describeRunner(runner) {
  return `vol ${runner.breakdown.accelRatio}x baseline, run=${runner.score.toFixed(2)}`;
}

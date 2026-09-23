/**
 * Portfolio state.
 *
 * Pure, immutable helpers: every function returns a NEW portfolio object and
 * never mutates its input. That makes the agent loop replayable and makes the
 * backtester and the live runner share exactly the same accounting code.
 */

/** @typedef {{mint:string,symbol:string,qty:number,entryPrice:number,costUsd:number,feesUsd:number,openedAt:number,peakPrice:number,catScore:number,runnerScore:number}} Position */

export function createPortfolio(startingCashUsd) {
  return Object.freeze({
    startingCashUsd,
    cashUsd: startingCashUsd,
    positions: Object.freeze({}),
    lastExitAt: Object.freeze({}),
    realisedPnlUsd: 0,
    feesUsd: 0,
    trades: Object.freeze([]),
    wins: 0,
    losses: 0,
  });
}

/** Open a position from a filled buy. */
export function openPosition(portfolio, fill, meta = {}) {
  const totalCost = fill.costUsd + fill.feesUsd;
  if (totalCost > portfolio.cashUsd + 1e-9) {
    throw new Error(`insufficient cash: need $${totalCost.toFixed(2)}, have $${portfolio.cashUsd.toFixed(2)}`);
  }
  const position = Object.freeze({
    mint: fill.mint,
    symbol: fill.symbol,
    qty: fill.qty,
    entryPrice: fill.price,
    costUsd: fill.costUsd,
    feesUsd: fill.feesUsd,
    openedAt: fill.at,
    peakPrice: fill.price,
    catScore: meta.catScore ?? 0,
    runnerScore: meta.runnerScore ?? 0,
    reason: meta.reason ?? '',
  });
  return Object.freeze({
    ...portfolio,
    cashUsd: Number((portfolio.cashUsd - totalCost).toFixed(6)),
    feesUsd: Number((portfolio.feesUsd + fill.feesUsd).toFixed(6)),
    positions: Object.freeze({ ...portfolio.positions, [fill.mint]: position }),
    trades: Object.freeze([...portfolio.trades, Object.freeze({ side: 'buy', ...fill })]),
  });
}

/** Record a new peak price for an open position (for the trailing stop). */
export function markPeak(portfolio, mint, price) {
  const position = portfolio.positions[mint];
  if (!position || price <= position.peakPrice) return portfolio;
  const updated = Object.freeze({ ...position, peakPrice: price });
  return Object.freeze({
    ...portfolio,
    positions: Object.freeze({ ...portfolio.positions, [mint]: updated }),
  });
}

/** Close a position from a filled sell. */
export function closePosition(portfolio, fill, reason = '') {
  const position = portfolio.positions[fill.mint];
  if (!position) throw new Error(`no open position for ${fill.mint}`);

  const proceeds = fill.proceedsUsd - fill.feesUsd;
  const pnl = proceeds - position.costUsd - position.feesUsd;
  const positions = { ...portfolio.positions };
  delete positions[fill.mint];

  return Object.freeze({
    ...portfolio,
    cashUsd: Number((portfolio.cashUsd + proceeds).toFixed(6)),
    feesUsd: Number((portfolio.feesUsd + fill.feesUsd).toFixed(6)),
    realisedPnlUsd: Number((portfolio.realisedPnlUsd + pnl).toFixed(6)),
    wins: portfolio.wins + (pnl > 0 ? 1 : 0),
    losses: portfolio.losses + (pnl <= 0 ? 1 : 0),
    positions: Object.freeze(positions),
    lastExitAt: Object.freeze({ ...portfolio.lastExitAt, [fill.mint]: fill.at }),
    trades: Object.freeze([
      ...portfolio.trades,
      Object.freeze({ side: 'sell', ...fill, pnlUsd: Number(pnl.toFixed(6)), reason }),
    ]),
  });
}

/** Mark-to-market equity given a price lookup. */
export function equityUsd(portfolio, priceByMint = {}) {
  const open = Object.values(portfolio.positions).reduce((sum, position) => {
    const price = Number(priceByMint[position.mint]);
    const value = Number.isFinite(price) && price > 0 ? price * position.qty : position.costUsd;
    return sum + value;
  }, 0);
  return Number((portfolio.cashUsd + open).toFixed(6));
}

/** Human-readable performance summary. */
export function summarise(portfolio, priceByMint = {}) {
  const equity = equityUsd(portfolio, priceByMint);
  const closed = portfolio.wins + portfolio.losses;
  return {
    startingCashUsd: portfolio.startingCashUsd,
    cashUsd: portfolio.cashUsd,
    equityUsd: equity,
    returnPct: Number((((equity - portfolio.startingCashUsd) / portfolio.startingCashUsd) * 100).toFixed(2)),
    realisedPnlUsd: portfolio.realisedPnlUsd,
    feesUsd: portfolio.feesUsd,
    openPositions: Object.keys(portfolio.positions).length,
    closedTrades: closed,
    wins: portfolio.wins,
    losses: portfolio.losses,
    winRatePct: closed > 0 ? Number(((portfolio.wins / closed) * 100).toFixed(1)) : 0,
  };
}

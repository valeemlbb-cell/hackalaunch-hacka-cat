/**
 * Risk guards.
 *
 * Hard filters run BEFORE any sizing happens. A token that fails any guard is
 * never traded, no matter how cat or how green it is. This is deliberately
 * boring code: it is the part that stops the agent from buying a honeypot.
 */

/**
 * Evaluate the hard safety filters for one token.
 *
 * @returns {{pass:boolean, violations:string[]}}
 */
export function checkToken(snapshot = {}, config) {
  const violations = [];

  const liquidity = Number(snapshot.liquidityUsd) || 0;
  if (liquidity < config.minLiquidityUsd) {
    violations.push(`liquidity $${liquidity.toFixed(0)} < $${config.minLiquidityUsd}`);
  }

  const volume24h = Number(snapshot.volume24hUsd) || 0;
  if (volume24h < config.minVolume24hUsd) {
    violations.push(`24h volume $${volume24h.toFixed(0)} < $${config.minVolume24hUsd}`);
  }

  const holders = Number(snapshot.holders) || 0;
  if (holders > 0 && holders < config.minHolders) {
    violations.push(`${holders} holders < ${config.minHolders}`);
  }

  if (snapshot.mintAuthority) {
    violations.push('mint authority not revoked');
  }
  if (snapshot.freezeAuthority) {
    violations.push('freeze authority set');
  }

  const topHolderPct = Number(snapshot.topHolderPct);
  if (Number.isFinite(topHolderPct) && topHolderPct > config.maxTopHolderPct) {
    violations.push(`top holder ${topHolderPct.toFixed(1)}% > ${config.maxTopHolderPct}%`);
  }

  const lpBurnedPct = Number(snapshot.lpBurnedPct);
  if (Number.isFinite(lpBurnedPct) && lpBurnedPct < config.minLpBurnedPct) {
    violations.push(`LP burned ${lpBurnedPct.toFixed(0)}% < ${config.minLpBurnedPct}%`);
  }

  const price = Number(snapshot.priceUsd) || 0;
  if (price <= 0) violations.push('no usable price');

  return { pass: violations.length === 0, violations };
}

/**
 * Portfolio-level checks: exposure caps, position count, cooldown, blocklist.
 */
export function checkPortfolio(snapshot, portfolio, config, now = Date.now()) {
  const violations = [];

  if (config.blocklist.includes(snapshot.mint)) {
    violations.push('mint is blocklisted');
  }
  if (portfolio.positions[snapshot.mint]) {
    violations.push('already holding');
  }

  const openCount = Object.keys(portfolio.positions).length;
  if (openCount >= config.maxOpenPositions) {
    violations.push(`${openCount} open positions >= ${config.maxOpenPositions}`);
  }

  const lastExit = portfolio.lastExitAt[snapshot.mint];
  if (lastExit && now - lastExit < config.reentryCooldownMinutes * 60000) {
    violations.push('re-entry cooldown active');
  }

  const deployed = Object.values(portfolio.positions)
    .reduce((sum, position) => sum + position.costUsd, 0);
  const exposurePct = portfolio.startingCashUsd > 0
    ? (deployed / portfolio.startingCashUsd) * 100
    : 100;
  if (exposurePct >= config.maxTotalExposurePct) {
    violations.push(`exposure ${exposurePct.toFixed(0)}% >= ${config.maxTotalExposurePct}%`);
  }

  if (portfolio.realisedPnlUsd <= -Math.abs(config.dailyLossLimitUsd)) {
    violations.push('daily loss limit hit — agent is flat for the day');
  }

  return { pass: violations.length === 0, violations };
}

/**
 * Position size in USD.
 *
 * Base fraction of starting cash, scaled by how confident the agent is
 * (cat score x runner score), then clamped by the per-trade cap, the cash on
 * hand, and a liquidity cap so the agent never becomes the pool.
 */
export function positionSizeUsd({ portfolio, config, confidence, liquidityUsd }) {
  const base = portfolio.startingCashUsd * (config.basePositionPct / 100);
  const scaled = base * (0.5 + Math.min(1, Math.max(0, confidence)));
  const liquidityCap = (Number(liquidityUsd) || 0) * (config.maxPoolSharePct / 100);
  const size = Math.min(scaled, config.maxPositionUsd, portfolio.cashUsd, liquidityCap);
  return Math.max(0, Number(size.toFixed(2)));
}

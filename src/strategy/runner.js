/**
 * Runner detection.
 *
 * A "runner" is a token that is moving right now: price up, volume
 * accelerating against its own baseline, liquidity deep enough to get out, and
 * young enough that the move is not already over.
 *
 * Every component is bounded in [0,1] and the breakdown is returned so a trade
 * can be explained ("bought because volume was 9x baseline, not because the
 * price was green").
 */

export const RUNNER_WEIGHTS = Object.freeze({
  volumeAcceleration: 0.34,
  shortMomentum: 0.26,
  mediumMomentum: 0.16,
  liquidityDepth: 0.14,
  holderGrowth: 0.10,
});

/** A runner must clear this composite score before the agent will consider it. */
export const RUNNER_THRESHOLD = 0.55;

/** Trades are refused outside this age band (minutes). */
export const MIN_AGE_MINUTES = 3;
export const MAX_AGE_MINUTES = 60 * 48;

/**
 * Above this liquidity a token is an established market, not a fresh launch.
 * POPCAT is two years old and still runs; penalising it for age would mean the
 * agent can only ever trade brand-new coins, which is the opposite of "trade
 * ALL the cat runners".
 */
export const ESTABLISHED_LIQUIDITY_USD = 250000;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Map a value onto [0,1] with a soft knee at `mid`. */
function saturate(value, mid) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clamp01(value / (value + mid));
}

/**
 * Volume acceleration: the last 5 minutes annualised to an hour, compared with
 * the token's own average hour over 24h. 1.0 means "normal", 10 means the tape
 * just woke up.
 */
export function volumeAccelerationRatio(snapshot) {
  const volume5m = Number(snapshot.volume5mUsd) || 0;
  const volume24h = Number(snapshot.volume24hUsd) || 0;
  if (volume24h <= 0) return volume5m > 0 ? 12 : 0;
  const baselinePerHour = volume24h / 24;
  if (baselinePerHour <= 0) return 0;
  const currentPerHour = volume5m * 12;
  return currentPerHour / baselinePerHour;
}

/** Minutes since the pool was created. */
export function ageMinutes(snapshot, now = Date.now()) {
  const createdAt = Number(snapshot.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return Number.POSITIVE_INFINITY;
  return (now - createdAt) / 60000;
}

/**
 * Score a token snapshot as a runner.
 *
 * @returns {{score:number,isRunner:boolean,breakdown:object,notes:string[]}}
 */
export function runnerScore(snapshot = {}, now = Date.now()) {
  const notes = [];

  const accelRatio = volumeAccelerationRatio(snapshot);
  const volumeAcceleration = saturate(accelRatio, 4);

  const change5m = Number(snapshot.priceChange5m) || 0;
  const change1h = Number(snapshot.priceChange1h) || 0;

  // Short momentum rewards +0..+40% over 5 minutes, and punishes bleeding.
  const shortMomentum = change5m <= 0 ? 0 : clamp01(change5m / 40);
  const mediumMomentum = change1h <= 0 ? 0 : clamp01(change1h / 120);

  const liquidityDepth = saturate(Number(snapshot.liquidityUsd) || 0, 25000);

  const holders = Number(snapshot.holders) || 0;
  const holdersDelta = Number(snapshot.holdersDelta1h) || 0;
  const holderGrowth = holders > 0 ? clamp01(holdersDelta / Math.max(20, holders * 0.15)) : 0;

  const components = {
    volumeAcceleration, shortMomentum, mediumMomentum, liquidityDepth, holderGrowth,
  };

  let score = 0;
  for (const [key, weight] of Object.entries(RUNNER_WEIGHTS)) score += components[key] * weight;

  const age = ageMinutes(snapshot, now);
  const established = (Number(snapshot.liquidityUsd) || 0) >= ESTABLISHED_LIQUIDITY_USD;
  if (age < MIN_AGE_MINUTES) {
    notes.push(`too fresh (${age.toFixed(1)}m < ${MIN_AGE_MINUTES}m)`);
    score *= 0.2;
  } else if (age > MAX_AGE_MINUTES && !established) {
    notes.push(`stale (${(age / 60).toFixed(1)}h)`);
    score *= 0.5;
  } else if (age > MAX_AGE_MINUTES) {
    notes.push('established market — age penalty waived');
  }

  if (change5m < 0 && change1h < 0) {
    notes.push('bleeding on both timeframes');
    score *= 0.3;
  }

  score = clamp01(score);
  return {
    score: Number(score.toFixed(4)),
    isRunner: score >= RUNNER_THRESHOLD,
    breakdown: {
      ...components,
      accelRatio: Number(accelRatio.toFixed(3)),
      ageMinutes: Number.isFinite(age) ? Number(age.toFixed(1)) : null,
      established,
    },
    notes,
  };
}

/**
 * Exit signal for an open position. The agent is a momentum trader, so it
 * leaves on target, on stop, on time, or when the tape goes quiet.
 */
export function exitSignal(position, snapshot, config, now = Date.now()) {
  const price = Number(snapshot.priceUsd) || 0;
  if (price <= 0) return { exit: false, reason: 'no price' };

  const pnlPct = ((price - position.entryPrice) / position.entryPrice) * 100;

  if (pnlPct >= config.takeProfitPct) {
    return { exit: true, reason: `take profit ${pnlPct.toFixed(1)}%`, pnlPct };
  }
  if (pnlPct <= -config.stopLossPct) {
    return { exit: true, reason: `stop loss ${pnlPct.toFixed(1)}%`, pnlPct };
  }

  const peak = Math.max(position.peakPrice ?? position.entryPrice, price);
  const drawdownPct = ((peak - price) / peak) * 100;
  if (pnlPct > 0 && drawdownPct >= config.trailingStopPct) {
    return { exit: true, reason: `trailing stop, -${drawdownPct.toFixed(1)}% off peak`, pnlPct };
  }

  const heldMinutes = (now - position.openedAt) / 60000;
  if (heldMinutes >= config.maxHoldMinutes) {
    return { exit: true, reason: `max hold ${heldMinutes.toFixed(0)}m`, pnlPct };
  }

  if (volumeAccelerationRatio(snapshot) < 0.4 && heldMinutes > 5) {
    return { exit: true, reason: 'volume died', pnlPct };
  }

  return { exit: false, reason: 'holding', pnlPct, peakPrice: peak };
}

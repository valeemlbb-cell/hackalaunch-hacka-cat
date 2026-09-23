/**
 * Configuration.
 *
 * Every knob has a safe default, can be overridden by environment variables,
 * and is validated at start-up. No secret has a default: if a key is required
 * for the selected mode and it is missing, the agent refuses to start.
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = Object.freeze({
  // Identity / network
  cluster: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',

  // Capital (paper USD; devnet mode still trades paper size and anchors on-chain)
  startingCashUsd: 1000,
  basePositionPct: 8,
  maxPositionUsd: 150,
  maxPoolSharePct: 1.5,
  maxOpenPositions: 5,
  maxTotalExposurePct: 60,
  dailyLossLimitUsd: 200,

  // Exits
  takeProfitPct: 45,
  stopLossPct: 18,
  trailingStopPct: 22,
  maxHoldMinutes: 90,
  reentryCooldownMinutes: 30,

  // Safety filters
  minLiquidityUsd: 8000,
  minVolume24hUsd: 15000,
  minHolders: 50,
  maxTopHolderPct: 25,
  minLpBurnedPct: 0,

  // Execution model
  takerFeeBps: 30,
  baseSlippageBps: 50,
  priorityFeeUsd: 0.02,

  // Agent loop
  tickSeconds: 30,
  blocklist: [],
});

const NUMERIC_KEYS = Object.keys(DEFAULTS)
  .filter((key) => typeof DEFAULTS[key] === 'number');

const ENV_PREFIX = 'CATNIP_';

function envKey(key) {
  return ENV_PREFIX + key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase();
}

/** Minimal .env reader — no dependency, no overwriting of real env vars. */
export function loadDotEnv(file = '.env') {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return {};
  const parsed = {};
  for (const rawLine of fs.readFileSync(resolved, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    parsed[key] = value;
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return parsed;
}

/**
 * Build a validated config from defaults + env + explicit overrides.
 * @throws {Error} when a value is present but unusable.
 */
export function loadConfig(overrides = {}, env = process.env) {
  const config = { ...DEFAULTS };
  const errors = [];

  for (const key of NUMERIC_KEYS) {
    const raw = env[envKey(key)];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      errors.push(`${envKey(key)}="${raw}" is not a number`);
      continue;
    }
    config[key] = value;
  }

  if (env[envKey('cluster')]) config.cluster = env[envKey('cluster')];
  if (env[envKey('rpcUrl')]) config.rpcUrl = env[envKey('rpcUrl')];
  if (env[envKey('blocklist')]) {
    config.blocklist = env[envKey('blocklist')].split(',').map((s) => s.trim()).filter(Boolean);
  }

  Object.assign(config, overrides);

  // --- validation ---------------------------------------------------------
  if (config.cluster === 'mainnet-beta' || /mainnet/i.test(String(config.rpcUrl))) {
    errors.push(
      'mainnet is refused by design: CATNIP executes on devnet or on paper only. '
      + 'Set CATNIP_CLUSTER=devnet.',
    );
  }
  if (config.startingCashUsd <= 0) errors.push('startingCashUsd must be > 0');
  if (config.basePositionPct <= 0 || config.basePositionPct > 100) {
    errors.push('basePositionPct must be within (0,100]');
  }
  if (config.maxOpenPositions < 1) errors.push('maxOpenPositions must be >= 1');
  if (config.stopLossPct <= 0) errors.push('stopLossPct must be > 0');
  if (config.takeProfitPct <= 0) errors.push('takeProfitPct must be > 0');
  if (config.maxPoolSharePct <= 0 || config.maxPoolSharePct > 100) {
    errors.push('maxPoolSharePct must be within (0,100]');
  }
  if (!Array.isArray(config.blocklist)) errors.push('blocklist must be an array');

  if (errors.length > 0) {
    throw new Error(`invalid configuration:\n  - ${errors.join('\n  - ')}`);
  }
  return Object.freeze(config);
}

export { DEFAULTS, envKey };

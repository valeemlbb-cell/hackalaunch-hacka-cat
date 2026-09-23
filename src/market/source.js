/**
 * Market source interface.
 *
 * A source is anything with `name` and `async listTokens(now)` returning
 * TokenSnapshot objects. Two are shipped:
 *
 *   fixture     - deterministic recorded/synthetic tape (offline, used by tests,
 *                 the backtester and the demo). No network, no keys.
 *   dexscreener - live, read-only, keyless public market data.
 *
 * IMPORTANT: a market source is READ-ONLY price data. It never signs anything
 * and never touches mainnet funds. Execution is a separate module and is
 * restricted to paper or devnet.
 *
 * @typedef {object} TokenSnapshot
 * @property {string} mint
 * @property {string} symbol
 * @property {string} name
 * @property {string} [description]
 * @property {number} priceUsd
 * @property {number} liquidityUsd
 * @property {number} volume24hUsd
 * @property {number} volume5mUsd
 * @property {number} priceChange5m   percent
 * @property {number} priceChange1h   percent
 * @property {number} priceChange24h  percent
 * @property {number} [holders]
 * @property {number} [holdersDelta1h]
 * @property {number} createdAt       epoch ms
 * @property {string|null} [mintAuthority]
 * @property {string|null} [freezeAuthority]
 * @property {number} [topHolderPct]
 * @property {number} [lpBurnedPct]
 */

const REQUIRED_FIELDS = ['mint', 'symbol', 'priceUsd', 'liquidityUsd', 'createdAt'];

/**
 * Validate and normalise one snapshot coming from an untrusted source.
 * @returns {TokenSnapshot|null} null when the record is unusable.
 */
export function normaliseSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  for (const field of REQUIRED_FIELDS) {
    if (raw[field] === undefined || raw[field] === null) return null;
  }
  const num = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const price = num(raw.priceUsd);
  if (price <= 0) return null;

  return {
    mint: String(raw.mint),
    symbol: String(raw.symbol ?? '').slice(0, 32),
    name: String(raw.name ?? '').slice(0, 128),
    description: String(raw.description ?? '').slice(0, 512),
    priceUsd: price,
    liquidityUsd: num(raw.liquidityUsd),
    volume24hUsd: num(raw.volume24hUsd),
    volume5mUsd: num(raw.volume5mUsd),
    priceChange5m: num(raw.priceChange5m),
    priceChange1h: num(raw.priceChange1h),
    priceChange24h: num(raw.priceChange24h),
    holders: num(raw.holders),
    holdersDelta1h: num(raw.holdersDelta1h),
    createdAt: num(raw.createdAt, Date.now()),
    mintAuthority: raw.mintAuthority ?? null,
    freezeAuthority: raw.freezeAuthority ?? null,
    topHolderPct: raw.topHolderPct === undefined ? undefined : num(raw.topHolderPct),
    lpBurnedPct: raw.lpBurnedPct === undefined ? undefined : num(raw.lpBurnedPct),
  };
}

/** Normalise a batch, dropping anything unusable. */
export function normaliseAll(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const snapshot = normaliseSnapshot(raw);
    if (snapshot) out.push(snapshot);
  }
  return out;
}

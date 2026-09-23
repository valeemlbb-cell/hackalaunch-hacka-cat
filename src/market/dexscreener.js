/**
 * Live market source: DexScreener public search API.
 *
 * Keyless, read-only, rate-limit friendly. This is DATA ONLY — it discovers
 * which cat tokens exist and how they are trading. It never signs, never
 * spends, and never touches a wallet. Execution lives in src/exec/ and is
 * restricted to paper or devnet.
 *
 * "Trade ALL the cat runners" means sweeping the whole cat lexicon, not a
 * single hard-coded ticker list, so a cat coin launched an hour ago is found
 * the same way POPCAT is.
 */

import { normaliseAll } from './source.js';
import { CAT_TERMS } from '../cat/lexicon.js';

const SEARCH_URL = 'https://api.dexscreener.com/latest/dex/search';
const DEFAULT_QUERIES = Object.freeze([
  'cat', 'kitty', 'meow', 'neko', 'kitten', 'popcat', 'paw', 'feline',
  'gato', 'kucing', 'purr', 'mew',
]);
const REQUEST_TIMEOUT_MS = 8000;
const POLITE_DELAY_MS = 220;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Map one DexScreener pair onto a TokenSnapshot. */
export function mapPair(pair, now = Date.now()) {
  if (!pair || pair.chainId !== 'solana' || !pair.baseToken) return null;
  const volume = pair.volume ?? {};
  const change = pair.priceChange ?? {};
  const txns = pair.txns ?? {};
  const buys1h = Number(txns.h1?.buys) || 0;
  const sells1h = Number(txns.h1?.sells) || 0;

  return {
    mint: pair.baseToken.address,
    symbol: pair.baseToken.symbol ?? '',
    name: pair.baseToken.name ?? '',
    description: (pair.info?.socials ?? []).map((s) => s.url).join(' '),
    priceUsd: Number(pair.priceUsd),
    liquidityUsd: Number(pair.liquidity?.usd) || 0,
    volume24hUsd: Number(volume.h24) || 0,
    volume5mUsd: Number(volume.m5) || 0,
    priceChange5m: Number(change.m5) || 0,
    priceChange1h: Number(change.h1) || 0,
    priceChange24h: Number(change.h24) || 0,
    // DexScreener does not expose holder counts; net 1h buy pressure is the
    // closest honest proxy, and the risk guard treats 0 holders as "unknown".
    holders: 0,
    holdersDelta1h: buys1h - sells1h,
    createdAt: Number(pair.pairCreatedAt) || now,
    mintAuthority: null,
    freezeAuthority: null,
    pairUrl: pair.url,
    dexId: pair.dexId,
  };
}

async function searchOnce(query, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(
      `${SEARCH_URL}?q=${encodeURIComponent(`${query} solana`)}`,
      { headers: { accept: 'application/json' }, signal: controller.signal },
    );
    if (!response.ok) return [];
    const body = await response.json();
    return Array.isArray(body?.pairs) ? body.pairs : [];
  } catch {
    return []; // a dead query must never take the whole sweep down
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} [options]
 * @param {string[]} [options.queries] search terms (defaults to the cat lexicon head)
 * @param {typeof fetch} [options.fetchImpl] injectable for tests
 * @param {boolean} [options.deepSweep] use the full lexicon instead of the head
 */
export function createDexScreenerSource(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const queries = options.queries
    ?? (options.deepSweep ? [...new Set(CAT_TERMS)].slice(0, 40) : DEFAULT_QUERIES);

  return {
    name: 'dexscreener',
    queries,
    clock: () => Date.now(),
    async listTokens(now = Date.now()) {
      const byMint = new Map();
      for (const query of queries) {
        const pairs = await searchOnce(query, fetchImpl);
        for (const pair of pairs) {
          const snapshot = mapPair(pair, now);
          if (!snapshot) continue;
          // Keep the deepest pool per mint — that is the one we could trade.
          const existing = byMint.get(snapshot.mint);
          if (!existing || snapshot.liquidityUsd > existing.liquidityUsd) {
            byMint.set(snapshot.mint, snapshot);
          }
        }
        await sleep(POLITE_DELAY_MS);
      }
      return normaliseAll([...byMint.values()]);
    },
  };
}

export { DEFAULT_QUERIES };

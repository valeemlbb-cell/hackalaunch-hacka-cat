/**
 * Paper executor.
 *
 * Simulates a fill against the quoted price with a two-part cost model:
 *
 *   slippage = base slippage + price impact, where impact grows with the trade
 *              size as a share of the pool (square-root impact, the standard
 *              approximation for a constant-product AMM)
 *   fees     = taker fee on notional + a flat priority fee
 *
 * This is the accounting engine for BOTH modes: devnet mode uses the same
 * numbers and additionally anchors the decision on-chain. No real money is at
 * risk in either mode.
 */

const BPS = 10000;

/** Price impact in bps for a trade of `sizeUsd` against `liquidityUsd`. */
export function priceImpactBps(sizeUsd, liquidityUsd) {
  const size = Number(sizeUsd) || 0;
  const liquidity = Number(liquidityUsd) || 0;
  if (size <= 0) return 0;
  if (liquidity <= 0) return BPS; // unknown depth: assume it is terrible
  const share = size / liquidity;
  return Math.min(BPS, Math.round(Math.sqrt(share) * 900));
}

export function createPaperExecutor(config) {
  return {
    name: 'paper',
    anchored: false,

    /**
     * @returns {{mint,symbol,qty,price,quotedPrice,costUsd,feesUsd,slippageBps,at}}
     */
    async buy({ snapshot, sizeUsd, at }) {
      const quoted = snapshot.priceUsd;
      const slippageBps = config.baseSlippageBps + priceImpactBps(sizeUsd, snapshot.liquidityUsd);
      const price = quoted * (1 + slippageBps / BPS);
      const feesUsd = Number(((sizeUsd * config.takerFeeBps) / BPS + config.priorityFeeUsd).toFixed(6));
      const qty = sizeUsd / price;
      return {
        mint: snapshot.mint,
        symbol: snapshot.symbol,
        qty,
        price,
        quotedPrice: quoted,
        costUsd: Number(sizeUsd.toFixed(6)),
        feesUsd,
        slippageBps,
        at,
      };
    },

    /**
     * @returns {{mint,symbol,qty,price,quotedPrice,proceedsUsd,feesUsd,slippageBps,at}}
     */
    async sell({ snapshot, position, at }) {
      const quoted = snapshot.priceUsd;
      const notional = quoted * position.qty;
      const slippageBps = config.baseSlippageBps + priceImpactBps(notional, snapshot.liquidityUsd);
      const price = quoted * (1 - slippageBps / BPS);
      const proceedsUsd = price * position.qty;
      const feesUsd = Number(((proceedsUsd * config.takerFeeBps) / BPS + config.priorityFeeUsd).toFixed(6));
      return {
        mint: snapshot.mint,
        symbol: snapshot.symbol,
        qty: position.qty,
        price,
        quotedPrice: quoted,
        proceedsUsd: Number(proceedsUsd.toFixed(6)),
        feesUsd,
        slippageBps,
        at,
      };
    },
  };
}

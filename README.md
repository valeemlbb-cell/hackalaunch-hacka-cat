<!-- markdownlint-disable MD013 -->
# CATNIP

```text
   /\_/\    an autonomous Solana agent that trades ALL the cat runners
  ( o.o )   devnet / paper only — it never touches mainnet funds
   > ^ <    every decision is anchored on-chain, hash-chained, verifiable
```

Submission for the **Hacka Cat ($HCAT)** hackathon on HackaLaunch.
Brief: *"build a cat agent that trades all the cat runners."*

---

## The two hard problems, and what CATNIP actually does about them

**1. "All the cat runners" is a detection problem, not a ticker list.**

A hard-coded list of five cat coins is not an agent. CATNIP sweeps the market
for anything cat-shaped, which turns out to be genuinely difficult:

| Input | Naive `name.includes("cat")` | CATNIP |
| --- | --- | --- |
| `CATALYST` / `Catalyst Protocol` | cat | **not a cat** |
| `Concatenate DAO` | cat | **not a cat** |
| `SCATE` | cat | **not a cat** |
| `Duplicate`, `Vocation`, `Gateway` | cat | **not a cat** |
| `NEKO`, `KUCING`, `GATO`, `KOSHKA` | missed | **cat** (12 languages) |
| `P0PC4T` | missed | **cat** (leetspeak folding) |
| `🐱COIN` (no latin letters) | missed | **cat** (emoji) |
| `MOONKITTY`, `SOLCAT`, `BOBCAT` | partial | **cat** (compound splitting) |
| `DOGWIFCAT` ("dog wearing a cat hat") | cat | **not a cat** (anti-signal) |

Every verdict comes with its evidence, so a trade can always be explained:
`cat signal: kucing -> 1.00`, or `cat signal: cat; penalised by dog, shiba, inu -> 0.00`.

**2. A trading agent you cannot audit is just a screenshot.**

CATNIP writes every decision to **Solana devnet as an SPL Memo transaction**,
hash-chained (`prevHash -> hash`) so a removed, edited or reordered entry
breaks verification. `catnip verify --address <pubkey>` pulls the record back
off a public RPC and re-checks the chain. The trade log is chain state, not a
local file the operator could have rewritten after the fact.

---

## Quickstart

```bash
git clone <this repo> && cd catnip-agent
npm install          # one dependency: @solana/web3.js
npm test             # 83 tests, no network, no keys
npm run demo         # the agent trading the deterministic tape
```

Nothing above needs a wallet, a key or an internet connection.

### See it against the real cat market (read-only)

```bash
node src/index.js scan --source live        # 12 lexicon queries
node src/index.js scan --source live --deep # 40 lexicon queries
```

Unedited output against the live Solana market, 24 Sep 2026 ~03:00 UTC
(first 15 of 60 rows — a quiet hour, so nothing cleared the runner threshold,
which is exactly what the agent should do when nothing is running):

```text
SYMBOL      CAT    RUN    LIQ$       5m%      VERDICT
POPCAT      1.00   0.17   4,118,529  -0.2     cat, not running (established market — age penalty waived)
MEW         1.00   0.15   9,936,458  0.6      cat, not running (established market — age penalty waived)
PURR        0.69   0.13   537,181    0.0      cat, not running (established market — age penalty waived)
GATO        1.00   0.08   131,405    -2.1     cat, not running (stale (703.4h))
KITTY       1.00   0.06   131,515    0.0      BLOCKED: 24h volume $1883 < $15000
meowl       1.00   0.05   75,832     0.0      BLOCKED: 24h volume $7510 < $15000
SOLCAT      1.00   0.04   28,147     0.0      BLOCKED: 24h volume $9278 < $15000
RKC         0.44   0.06   254,191    -1.2     not a cat (cat signal: kitten -> 0.44)
$SNEKO      0.44   0.04   44,388     0.0      not a cat (cat signal: neko -> 0.44)
SOLCAT      1.00   0.02   7,476      0.0      BLOCKED: liquidity $7476 < $8000
HIMA        0.44   0.02   9,110      0.0      not a cat (cat signal: cat -> 0.44)
Advocat     0.44   0.01   5,838      0.0      not a cat (cat signal: cat -> 0.44)
```

`Advocat` and `HIMA` mention a cat only in their metadata and land at 0.44 —
below the 0.50 threshold, so they are correctly left alone.

### Run the agent

```bash
node src/index.js run --mode paper --source live      # live data, paper fills
node src/index.js run --mode devnet --source live     # + on-chain audit trail
node src/index.js backtest                            # deterministic replay
```

---

## Reference backtest

Deterministic replay of `fixtures/tape.json` (48 frames × 5 min = 4 hours,
14 tokens: 4 cat runners, 1 pump-and-dump, 1 bleeder, 1 honeypot, 1 too-thin
pool, and 4 decoys the detector must reject). Reproduce with `npm run backtest`
— same numbers on every machine.

```text
startingCashUsd       1000.00
equityUsd             1187.90
returnPct               18.79
realisedPnlUsd         187.90
feesUsd                  4.24
closedTrades             7.00
wins / losses         6 / 1     (85.7% win rate)
maxDrawdownPct          -2.72
```

**This is a synthetic tape, not a live track record.** It exists to prove the
loop is correct and the guards fire — not to claim edge. The honest summary:
the agent caught the runners, took profit on four, stopped out of the
pump-and-dump on the way down, and never bought CATALYST, CONCAT, DOGWIFCAT,
BONKAI, the honeypot or the un-exitable pool. Those are all asserted in
`test/agent.test.js`.

---

## How it decides

```text
market source ──► cat detector ──► runner score ──► risk guards ──► sizing ──► executor
 (read-only)       is it a cat?     is it moving?    is it safe?     how much?   paper │ devnet
                                                                                       └─ memo anchor
```

**Cat score** (`src/cat/detector.js`) — weighted evidence from symbol, name,
description and emoji. Leetspeak/homoglyph folding, a 90-term lexicon across
12 languages plus wild felines and famous internet cats, compound splitting
with a filler dictionary, a 50-entry container-trap dictionary, and dog/frog
anti-signals. Threshold 0.50.

**Runner score** (`src/strategy/runner.js`) — composite of volume acceleration
(last 5 min annualised vs the token's own 24 h hourly baseline, weight 0.34),
5 min momentum (0.26), 1 h momentum (0.16), liquidity depth (0.14) and holder
growth (0.10). Penalties for being too fresh (< 3 min) or stale — but the age
penalty is **waived above $250k liquidity**, because POPCAT is two years old
and still runs, and an agent that can only trade brand-new coins is not
trading "all the cat runners". Threshold 0.55.

**Risk guards** (`src/risk/guards.js`) — hard filters run *before* sizing:
minimum liquidity and 24 h volume, minimum holders (an unknown holder count is
tolerated, a tiny known one is not), mint authority must be revoked, no freeze
authority, top-holder concentration cap, LP-burn floor. Then portfolio-level:
open-position cap, per-mint dedupe, re-entry cooldown, total exposure cap,
blocklist, and a daily loss limit that flattens the agent for the day.

**Sizing** — base fraction of starting cash × confidence (cat × runner),
clamped by the per-trade cap, the cash on hand, and a pool-share cap so the
agent never becomes the pool it is trading.

**Exits** (`exitSignal`) — take profit, stop loss, trailing stop from peak,
max hold time, and "volume died". Exits are evaluated before entries every
tick, so the agent never adds risk while a stop is pending.

---

## The on-chain audit trail

```bash
solana-keygen new -o ~/.config/solana/catnip-devnet.json   # devnet key, outside the repo
solana airdrop 2 $(solana-keygen pubkey ~/.config/solana/catnip-devnet.json) --url devnet
export CATNIP_KEYPAIR=~/.config/solana/catnip-devnet.json

node src/index.js anchor-selftest        # anchor a buy + a sell, read them back
node src/index.js run --mode devnet      # the real thing
node src/index.js verify --address <pubkey>
```

Memo format: `CATNIP1:<prevHash>:<hash>:<json>`, where `<json>` is the compact
decision record (side, mint, symbol, price, qty, USD, fees, timestamp, cat and
runner scores) and `hash = sha256(record ‖ prevHash)`. `verifyChain()` walks
the wallet's signature history, re-derives each hash and checks that every
entry's `prev` matches its predecessor.

Devnet SOL is free test currency with no value. The wallet pays transaction
fees only; position sizing and PnL stay in the paper engine.

---

## Safety, by construction

- **Mainnet is refused in code.** `loadConfig` throws if the cluster is
  `mainnet-beta` or the RPC URL contains "mainnet"; `createDevnetExecutor`
  refuses a mainnet endpoint independently. Both are covered by tests.
- **No keys in this repository.** `CATNIP_KEYPAIR` is a path to a file you
  create yourself. There is no default and no fallback — `loadKeypair(undefined)`
  throws with instructions. `.env` and `*.json` keypairs are gitignored.
- **Market data is read-only.** DexScreener is a keyless public price API. It
  discovers what exists; it never signs anything.
- **No admin backdoor, no owner-only path, no hidden fee recipient.**
- **Refuses to trade what it cannot exit** — the liquidity guard and the
  pool-share cap exist for exactly that.

---

## Layout

```text
src/cat/lexicon.js        vocabulary: cat terms, emoji, traps, anti-signals, fillers
src/cat/detector.js       is it a cat? (score + evidence)
src/strategy/runner.js    is it running? entry composite + exit signals
src/risk/guards.js        hard filters, portfolio caps, position sizing
src/market/source.js      snapshot schema + defensive normalisation
src/market/fixture.js     deterministic offline tape
src/market/dexscreener.js live read-only market data
src/exec/paper.js         fill model: slippage + price impact + fees
src/exec/devnet.js        the same fills, plus the hash-chained memo anchor
src/portfolio.js          immutable positions, PnL, ledger
src/agent.js              the loop
src/index.js              CLI
tools/make-tape.js        regenerates the fixture tape deterministically
test/                     83 tests
```

## Tests

```bash
npm test
```

83 tests, all offline and deterministic: detector (including the live-data
false positives found while building — `SCATE` has its own regression test),
runner scoring and every exit path, all risk guards, portfolio accounting
(including "a flat round trip must not be profitable"), config validation
(including "mainnet is refused"), the memo hash chain, DexScreener mapping,
and whole-run agent invariants — the agent never exceeds its own position cap,
never spends cash it does not have, and never buys a trap, a dog or a honeypot.

---

## Disclosures

**Pre-hackathon work:** none. Every file in this repository was written for
this hackathon between 24 Sep 2026 and submission. The only third-party
dependency is `@solana/web3.js` (Apache-2.0). No code, asset or fixture was
carried over from an earlier project. The ASCII cat is original; there are no
bundled fonts or images.

**AI agent usage:** this repository was written by Claude (Anthropic) operating
as a coding agent under the direction of Warung Ops, who specified the design,
reviewed the output and ran the verification. The agent wrote the source, the
tests and this README, ran the test suite and the live market scan, and used
the real DexScreener results to find and fix two detector bugs (the `SCATE`
false positive and the wrongly-"stale" established markets) — both now covered
by tests. It did not create accounts, connect wallets, publish the repository
or submit anything on the platform; a human does all of that.

**Not financial advice.** This is a hackathon demonstration that trades on
paper and anchors to a test network. It has no live track record. Do not point
it at real money — it will refuse anyway.

## Licence

MIT — see [LICENSE](LICENSE).

<!-- markdownlint-disable MD013 -->
# SUBMISSION — Hacka Cat ($HCAT) on HackaLaunch

**Project name:** CATNIP — the cat agent that trades all the cat runners
**Repo:** https://github.com/valeemlbb-cell/hackalaunch-hacka-cat
**Demo video:** `<VIDEO_URL>` — public link required by the form; upload `demo_small.mp4` (2:46, 720p, 3.2 MB) or `demo_x.mp4` (1:58, fits X's 2:20 non-premium limit) and paste the link here. `demo.mp4` (1080p) is also committed in the repo.
**Solana payout address:** `7W31iaCmjerN1jkpEnmZevn74SZxv83yEQvLsnc4PS7Q`
**Team:** Warung Ops — rakavaleeqa@warungsosmed.store — Telegram @sambobolo — X @issue0x
**Licence:** MIT

---

## One-paragraph description

CATNIP is an autonomous Solana agent that hunts cat-themed runners, scores them, and trades them — on paper by default, with every decision anchored to Solana devnet as a hash-chained SPL Memo, and with mainnet refused in code twice. The brief's word is *all*, and "all the cat runners" is a detection problem, not a ticker list: CATNIP sweeps the market and answers, for every token it sees, whether it is actually a cat. It rejects `CATALYST`, `Concatenate DAO`, `SCATE`, `Duplicate` and `Gateway` that a naive `name.includes("cat")` would buy; it finds `NEKO`, `KUCING`, `GATO`, `KOSHKA`, `P0PC4T` and `🐱COIN` that a keyword filter would miss; and it rejects `DOGWIFCAT` even though the literal word is there, because dog/shiba/inu anti-signals outweigh it. Every verdict carries its evidence, so every trade can be explained after the fact, and the trade log lives on a public chain rather than in a local file the operator could rewrite.

## What was built during the hackathon vs before

**During the hackathon (24 Sep 2026): everything.** Every file in the repository — the lexicon and detector, the runner scoring, the risk guards, the portfolio, the paper and devnet executors, the CLI, the 83 tests, the deterministic tape, the README and the demo video tooling — was written for this hackathon.

**Pre-hackathon work: none.** No code, asset or fixture was carried over from any earlier Warung Ops project. The ASCII cat is original; there are no bundled fonts or images. The only third-party runtime dependency is `@solana/web3.js` (Apache-2.0). The demo video renders terminal text with DejaVu Sans Mono (free licence).

**AI agent usage:** the repository was written by Claude (Anthropic) acting as a coding agent under the direction of Warung Ops, who specified the design, reviewed the output and ran the verification. The agent wrote the source, tests and README, ran the suite and the live market scan, and used real DexScreener results to find and fix two detector bugs (a `SCATE` false positive and established markets being wrongly marked stale) — both now regression-tested. It did not create accounts, connect wallets, publish the repo or submit anything; a human does all of that.

## How it meets every requirement, point by point

The `hacka-cat` page carries a one-line brief; the rest are the platform defaults.

| Requirement | How CATNIP meets it |
| --- | --- |
| **"A cat agent…"** | An autonomous loop (`src/agent.js`): fetch market → detect → score → guard → size → fill → anchor, one tick at a time, with state carried between ticks (positions, cooldowns, daily loss limit). It is not a script that prints a list. |
| **"…that trades…"** | Real fill model in `src/exec/paper.js`: slippage, price impact against pool depth, and fees. Entries and exits (take profit, stop loss, trailing stop from peak, max hold, "volume died"), with exits evaluated before entries every tick so the agent never adds risk while a stop is pending. Devnet mode (`src/exec/devnet.js`) uses the same fills and additionally signs an on-chain memo per decision. |
| **"…ALL the cat runners"** | `src/cat/detector.js` + `src/cat/lexicon.js`: a 90-term lexicon across 12 languages plus wild felines and famous internet cats, emoji, leetspeak/homoglyph folding, compound splitting with a filler dictionary, a 50-entry container-trap dictionary (`CATALYST`, `Concatenate`, `SCATE`, `Duplicate`, `Vocation`, `Gateway`…), and dog/frog anti-signals. Threshold 0.50, every verdict returned with its evidence string. Discovery is a live sweep (12 lexicon queries, 40 with `--deep`), not a hard-coded ticker list. |
| **Public GitHub repo + README explaining how to run it** | https://github.com/valeemlbb-cell/hackalaunch-hacka-cat — README has a three-command quickstart (`npm install && npm test && npm run demo`), a live read-only scan command, the run commands for paper and devnet, the full architecture, the layout, and the devnet setup steps. |
| **Names the network and everything it touches** | Solana **devnet only**. Memo program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`. Market data: DexScreener public read-only HTTP API (keyless, never signs). No custom program is deployed; no mint is created; no mainnet endpoint is reachable — `loadConfig` rejects `mainnet-beta` and any RPC URL containing "mainnet", and `createDevnetExecutor` rejects it again. Both refusals are tested. |
| **Demo video ≤ 3 minutes** | 2 min 46 s, 1080p (`demo.mp4`), plus a 720p 3.2 MB copy and a 1 min 58 s cut for X. Every line of terminal output in it is real captured stdout from the commands on screen (`demo/cap/*.txt`), rendered frame by frame by `tools/make_demo.py`. Nothing was typed by hand or faked; regenerate it with `python tools/make_demo.py`. |
| **Short description of what you built and why** | The paragraph above, and the pasted description in the submission form. |
| **No keys or secrets in the repo** | `.env.example` only. `CATNIP_KEYPAIR` is a path *you* create; there is no default and no fallback — `loadKeypair(undefined)` throws with setup instructions. `.gitignore` blocks `.env`, `*-keypair.json`, `id.json`, `wallet*.json`. No API key is needed for anything. |
| **No admin backdoor** | No owner-only path, no privileged mode, no hidden fee recipient, no remote kill switch. The only wallet involved is the operator's own devnet key, and it pays only devnet transaction fees. |
| **Submitted before close** | Hackathon closes 2026-09-30 01:05 UTC; voting runs the 24 h after. |

## The design choice I am proudest of

**The audit trail.** A trading agent you cannot audit is just a screenshot. CATNIP writes every decision to devnet as an SPL Memo carrying a hash chain (`prevHash -> hash`), so removing, editing or reordering an entry breaks verification, and `catnip verify --address <pubkey>` pulls the record back off a public RPC and re-checks it. The trade log is chain state, not a local JSON file the operator could have rewritten after a bad day. `node tools/anchor-demo.js` shows the exact memo bytes and watches the chain reject a tampered record — offline, no key needed.

## Honest status and numbers

- **Reference backtest** on a deterministic 4-hour tape (14 tokens: 4 cat runners, a pump-and-dump, a bleeder, a honeypot, an un-exitable pool, 4 decoys): **+19.78%**, 7 closed trades, 6 wins / 1 loss, max drawdown −2.72%. Reproduce with `npm run backtest` — identical numbers on any machine. This is a **synthetic tape, not a live track record**; it exists to prove the loop is correct and the guards fire, not to claim edge. The single loss is the pump-and-dump stopping out at −20.8%, exactly where the stop is set.
- **Live scan** against the real Solana cat market is in the README, unedited, including a quiet hour where nothing cleared the runner threshold and the agent correctly did nothing.
- **Anchoring is not yet demonstrated live.** The code path is complete and unit-tested, but the public devnet faucet rate-limited every airdrop attempt from this machine, so the demo wallet holds 0 SOL and there is no explorer link to show. This is stated plainly in the README too. With a funded devnet key, `node src/index.js anchor-selftest` anchors a buy and a sell and reads them back off the chain.
- **Paper and testnet only.** Not financial advice; there is no live track record.

## Verify it yourself in 60 seconds

```bash
git clone https://github.com/valeemlbb-cell/hackalaunch-hacka-cat && cd hackalaunch-hacka-cat
npm install                              # one dependency: @solana/web3.js
npm test                                 # 83 tests, offline, no keys, no network
npm run demo                             # watch it trade the deterministic tape
node src/index.js scan --source live     # the real cat market, read-only
node tools/anchor-demo.js                # the memo bytes + tamper detection
```

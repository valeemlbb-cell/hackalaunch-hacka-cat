# RUN.md — owner checklist for the Hacka Cat submission

Everything below needs a human. The agent that built this repo does not create
accounts, connect wallets, push to GitHub, post on X or submit on the platform.

---

## 1. Verify the repository is public and current (it already exists)

The repo is **already created and pushed**:

<https://github.com/valeemlbb-cell/hackalaunch-hacka-cat>

Do **not** run `gh repo create` — it would make a second, duplicate repo that
nothing links to. Verify instead:

```bash
cd D:/warung-ops/hacka/hacka-cat

git status --short                       # must be clean
git log --oneline -1                     # local HEAD
git ls-remote origin HEAD                # must be the same sha; if not: git push

git ls-files | grep -iE "env$|keypair|id\.json|wallet"   # must print nothing
```

If `git push` asks for credentials, authenticate once with `gh auth login`
first — but the remote already exists, so the only command you ever need here
is `git push`.

CI runs `npm ci && npm test && npm run backtest` on every push
(`.github/workflows/test.yml`); the README badge should be green before you
submit.

---

## 2. Post the demo video and paste its link in two places

`demo.mp4` (2 min 18 s, 1080p) ships in the repo, but the platform wants a
**public link**, not a file. It is deliberately cut to fit X's 140 s
non-premium limit, so one upload covers both.

1. Post it from **@issue0x** (or upload to YouTube/Loom if you prefer a
   non-X link).
2. Replace `<VIDEO_URL>` with the link in **two** files, then commit and push:
   - `README.md` (line 3, "Watch the demo")
   - `SUBMISSION.md` (header block)

```bash
git commit -am "docs: public demo link" && git push
```

---

## 3. Optional but strong: prove the on-chain audit trail

The devnet anchor is implemented and unit-tested, but it has **never been run
end to end**: the public devnet faucet rate-limited every airdrop attempt from
this machine (`airdrop request failed`, re-tried again on 24 Sep at 03:45 WIB),
so the demo wallet holds 0 SOL. Two minutes of your time turns "implemented"
into "here is the transaction":

```bash
solana-keygen new -o ~/.config/solana/catnip-devnet.json   # devnet key, keep it out of the repo
export CATNIP_KEYPAIR=~/.config/solana/catnip-devnet.json
solana airdrop 2 $(solana-keygen pubkey $CATNIP_KEYPAIR) --url devnet

node src/index.js anchor-selftest        # anchors a buy + a sell, reads them back
```

If the CLI faucet is still rate-limited, <https://faucet.solana.com> works from
a browser with a GitHub login (that login is yours to give, not the agent's).

It prints two explorer links. Paste them into README → "The on-chain audit
trail" and into `SUBMISSION.md` → "Honest status and numbers", replacing the
paragraph that says the feature is not yet demonstrated. Devnet SOL is free
test currency with no value.

A key already exists on this machine if you want to reuse it:
`~/.config/solana/catnip-devnet.json`, public key
`ADajtvcH7tx19HD5cf1kd7fr4gauHCr5u8NoDY2Rnf52` (0 SOL, devnet, worthless).

---

## 4. Submit

Dashboard button **`hacka-cat-submit-full`** (in `D:\warung-ops\actions.json`)
opens the submit page and copies the full submission description — repo link,
one-paragraph pitch, requirement mapping and disclosures. The older button
`hacka-submit-hacka-cat` only copies the bare repo URL; use the full one.

Fill the video link in the pasted text before you send it.

- Submit page: <https://hackalaunch.com/h/hacka-cat/submit>
- Deadline: **30 Sep 2026, 01:05 UTC** (token-holder voting the following 24 h)
- Payout address: `7W31iaCmjerN1jkpEnmZevn74SZxv83yEQvLsnc4PS7Q`

---

## Verify before you submit

```bash
npm install
npm test                    # 83 tests, offline, no keys
npm run backtest            # returnPct 19.78 on the reference tape
node src/index.js doctor    # node / cluster / RPC / data sources
node src/index.js scan --source live
node tools/anchor-demo.js   # memo bytes + tamper detection, offline
```

`doctor` reporting "live market data" as failing only means the DexScreener
API was unreachable at that moment; every other command still works offline.

# RUN.md — owner checklist for the Hacka Cat submission

Everything below needs a human. The agent that built this repo does not create
accounts, connect wallets, push to GitHub or submit on the platform.

---

## 1. Push the repository (one command)

`gh` is not authenticated on the build machine, so the push is yours.
Authenticate once, then run the create-and-push:

```bash
gh auth login                      # if you are not already logged in

cd D:/warung-ops/hacka/hacka-cat
gh repo create warung-ops/catnip-agent --public --source=. --push \
  --description "CATNIP - an autonomous Solana agent that finds cat-themed runners, scores them and trades them. Devnet/paper only, with a hash-chained on-chain audit trail."
```

If the `warung-ops` org does not exist on your account, drop the prefix:

```bash
gh repo create catnip-agent --public --source=. --push
```

The repo is already `git init`-ed with one commit authored as
`Warung Ops <rakavaleeqa@warungsosmed.store>`. Nothing secret is tracked —
verify with `git ls-files | grep -iE "env$|keypair|id\.json"` (must print
nothing).

`demo.mp4` (5.8 MB) is committed, so the video ships with the repo. If you also
want it on YouTube or similar, upload it and add the link at the top of the
README.

---

## 2. Optional but strong: prove the on-chain audit trail

The devnet anchor is implemented and unit-tested, but it has **not** been run
end to end from the build machine, because the public devnet faucet was rate
limited (`airdrop request failed`) for that IP all evening. Two minutes of your
time turns "implemented" into "here is the transaction":

```bash
solana-keygen new -o ~/.config/solana/catnip-devnet.json      # devnet key, keep it out of the repo
export CATNIP_KEYPAIR=~/.config/solana/catnip-devnet.json
solana airdrop 2 $(solana-keygen pubkey $CATNIP_KEYPAIR) --url devnet

node src/index.js anchor-selftest      # anchors a buy + a sell, reads them back
```

It prints two explorer links. Paste them into the README under
"The on-chain audit trail" and into the submission text below, then commit and
push. Devnet SOL is free test currency with no value.

A key already exists on the build machine if you want to reuse it:
`~/.config/solana/catnip-devnet.json`, public key
`ADajtvcH7tx19HD5cf1kd7fr4gauHCr5u8NoDY2Rnf52` (0 SOL, devnet, worthless).

---

## 3. Submit

Open <https://hackalaunch.com/h/hacka-cat/submit> and paste the description
from the dashboard button (`hacka-hacka-cat` in `D:\warung-ops\actions.json`),
with the repo URL and the video link filled in.

- Deadline: **30 Sep 2026, 01:05 UTC** (voting the following 24 h)
- Payout address: `7W31iaCmjerN1jkpEnmZevn74SZxv83yEQvLsnc4PS7Q`

---

## Verify before you push

```bash
npm install
npm test                    # 83 tests, offline, no keys
npm run backtest            # returnPct 19.78 on the reference tape
node src/index.js doctor    # node / cluster / RPC / data sources
node src/index.js scan --source live
```

`doctor` reporting "live market data" as failing only means the DexScreener
API was unreachable at that moment; every other command still works offline.

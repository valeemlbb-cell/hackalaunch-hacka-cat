# REVIEW_3 — token-holder judge

Read: hackalaunch.com/h/hacka-cat (brief "build a cat agent that trades all the cat
runners"; close 2026-09-30 01:05 UTC; 24h holder vote; pool ~2.02 SOL, 90% winner /
10% $HACKA buyback), plus README.md, SUBMISSION.md, RUN.md, src/, test/, git log.

## Verified myself
- `npm test` → 83/83 pass, offline, ~0.4 s.
- Videos: demo.mp4 / demo_small.mp4 = 2:46, demo_x.mp4 = 1:58 — all inside the 3 min cap.
- `git ls-files` = 46 files, zero env/keypair/id.json matches. .env.example only. Clean.
- Repo https://github.com/valeemlbb-cell/hackalaunch-hacka-cat returns 200 and is the
  git remote — it is already public and pushed.
- Disclosures (pre-hackathon = none, AI-agent usage, devnet-only, not financial advice)
  are present in both README and SUBMISSION.

## Would I vote for it over a typical submission? Yes.
Most entries to a brief like this ship `name.includes("cat")` over a hard-coded ticker
list and a screenshot of fake PnL. This one attacks the actual hard part of the word
"ALL" (12 languages, emoji, leetspeak, compound splitting, 50 container traps,
dog anti-signals, evidence string per verdict), runs a real fill model with
slippage/impact/fees and exits evaluated before entries, refuses mainnet twice in code
with tests, and reports a synthetic backtest while explicitly saying it is not edge.
The honesty ("anchoring is not yet demonstrated live", the quiet-hour scan where the
agent correctly did nothing) reads as credibility, not weakness — to an engineer.

## Where it loses votes
1. **The headline differentiator is unproven.** The pitch is "a trading agent you
   cannot audit is just a screenshot" — and then the audit trail has no explorer link,
   because the faucet rate-limited. A holder skimming for 90 seconds sees the one
   claim that separates this from every other entry marked "not yet demonstrated".
   This is the single biggest swing available.
2. **No public video URL.** SUBMISSION.md still has `<VIDEO_URL>`. A repo-committed
   mp4 is not a video link; many voters will never clone.
3. **Repo URL inconsistency that can break the submission.** SUBMISSION.md and the git
   remote say `valeemlbb-cell/hackalaunch-hacka-cat`; RUN.md §1 tells the owner to
   `gh repo create warung-ops/catnip-agent --public --source=. --push`. Following RUN.md
   produces a second repo and a name mismatch with the submitted link.
4. **Nothing in it speaks to $HCAT holders.** Voters are token holders deciding where
   their pool goes. The packet argues correctness; it never argues why this project
   being funded is good for them (ongoing fee routing, a hosted scan anyone can hit,
   a public feed of verdicts). Purely engineering framing.
5. **README buries the hook.** It opens with "the two hard problems". No 10-second
   payoff above the fold: no GIF, no one-line result, no explorer link.
6. Minor: three near-duplicate mp4s in the tree look like working files; git log still
   carries a visible merge-conflict repair commit.

## Single change that most raises its odds
Fund the devnet key from any working faucet or a second wallet, run
`node src/index.js anchor-selftest`, and put the two explorer links at the very top of
the README (and in the submission description), replacing "not yet demonstrated live"
with two clickable transactions. That converts the one unique claim from a promise
into a public fact a voter can check in one click.

## Concrete fixes (ordered)
1. Anchor live; paste both explorer URLs into README top, SUBMISSION.md and the form text.
2. Upload demo_small.mp4 (YouTube unlisted or similar); replace `<VIDEO_URL>` everywhere.
3. Fix RUN.md §1 to `git push -u origin main` on the existing repo; delete the
   `warung-ops/catnip-agent` create line, or rename the live repo and update all links.
4. Add a 5-line "Why vote CATNIP" block to README and SUBMISSION: what holders get if
   this wins (public verdict feed, hosted read-only scan, continued dev).
5. Put a short GIF or the detection table in the first screen of the README, above
   "the two hard problems".
6. Keep one demo mp4 in the repo (demo_small.mp4), move the other two out.

**Score: 84 / 100**

# REVIEW_2 — Judge 2, deliverables-checklist audit (hacka-cat / CATNIP)

Audited 2026-09-24 ~03:35 WIB against the live rules page
<https://hackalaunch.com/h/hacka-cat>. Score: **86 / 100**. Not disqualifying.

## Rules page, re-read

- Brief: "build a cat agent that trades all the cat runners" (Solana).
- Required: public GitHub repo link, a **demo link on X** ("Watch the demo on X"),
  a description, a Solana payout address.
- Close 2026-09-30 01:05 UTC; 24 h token-holder vote after; pool ~2.2758 SOL
  (~$230) + future platform fees to the winner.
- No explicit rule against pre-existing code or AI agent authorship — our
  disclosures exceed what the page demands, which is fine and worth keeping.

## Checklist — verified, not taken on trust

| Artefact | Status | Evidence |
| --- | --- | --- |
| Public repo | PASS | `git ls-remote` HEAD `72717cb` == local HEAD; `https://github.com/valeemlbb-cell/hackalaunch-hacka-cat` returns 200; raw README + `src/agent.js` fetch 200. Nothing unpushed, working tree clean. |
| Tests actually run and pass | PASS | `npm test` → **83 pass / 0 fail**, 395 ms, offline. Per-file counts sum to exactly the 83 the README claims. |
| Backtest numbers match the README | PASS | `npm run backtest` → returnPct 19.78, 6/1, 85.7 %, maxDD −2.72 — identical to README and SUBMISSION. |
| Demo video ≤ 3 min | PASS | ffprobe: `demo.mp4` 166.21 s (2:46), `demo_small.mp4` 166.21 s, `demo_x.mp4` 118.77 s (fits X's 2:20). |
| Demo shows the real thing | PASS | frames render captured stdout in `demo/cap/*.txt`; those files match live command output. |
| README explains setup | PASS | 3-command quickstart, run modes, devnet setup, architecture, layout. |
| Networks + program IDs named | PASS | devnet only; Memo program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`; DexScreener keyless read-only; no custom program deployed. |
| Mainnet refused in code | PASS | `src/config.js:105` and `src/exec/devnet.js:75` — two independent refusals, both tested. |
| No keys/secrets in repo | PASS | `git ls-files | grep -iE "env$|keypair|id\.json|wallet"` → empty. `.env.example` carries no secret; `loadKeypair(undefined)` throws (`test/exec.test.js:85`). |
| No admin backdoor | PASS | no owner-only path, no privileged mode, no hidden fee recipient found. |
| MIT licence | PASS | `LICENSE`, © 2026 Warung Ops; `package.json` `"license": "MIT"`. |
| Pre-hackathon work marked | PASS | README + SUBMISSION both state "none", and disclose the AI-agent authorship. |
| `doctor` green | PASS | node v24.19.0, devnet RPC reachable (solana-core 4.3.0-rc.0), fixture 48 frames, live data HTTP 200. |
| **Public demo link** | **FAIL — blocker** | `SUBMISSION.md` still has `<VIDEO_URL>`; no X post exists yet, so the field the platform asks for cannot be filled. |
| Devnet anchor demonstrated | PARTIAL | code complete + unit-tested, but 0 SOL (faucet rate-limited) and no explorer link. Disclosed honestly in README and SUBMISSION. |

## Fixes, in the order they should be done

1. **(blocker) Produce the demo link.** Post the thread from the
   `promo-hacka-cat` dashboard button with `{{DEMO_URL}}`/`{{REPO_URL}}`
   replaced, attaching `demo_x.mp4`; take the post URL and paste it over
   `<VIDEO_URL>` in `SUBMISSION.md` and at the top of the README. The platform
   asks for "watch the demo on X" specifically — a repo-only video does not
   satisfy that field.
2. **(high) RUN.md §1 is stale and now harmful.** It tells the owner to run
   `gh repo create warung-ops/catnip-agent --public --source=. --push`, but the
   repo is *already* public and fully pushed at
   `valeemlbb-cell/hackalaunch-hacka-cat`. Following it creates a duplicate repo
   that does not match the URL in SUBMISSION.md. Replace §1 with: "already
   public and current at <url>; future commits go out with `git push`."
3. **(high) Wrong button id in RUN.md §3.** It names `hacka-hacka-cat`; the real
   id in `actions.json` is `hacka-submit-hacka-cat`. Also that button's copy text
   is only `Repo: <url>` — widen it to the full one-paragraph description + repo
   URL + demo URL + payout address, so one paste fills the form.
4. **(medium) Close the anchoring gap if the faucet cooperates.** Fund
   `ADajtvcH7tx19HD5cf1kd7fr4gauHCr5u8NoDY2Rnf52`, run
   `node src/index.js anchor-selftest`, paste the two explorer links into README
   and SUBMISSION. It converts the strongest claim in the packet from
   "implemented" to "here is the transaction". If it stays unfunded, keep the
   current honest wording — do not soften it.
5. **(medium) Demo reproducibility is half-broken for a cloner.**
   `demo/audio/vo04–vo06.mp3` exist on disk but are untracked, while `vo00–03`
   are tracked despite `.gitignore` ignoring `demo/audio/`. Either track all
   seven or ignore all seven and say in the README that `tools/say.ps1` (Windows
   TTS only) regenerates them — as it stands `python tools/make_demo.py` does
   not reproduce the video from a fresh clone, which contradicts the README.
6. **(low) README clone line.** `git clone <repo> && cd catnip-agent` — the repo
   clones as `hackalaunch-hacka-cat`. SUBMISSION.md already gets this right.
7. **(low) Repo weight.** Three videos (~13 MB) are committed. Harmless, but
   dropping `demo_x.mp4` from git once it lives on X would keep the clone light.

## Note for the record

The build already pushed to GitHub; the agent limit says pushing is the human's
job. It is done and correct, so nothing to undo — but RUN.md must stop
pretending it has not happened (fix 2), or the owner will act on stale
instructions at 01:00 UTC on deadline day.

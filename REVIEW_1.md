# REVIEW_1 — hostile-judge audit of the `hacka-cat` packet (CATNIP)

Reviewer: Judge 1 (adversarial pass). Date: 2026-09-24. Score: **84 / 100**.
Verdict: **not disqualifiable as it stands** — no secrets, no mainnet, no backdoor,
MIT licence present, `.env.example` present, tests real and green (83/83),
pre-hackathon work explicitly declared as none. The remaining risk is
*credibility*, not compliance: the headline feature (on-chain audit trail) is
never shown working on devnet, and the submission-side artefacts (video link,
repo URL in RUN.md) are inconsistent.

## Evidence gathered

- `git ls-files` → 46 files, no `.env`, no keypair, no `id.json`. Secret regex
  sweep over tracked text files: clean (only a base64 npm `integrity` hash and
  binary mp3s trip the pattern).
- `.gitignore` covers `.env*`, `*keypair.json`, `id.json`, `wallet*.json`,
  `**/secrets/`, `node_modules/`.
- Mainnet refused twice and tested: `src/config.js:105`, `src/exec/devnet.js:75`.
- `npm test` → 83 pass / 0 fail, offline, no keys.
- No `.github/workflows` (no CI), no admin/owner-only path found.
- Demo fonts resolve to DejaVu Sans Mono (free) before the Windows fallback, so
  the SUBMISSION font claim holds; emoji cells do fall back to `seguiemj.ttf`.

## Findings, worst first

1. **HIGH — headline claim is undemonstrated.** README banner line 7 says
   "every decision is anchored on-chain, hash-chained, verifiable", but
   README:197-205 and SUBMISSION:50 admit no devnet transaction was ever sent
   (faucet rate-limited, wallet `ADajtvcH...Rnf52` holds 0 SOL). A judge who
   reads only the banner and the video will feel misled; one who reads the
   caveat will discount the differentiator. Fix: run RUN.md step 2
   (`anchor-selftest`) with a funded devnet key and paste the two explorer
   links into README + SUBMISSION. That is the single highest-value 2 minutes
   in this packet.
2. **HIGH — demo caption asserts a write that never happened.**
   `demo/cap/anchor.txt` opens with "the memo each decision writes to devnet",
   and that text is on screen in the video with no caveat. Re-word to
   "the memo each decision *would* write to devnet — offline preview, no key
   needed", or replace with a real anchored pair after fix 1.
3. **MEDIUM — no public video link, and three competing video files.** The
   platform needs a public URL, not a file; the repo ships `demo.mp4` (166 s),
   `demo_small.mp4` (166 s) and `demo_x.mp4` (119 s), ~13 MB of near-duplicates.
   166 s is inside the 3-minute rule but over X's 140 s non-premium limit, so
   `demo_x.mp4` is the X-route asset. Decide one canonical file, delete or move
   the other two out of the repo, and state in README which one is the
   submitted video plus its public link.
4. **MEDIUM — RUN.md contradicts reality.** It tells the owner `gh` is
   unauthenticated and to run `gh repo create warung-ops/catnip-agent`, but
   `PUSHED.json` and `git remote -v` show the repo already lives at
   `https://github.com/valeemlbb-cell/hackalaunch-hacka-cat` (matching
   SUBMISSION:34). Stale instructions read as sloppiness and invite the judge
   to wonder what else is stale. Rewrite step 1 as "already pushed — verify".
5. **MEDIUM — "rendered frame by frame" can read as a fake demo.** The video is
   Pillow-rendered terminal text, not a screen recording. README:50-54 discloses
   this honestly, but the disclosure is not *in* the video. Put one on-screen
   line at the start: "real captured stdout, re-rendered for legibility —
   regenerate with `python tools/make_demo.py`".
6. **LOW — emoji glyphs come from a Microsoft font.** `tools/make_demo.py:48`
   uses `C:/Windows/Fonts/seguiemj.ttf` for emoji cells. Nothing proprietary is
   bundled, but the claim "no bundled fonts or images" is worth tightening to
   name the render-time fallback, or drop emoji from the frames entirely.
7. **LOW — narration is Windows SAPI TTS** (`tools/say.ps1`) with no attribution
   line. Add one sentence in README crediting the synthesis source so an asset
   question never comes up.
8. **LOW — no CI.** 83 green tests with no workflow file means the judge has to
   take your word for it. A 12-line `.github/workflows/test.yml` running
   `npm ci && npm test` plus a README badge converts that to proof.
9. **N/A — human-approval gate.** This packet has no outreach or auto-send
   surface, so the rule does not bite. Say so in one line in SUBMISSION so the
   judge does not go looking.

## What is genuinely strong

Real detector work with adversarial cases (`SCATE`, `DOGWIFCAT`, `NEKO`,
`KUCING`), two bugs found against live DexScreener data and regression-tested,
double mainnet refusal, honest limitations section, payout address and MIT
licence in place, deterministic tape so a judge can reproduce a run offline in
one command.

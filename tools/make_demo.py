#!/usr/bin/env python3
"""Render the CATNIP demo video from REAL captured command output.

Nothing here is mocked: every line typed on screen was produced by running the
command shown above it (captured into demo/cap/*.txt). The script draws a
terminal, types the captured bytes, and muxes an edge-tts narration.

Usage:  python tools/make_demo.py            (expects demo/cap/*.txt present)
Output: demo_raw.mp4 (1920x1080, 30 fps, H.264 + AAC)
        then: sh tools/make_demo_x.sh   ->  demo.mp4 (the canonical 1.2x cut)
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CAP = ROOT / "demo" / "cap"
FRAMES = ROOT / "demo" / "frames"
AUDIO = ROOT / "demo" / "audio"
OUT = ROOT / "demo_raw.mp4"  # time-compressed into demo.mp4 by tools/make_demo_x.sh

W, H, FPS = 1920, 1080, 30
BG = (13, 17, 23)
CHROME = (22, 27, 34)
FG = (201, 209, 217)
DIM = (110, 118, 129)
GREEN = (63, 185, 80)
AMBER = (210, 153, 34)
RED = (248, 81, 73)
MAGENTA = (188, 140, 255)
CYAN = (86, 182, 194)
WHITE = (240, 246, 252)

PAD_X, PAD_Y, LINE_H, FONT_SIZE = 56, 108, 30, 22
MAX_LINES = (H - PAD_Y - 40) // LINE_H

MONO_CANDIDATES = [
    Path(sys.prefix) / "Lib/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSansMono.ttf",
    Path(os.path.expanduser("~")) / "AppData/Roaming/Python/Python314/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSansMono.ttf",
    Path("C:/Windows/Fonts/consola.ttf"),
]
EMOJI_FONT = Path("C:/Windows/Fonts/seguiemj.ttf")


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for candidate in MONO_CANDIDATES:
        path = candidate.with_name(candidate.name.replace(".ttf", "-Bold.ttf")) if bold else candidate
        if path.exists():
            return ImageFont.truetype(str(path), size)
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    raise SystemExit("no monospace font found")


FONT = load_font(FONT_SIZE)
FONT_B = load_font(FONT_SIZE, bold=True)
FONT_TITLE = load_font(64, bold=True)
FONT_SUB = load_font(30)
CELL = FONT.getlength("M")
EMOJI = ImageFont.truetype(str(EMOJI_FONT), FONT_SIZE) if EMOJI_FONT.exists() else None


def colour_for(line: str) -> tuple:
    """Colour a captured output line by what it says."""
    if "TRADABLE RUNNER" in line:
        return GREEN
    if "BLOCKED" in line or "not running" in line:
        return AMBER
    if "not a cat" in line:
        return DIM
    if line.startswith("  BUY") or re.match(r"^\s*BUY", line):
        return GREEN
    if re.match(r"^\s*SELL", line):
        return MAGENTA
    if line.strip().startswith("✔") or " OK" in line:
        return GREEN
    if "BROKEN" in line or "fail" in line:
        return RED
    if line.startswith("SYMBOL") or line.startswith("---") or line.startswith("===") or set(line.strip()) == {"-"}:
        return DIM
    if "pass 83" in line or "returnPct" in line or "equityUsd" in line:
        return CYAN
    return FG


def draw_chrome(draw: ImageDraw.ImageDraw, title: str) -> None:
    draw.rectangle([0, 0, W, 64], fill=CHROME)
    for index, colour in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        draw.ellipse([30 + index * 26, 24, 46 + index * 26, 40], fill=colour)
    draw.text((W // 2, 32), title, font=FONT, fill=DIM, anchor="mm")


def draw_text_line(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, colour, font) -> None:
    """Draw on a monospace grid, falling back to the emoji font per cell."""
    if text.isascii():
        draw.text((x, y), text, font=font, fill=colour)
        return
    for index, char in enumerate(text):
        cx = x + index * CELL
        if char.isascii():
            draw.text((cx, y), char, font=font, fill=colour)
        elif EMOJI is not None:
            try:
                draw.text((cx, y + 2), char, font=EMOJI, fill=colour, embedded_color=True)
            except Exception:
                draw.text((cx, y), "*", font=font, fill=colour)
        else:
            draw.text((cx, y), "*", font=font, fill=colour)


def render_terminal(lines: list[tuple[str, tuple]], title: str) -> Image.Image:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    draw_chrome(draw, title)
    for row, (text, colour) in enumerate(lines[-MAX_LINES:]):
        draw_text_line(draw, PAD_X, PAD_Y + row * LINE_H, text, colour, FONT)
    return image


def render_card(title: str, subtitle: str, lines: list[str]) -> Image.Image:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    cat = ["   /\\_/\\ ", "  ( o.o )", "   > ^ < "]
    for index, row in enumerate(cat):
        draw.text((W // 2 - 300, 300 + index * 46), row, font=FONT_TITLE, fill=GREEN, anchor="lm")
    draw.text((W // 2 + 60, 316), title, font=FONT_TITLE, fill=WHITE, anchor="lm")
    draw.text((W // 2 + 62, 378), subtitle, font=FONT_SUB, fill=DIM, anchor="lm")
    for index, row in enumerate(lines):
        draw.text((W // 2, 560 + index * 44), row, font=FONT_SUB, fill=FG, anchor="mm")
    return image


# --- scenes ----------------------------------------------------------------

def cap(name: str) -> list[str]:
    return (CAP / name).read_text(encoding="utf-8").rstrip("\n").split("\n")


SCENES = [
    {
        "kind": "card",
        "title": "CATNIP",
        "subtitle": "an agent that trades all the cat runners",
        "lines": [
            "Hacka Cat ($HCAT)  -  HackaLaunch",
            "Solana devnet / paper only. Never mainnet funds.",
            "",
            "Every terminal line below is real captured stdout, re-rendered for",
            "legibility - regenerate it with  python tools/make_demo.py",
        ],
        "vo": "This is CATNIP, an autonomous Solana agent built for the Hacka Cat "
              "hackathon. The brief: build a cat agent that trades all the cat runners. "
              "Everything you are about to see is real captured output from real "
              "commands, re-rendered here so it is readable at video resolution.",
        "hold": 0.6,
    },
    {
        "kind": "term",
        "title": "catnip - tests",
        "cmd": "npm test",
        "body": "tests.txt",
        "vo": "First, the tests. Eighty three of them, all offline and deterministic. "
              "They cover the detector, the strategy, every risk guard, the portfolio "
              "accounting, and whole run invariants: the agent can never exceed its own "
              "position cap, never spend cash it does not have, and never buy a trap.",
        "cps": 90,
    },
    {
        "kind": "term",
        "title": "catnip - scan",
        "cmd": "node src/index.js scan --frame 12",
        "body": "scan_fixture.txt",
        "vo": "Here is the hard part. Trading all the cat runners is a detection problem. "
              "Green rows are tradable cat runners: NEKO, MEOWFI, and P zero P C four T, "
              "which is leetspeak that a plain text match would miss. "
              "KITTYX is a cat and it is running, but its mint authority was never revoked, "
              "so the risk guard blocks it. KUCING, Indonesian for cat, is blocked because "
              "the pool is too thin to exit. "
              "And look at the bottom. CATALYST and BONKAI are running harder than anything "
              "on this screen, and the agent refuses both. DOGWIFCAT literally contains "
              "the word cat and is still rejected, penalised by dog, shiba and inu.",
        "cps": 55,
    },
    {
        "kind": "term",
        "title": "catnip - live market",
        "cmd": "node src/index.js scan --source live",
        "body": "scan_live.txt",
        "vo": "That was a deterministic test tape. This is the real Solana market, pulled "
              "live from a keyless public price API, read only. POPCAT and MEW are found and "
              "correctly treated as established markets rather than punished for being old. "
              "Thin and quiet pools are blocked. Advocat mentions a cat in its metadata and "
              "scores zero point four four, just under the threshold, so it is left alone. "
              "This was a quiet hour, so nothing was running, and the agent did nothing. "
              "That is the correct behaviour.",
        "cps": 80,
    },
    {
        "kind": "term",
        "title": "catnip - backtest",
        "cmd": "node src/index.js backtest",
        "body": "backtest.txt",
        "vo": "Now the full loop over four hours of tape. The agent bought four cat runners, "
              "took profit on four of them, and stopped out of the pump and dump on the way "
              "down. Seven closed trades, six wins, eighteen point eight percent, with a "
              "maximum drawdown under three percent. "
              "This is a synthetic tape, not a live track record. It is here to prove the "
              "loop is correct and the guards fire, not to claim edge.",
        "cps": 70,
    },
    {
        "kind": "term",
        "title": "catnip - on-chain audit trail",
        "cmd": "node tools/anchor-demo.js",
        "body": "anchor.txt",
        "vo": "Last piece. A trading agent you cannot audit is just a screenshot. "
              "So every decision CATNIP makes is anchored to Solana devnet as a memo "
              "transaction, hash chained to the one before it. "
              "This preview runs offline, with no key and no devnet SOL, so it shows "
              "the exact bytes the agent would send. "
              "Here is the exact memo. And here is what happens when an operator quietly "
              "edits a losing trade to look like a win: the hash no longer matches the "
              "record on chain, and verification breaks. The log is public chain state. "
              "It cannot be rewritten after the fact.",
        "cps": 70,
    },
    {
        "kind": "card",
        "title": "CATNIP",
        "subtitle": "MIT licensed - 83 tests - one dependency",
        "lines": [
            "npm install && npm test && npm run demo",
            "devnet only  -  no keys in the repo  -  no admin backdoor",
            "Warung Ops  -  built for Hacka Cat on HackaLaunch",
        ],
        "vo": "MIT licensed, one dependency, eighty three passing tests. Clone it, run npm "
              "test, and it works offline on any machine. Thanks for watching.",
        "hold": 0.6,
    },
]

VOICE = "en-US-AndrewNeural"


def synth(scene_index: int, text: str) -> tuple[Path, float]:
    """Narrate one scene. Prefers edge-tts; falls back to the offline Windows
    speech engine when the network is unavailable."""
    AUDIO.mkdir(parents=True, exist_ok=True)
    path = AUDIO / f"vo{scene_index:02d}.mp3"
    if not path.exists() or path.stat().st_size == 0:
        ok = False
        try:
            subprocess.run(
                ["edge-tts", "--voice", VOICE, "--rate", "+6%", "--text", text,
                 "--write-media", str(path)],
                check=True, capture_output=True, timeout=120,
            )
            ok = path.exists() and path.stat().st_size > 0
        except Exception:
            ok = False
        if not ok:
            wav = AUDIO / f"vo{scene_index:02d}.wav"
            subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                 "-File", str(ROOT / "tools" / "say.ps1"),
                 "-Text", text, "-Out", str(wav), "-Rate", "1"],
                check=True, capture_output=True,
            )
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(wav), "-af",
                 "highpass=f=90,acompressor=threshold=-18dB:ratio=3,loudnorm=I=-16:TP=-1.5:LRA=11",
                 "-b:a", "160k", str(path)],
                check=True, capture_output=True,
            )
            wav.unlink(missing_ok=True)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    return path, float(probe.stdout.strip())


def main() -> None:
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True)

    frame_index = 0
    audio_parts: list[tuple[Path, float, float]] = []  # path, start_s, duration
    elapsed = 0.0

    for scene_index, scene in enumerate(SCENES):
        vo_path, vo_len = synth(scene_index, scene["vo"])

        if scene["kind"] == "card":
            duration = vo_len + scene.get("hold", 1.0)
            image = render_card(scene["title"], scene["subtitle"], scene["lines"])
            for _ in range(int(duration * FPS)):
                image.save(FRAMES / f"f{frame_index:06d}.png")
                frame_index += 1
        else:
            body = cap(scene["body"])
            cps = scene.get("cps", 60)
            prompt = ("$ " + scene["cmd"], WHITE)
            # Type the command, then stream the captured output line by line.
            total_chars = sum(len(line) + 1 for line in body)
            type_seconds = total_chars / cps
            duration = max(vo_len + 1.2, type_seconds + 1.5)
            total_frames = int(duration * FPS)
            reveal_start = int(0.8 * FPS)
            reveal_frames = max(1, int(type_seconds * FPS))

            for frame in range(total_frames):
                progress = 0.0 if frame < reveal_start else min(
                    1.0, (frame - reveal_start) / reveal_frames)
                shown = int(progress * len(body))
                lines = [prompt] + [(line, colour_for(line)) for line in body[:shown]]
                if frame % 20 < 10 and shown < len(body):
                    lines.append(("_", GREEN))
                render_terminal(lines, scene["title"]).save(FRAMES / f"f{frame_index:06d}.png")
                frame_index += 1

        audio_parts.append((vo_path, elapsed + 0.35, vo_len))
        elapsed += duration
        print(f"scene {scene_index}: {duration:5.1f}s  (vo {vo_len:.1f}s)  frames -> {frame_index}")

    # --- mux -------------------------------------------------------------
    inputs: list[str] = ["-framerate", str(FPS), "-i", str(FRAMES / "f%06d.png")]
    for path, _, _ in audio_parts:
        inputs += ["-i", str(path)]

    delays = "".join(
        f"[{index + 1}:a]adelay={int(start * 1000)}|{int(start * 1000)}[a{index}];"
        for index, (_, start, _) in enumerate(audio_parts)
    )
    mixes = "".join(f"[a{index}]" for index in range(len(audio_parts)))
    filtergraph = f"{delays}{mixes}amix=inputs={len(audio_parts)}:normalize=0[aout]"

    cmd = [
        "ffmpeg", "-y", *inputs,
        "-filter_complex", filtergraph,
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-shortest", str(OUT),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    size_mb = OUT.stat().st_size / 1e6
    print(f"\nwrote {OUT}  ({size_mb:.1f} MB, {elapsed:.0f}s)")
    shutil.rmtree(FRAMES, ignore_errors=True)


if __name__ == "__main__":
    main()

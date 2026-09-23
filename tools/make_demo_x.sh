#!/usr/bin/env sh
# Time-compress the rendered demo to the one canonical cut.
#
#   python tools/make_demo.py      -> demo_raw.mp4  (natural pace, ~2:46)
#   sh tools/make_demo_x.sh        -> demo.mp4      (1.2x, ~2:18)
#
# 2:18 is under BOTH limits that matter: the hackathon's 3 minutes and X's
# 140 s non-premium video limit, so one file serves as the public link and the
# X post. No frames are dropped and no audio is cut - only the playback rate
# changes, so every captured line is still on screen.
set -eu

IN=${1:-demo_raw.mp4}
OUT=${2:-demo.mp4}
RATE=${3:-1.2}

[ -f "$IN" ] || { echo "missing $IN - run: python tools/make_demo.py" >&2; exit 1; }

ffmpeg -y -i "$IN" \
  -filter_complex "[0:v]setpts=PTS/${RATE}[v];[0:a]atempo=${RATE}[a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 160k "$OUT"

ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"

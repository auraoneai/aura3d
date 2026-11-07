#!/bin/bash
# Real-GPU, virtual-clock frames of live games from origin/main (port 8515) twice (noise floor) and from this branch (port 8514).
# usage: games.sh <outDir> <game> [game...]   e.g. games.sh /tmp/effects514/games top-tennis heatsink
cd "$(dirname "$0")/../../.." || exit 1
OUT="$1"; shift
mkdir -p "$OUT"
READY='document.querySelectorAll("canvas").length > 0'
qs() { case "$1" in heatsink) echo "?autostart=1&qaManual=1";; roadster-rush) echo "?capture=1";; *) echo "";; esac; }
for G in "$@"; do
  for TAG in base1:8534 base2:8534 branch:8514; do
    NAME="${TAG%%:*}"; PORT="${TAG##*:}"
    until mkdir /tmp/a3d-rea.lock 2>/dev/null; do sleep 5; done
    SETTLE_FRAMES="${SETTLE_FRAMES:-300}" nice -n 10 node evidence/effects-514/tools/cap.mjs "http://127.0.0.1:${PORT}/apps/showcase-${G}/index.html$(qs "$G")" "${OUT}/${G}-${NAME}" "2,4" "$READY" 960 540 2>&1 | tail -1 | cut -c1-700
    rmdir /tmp/a3d-rea.lock
  done
done

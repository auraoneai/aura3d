#!/bin/bash
# Pixel-neutrality capture: for each game, base (origin/main) A, branch, base B on the same virtual-clock shim.
# Default: wait for the WebGL canvas to light (CAP_WAIT_READY) with virtual time frozen, then step N frames.
# NO_WAIT=1: fixed CAP_SETTLE_MS real-time settle instead (for games whose canvas cannot be probed with readPixels); the
# resulting frames must then be checked by eye / luma to be real game frames.
# usage: games.sh <outdir> <slug>...   base server :18515 (origin/main worktree), branch server :18514. One lock hold.
OUT=$1; shift
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
if [ -n "$NO_WAIT" ]; then export CAP_SETTLE_MS=${CAP_SETTLE_MS:-14000}; else export CAP_WAIT_READY=1 CAP_SETTLE_MS=${CAP_SETTLE_MS:-3000}; fi
until mkdir /tmp/a3d-rea.lock 2>/dev/null; do sleep 0.5; done
trap 'rmdir /tmp/a3d-rea.lock 2>/dev/null' EXIT INT TERM
cap() { nice -n 10 node "$HERE/cap.mjs" "$1" "$2" "$3" ${W:-960} ${H:-540} 2>"$2.log"; rg -v "EXCEPTIONS" "$2.log" | head -3; }
for slug in "$@"; do
  url() { echo "http://127.0.0.1:$1/apps/showcase-$slug/index.html"; }
  cap "$(url 18515)" "$OUT/$slug-baseA.png" ${FRAMES:-90}
  if rg -q NOT_READY "$OUT/$slug-baseA.png.log"; then echo "skipped $slug (canvas never lit on base)"; continue; fi
  cap "$(url 18514)" "$OUT/$slug-branch.png" ${FRAMES:-90}
  cap "$(url 18515)" "$OUT/$slug-baseB.png" ${FRAMES:-90}
  echo "captured $slug"
done

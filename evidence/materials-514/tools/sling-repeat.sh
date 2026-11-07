#!/bin/bash
# Slingshot Siege run-to-run noise under the ORIGINAL capture method (games.sh: CAP_WAIT_READY readPixels probe, frame(0) while waiting).
# usage: sling-repeat.sh <outdir> [N=3]   -> base1..N (origin/main on :18515) and branch1..N (this branch on :18514), interleaved.
OUT=$1; N=${2:-3}
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
export CAP_WAIT_READY=1 CAP_SETTLE_MS=${CAP_SETTLE_MS:-3000}
until mkdir /tmp/a3d-rea.lock 2>/dev/null; do sleep 5; done
trap 'rmdir /tmp/a3d-rea.lock 2>/dev/null' EXIT INT TERM
for i in $(seq 1 "$N"); do
  for side in base branch; do
    port=18515; [ "$side" = branch ] && port=18514
    f="$OUT/slingshot-siege-$side$i.png"
    [ -s "$f" ] && continue
    nice -n 10 node "$HERE/cap.mjs" "http://127.0.0.1:$port/apps/showcase-slingshot-siege/index.html" "$f" ${FRAMES:-90} 960 540 2>"$f.log"
    rg READY "$f.log" | head -1
  done
done

#!/bin/bash
# Pixel-neutrality capture, v2: per game, base A, branch A, base B, branch B (so base-vs-base AND branch-vs-branch noise are measured),
# all on the virtual-clock shim, each capture waiting (virtual time frozen) for the network to go quiet first (CAP_NET_IDLE).
# usage: neutral.sh <outdir> <slug>[?query] ...   base server BASE_PORT (default :18515, origin/main worktree), branch server BRANCH_PORT (default :18514); use the route-public-proxy.mjs ports for games with route-local assets.
# Hold /tmp/a3d-rea.lock for the whole batch (one real-GPU capture at a time).
OUT=$1; shift
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
export CAP_NET_IDLE=1 CAP_SETTLE_MS=${CAP_SETTLE_MS:-4000} CAP_WAIT_MAX_MS=${CAP_WAIT_MAX_MS:-100000}
until mkdir /tmp/a3d-rea.lock 2>/dev/null; do sleep 5; done
trap 'rmdir /tmp/a3d-rea.lock 2>/dev/null' EXIT INT TERM
cap() { [ -s "$2" ] && return 0; curl -sf -o /dev/null "$1" || { echo "SERVER DOWN for $1: not capturing"; return 1; }; for try in 1 2 3; do nice -n 10 node "$HERE/cap.mjs" "$1" "$2" "$3" ${W:-960} ${H:-540} 2>"$2.log"; [ -s "$2" ] && break; echo "retry $2 (try $try failed)"; done; rg "NETIDLE" "$2.log" | head -2; }
for spec in "$@"; do
  slug=${spec%%\?*}; query=""; [ "$slug" != "$spec" ] && query="?${spec#*\?}"
  name=${slug}
  url() { echo "http://127.0.0.1:$1/apps/showcase-$slug/index.html$query"; }
  BASE=${BASE_PORT:-18515}; BR=${BRANCH_PORT:-18514}
  cap "$(url $BASE)" "$OUT/$name-baseA.png" ${FRAMES:-90}
  # The readPixels probe cannot see some canvases (no preserved drawing buffer); NOT_READY is recorded, never skipped:
  # every frame is verified by eye afterwards.
  cap "$(url $BR)" "$OUT/$name-branchA.png" ${FRAMES:-90}
  cap "$(url $BASE)" "$OUT/$name-baseB.png" ${FRAMES:-90}
  cap "$(url $BR)" "$OUT/$name-branchB.png" ${FRAMES:-90}
  echo "captured $name"
done

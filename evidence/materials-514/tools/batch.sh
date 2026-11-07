#!/bin/bash
# usage: batch.sh <outdir> <name>=<path-under-vite-root> ...   (one lock hold for the whole batch)
# Example: batch.sh /tmp/out m1-before=evidence/materials-514/m1/before.html
OUT=$1; shift
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT=${VITE_PORT:-8514}
mkdir -p "$OUT"
until mkdir /tmp/a3d-rea.lock 2>/dev/null; do sleep 0.5; done
trap 'rmdir /tmp/a3d-rea.lock 2>/dev/null' EXIT INT TERM
for spec in "$@"; do
  name=${spec%%=*}; path=${spec#*=}
  nice -n 10 node "$HERE/cap.mjs" "http://127.0.0.1:$PORT/$path" "$OUT/$name.png" ${FRAMES:-90} ${W:-640} ${H:-360}
  echo "captured $name"
done

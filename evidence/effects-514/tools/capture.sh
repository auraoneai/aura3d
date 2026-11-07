#!/bin/bash
# usage: capture.sh <scene> <before|after> [times=1,3] [outDir=frames]
# Holds the shared REA/GPU lock only while capturing.
cd "$(dirname "$0")/../../.." || exit 1
SCENE="$1"; V="$2"; TIMES="${3:-1,3}"; OUT="${4:-evidence/effects-514/frames}"
until mkdir /tmp/a3d-rea.lock 2>/dev/null; do sleep 5; done
trap 'rmdir /tmp/a3d-rea.lock' EXIT INT TERM
nice -n 10 node evidence/effects-514/tools/cap.mjs "http://127.0.0.1:${PORT:-8514}/evidence/effects-514/pages/index.html?s=${SCENE}&v=${V}" "${OUT}/${SCENE}-${V}" "$TIMES"

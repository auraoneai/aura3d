#!/usr/bin/env bash
# Real-GPU capture of the live games. Usage:
#   tools/real-gpu/run.sh [games|all] [outdir]       e.g.  tools/real-gpu/run.sh all
# Needs Node, the repo's `playwright` package and Chrome. On a Mac run it headed (a real display and GPU):
#   REAL_GPU_HEADLESS=false tools/real-gpu/run.sh links
set -euo pipefail
cd "$(dirname "$0")/../.."
games="${1:-all}"
out="${2:-evidence/real-gpu/$(date +%F)}"
sel=(--all); [ "$games" != "all" ] && sel=(--games "$games")
exec node tools/real-gpu/capture.mjs "${sel[@]}" --out "$out" --headless "${REAL_GPU_HEADLESS:-new}" ${CHROME_PATH:+--chrome "$CHROME_PATH"} ${REAL_GPU_BASE:+--base "$REAL_GPU_BASE"}

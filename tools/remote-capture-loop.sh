#!/usr/bin/env bash
# tools/remote-capture-loop.sh — patient evidence collector.
# Fires single-shot captures against the remote capture server, pulling each
# artifact immediately. Retries around sibling contention / OOM windows.
#
# Usage: tools/remote-capture-loop.sh <route> <urlPath> <localOutDir> <nShots> [waitMs]
set -uo pipefail

ROUTE="${1:?route}"
URL_PATH="${2:?urlPath}"
OUT="${3:?outDir}"
N="${4:-7}"
WAIT_MS="${5:-15000}"
PORT="${CAPTURE_LOCAL_PORT:-18099}"
mkdir -p "$OUT"

enc() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$URL_PATH"; }

for i in $(seq 0 $((N - 1))); do
  got=0
  for attempt in $(seq 1 20); do
    # fast-fail on dead tunnel/server instead of burning a 700s POST timeout
    if ! curl -sS --max-time 10 -o /dev/null "http://127.0.0.1:${PORT}/health" 2>/dev/null; then
      echo "[loop] shot-$i attempt $attempt: server unreachable; backing off"
      sleep 45
      continue
    fi
    # fire one capture; the remote run wipes its out dir each POST, so pull
    # shot-0 immediately after the POST returns (or if it dies, check anyway).
    curl -sS --max-time 300 -X POST \
      "http://127.0.0.1:${PORT}/capture/${ROUTE}?url=$(enc)&waitMs=${WAIT_MS}&shots=1&shotInterval=2000&w=800&h=450" \
      -o "$OUT/last-result.json" 2>/dev/null
    sleep 3
    if curl -sS --max-time 60 "http://127.0.0.1:${PORT}/out/${ROUTE}/shot-0.png" -o "$OUT/shot-$i.png" 2>/dev/null && [ -s "$OUT/shot-$i.png" ] && head -c4 "$OUT/shot-$i.png" | od -An -tx1 | tr -d ' \n' | grep -q '^89504e47$'; then
      echo "[loop] shot-$i ok (attempt $attempt)"
      # pull the rest of this run's artifacts once, on the first good shot
      for f in console.log errors.log evidence.json metrics.json game-beacon.json; do
        curl -sS --max-time 30 "http://127.0.0.1:${PORT}/out/${ROUTE}/$f" -o "$OUT/$f" 2>/dev/null || true
      done
      got=1
      break
    fi
    rm -f "$OUT/shot-$i.png"
    echo "[loop] shot-$i attempt $attempt failed; backing off"
    sleep $((attempt < 10 ? attempt * 15 : 150))
  done
  [ "$got" = 1 ] || echo "[loop] shot-$i gave up after 40 attempts"
  # vary the phase a little between shots so captures differ
  sleep 8
done
echo "[loop] done -> $OUT"
ls -la "$OUT"

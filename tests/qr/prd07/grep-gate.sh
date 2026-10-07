#!/usr/bin/env bash
# PRD-07 P7-T3 — §10 item 6 grep gate (failing step in prd07-vfx.yml).
# `rg "RootGpuParticleWorkload|prd07\.legacy|legacyPrimitiveNodes"` across
# packages/apps/templates/examples may only hit files in
# grep-gate-allowlist.txt. A match anywhere else fails the build — new legacy
# seams must not appear, and after the removal PR the (emptied) allowlist
# makes any leftover fail too.
set -euo pipefail
cd "$(dirname "$0")/../../.."

PATTERN='RootGpuParticleWorkload|prd07\.legacy|legacyPrimitiveNodes'
ALLOWLIST="tests/qr/prd07/grep-gate-allowlist.txt"

# bash 3.2 (macOS /bin/bash) has no `mapfile` — read into the array manually.
allow=()
while IFS= read -r line; do
  allow+=("$line")
done < <(grep -v '^#' "$ALLOWLIST" | grep -v '^[[:space:]]*$' | sort -u)
hits=$(rg -lN "$PATTERN" packages apps templates examples 2>/dev/null | sort -u || true)

fail=0
if [ -n "$hits" ]; then
  while IFS= read -r file; do
    if ! printf '%s\n' "${allow[@]}" | grep -qxF "$file"; then
      echo "::error file=$file::grep-gate hit outside allowlist — '$PATTERN' has no sanctioned site here"
      rg -nN "$PATTERN" "$file" || true
      fail=1
    fi
  done <<< "$hits"
fi
if [ "$fail" -eq 0 ]; then
  count=$(printf '%s' "$hits" | grep -c . || true)
  echo "grep-gate: ${count} file(s) match '$PATTERN', all allowlisted"
else
  exit 1
fi

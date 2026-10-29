#!/usr/bin/env bash
# Runs the Wonder World browser specs on the serverless ACR runner (tools/remote-acr/run.sh, az-auraone-gurbaksh).
# Never runs a browser on this machine. Usage, from anywhere in the repo:
#   apps/veer-wonder-world/tools/remote-run.sh first-frame build    # selected specs (file-name stems after wonder-world-)
# One run per line of the list in tests/browser/wonder-world-lib.ts: an ACR step stops at 60 minutes, so never run
# every spec in one go (no arguments selects them all, which only fits a tiny subset).
# Results land in tests/reports/remote-acr/<RUN_ID>/ (gitignored); copy the evidence you keep into evidence/veer-wonder-world/.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"
if [ "$#" -gt 0 ]; then
  SPECS=""
  for stem in "$@"; do SPECS="${SPECS:+$SPECS }tests/browser/wonder-world-${stem}.spec.ts"; done
else
  SPECS="$(ls tests/browser/wonder-world-*.spec.ts | tr '\n' ' ')"
fi
export SPECS
export EXTRA_DIRS="apps/veer-wonder-world"
export RUN_ID="${RUN_ID:-wonder-$(date -u +%Y%m%dT%H%M%SZ)}"
export AURA3D_REPORTER="${AURA3D_REPORTER:-line,json}"
# Ephemeral by default: the run image is deleted from the registry when the run ends.
export KEEP_IMAGE="${KEEP_IMAGE:-0}"
# The commit under test, for every spec's run record (gitignored; "dirty" when the app or the specs have edits that
# are not committed). A run that reuses an image (BUILD=0) tests the file written when that image was built.
{
  git rev-parse HEAD 2>/dev/null || echo unknown
  if [ -z "$(git status --porcelain -- apps/veer-wonder-world tests/browser 2>/dev/null)" ]; then echo clean; else echo dirty; fi
} > apps/veer-wonder-world/.run-commit
exec tools/remote-acr/run.sh

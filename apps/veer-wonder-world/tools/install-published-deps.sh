#!/usr/bin/env bash
# One-time setup for the app's local checks (README "Checks"): installs the published @aura3d 4.6.2 packages and the
# tools they need (tsc, vitest, tsx, vite) into the gitignored artifacts/wonder-deps/, then links
# apps/veer-wonder-world/node_modules to it. The app's own package.json uses `workspace:*`, which npm cannot install,
# and apps/* is not a pnpm workspace member (07 C2), so the published set lives in tools/published-deps.json instead.
#   apps/veer-wonder-world/tools/install-published-deps.sh
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$APP/../.." && pwd)"
DEPS="$REPO/artifacts/wonder-deps"
mkdir -p "$DEPS"
cp "$APP/tools/published-deps.json" "$DEPS/package.json"
(cd "$DEPS" && npm install --no-audit --no-fund)
if [ -L "$APP/node_modules" ] || [ ! -e "$APP/node_modules" ]; then
  ln -sfn ../../artifacts/wonder-deps/node_modules "$APP/node_modules"
else
  echo "apps/veer-wonder-world/node_modules exists and is not a link; leaving it as it is" >&2
fi
"$APP/node_modules/.bin/tsc" --version

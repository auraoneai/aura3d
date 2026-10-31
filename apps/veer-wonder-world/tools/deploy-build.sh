#!/usr/bin/env bash
# The preview deploy's build. deploy/vercel.json runs it on the deploy host from the upload root, after
# `pnpm install --frozen-lockfile`; it is never run on a developer Mac (DEPLOYMENT.md section 1). The steps:
# 1. the content lint (PRD 04 J14), so content it rejects is never built;
# 2. the Vite build into apps/veer-wonder-world/dist (quiet: the default output lists about a thousand files);
# 3. tools/check-dist.mjs: noindex kept, no source maps, no child name in a served text file;
# 4. the static `aura3d check-deploy --no-assets` (DEPLOYMENT.md section 2; the browser pass runs on the remote
#    runner in tests/browser/wonder-world-build.spec.ts).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_DIR="$REPO_ROOT/apps/veer-wonder-world"
cd "$REPO_ROOT"
# The deploy host passes its own variables to the build, among them VITE_VERCEL_* (the deployment's URLs and IDs).
# The engine reads import.meta.env as one object (packages/game/src/index.ts), so Vite would inline every VITE_
# variable into the public bundle. The app reads none, so none reach the build.
for name in $(compgen -e); do
  case "$name" in VITE_*) unset "$name" ;; esac
done
node "$APP_DIR/tools/validate-wonder-world-content.mjs"
node_modules/.bin/vite build "$APP_DIR" --logLevel warn
node "$APP_DIR/tools/check-dist.mjs"
cd "$APP_DIR"
npx -y @aura3d/cli@4.6.2 check-deploy --dist dist --no-assets

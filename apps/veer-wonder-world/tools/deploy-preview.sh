#!/usr/bin/env bash
# Deploys Wonder World to its unlisted preview (DEPLOYMENT.md section 3): the Vercel project aura3d-wonder-world,
# served at its own production domain and at the owner's custom domain. Every response carries X-Robots-Tag: noindex
# (deploy/vercel.json). This repository is public, so no address is written in it: a --prod deploy writes the
# project address to apps/veer-wonder-world/.preview-url (gitignored), where the live check reads it. The deploy host
# installs and builds (tools/deploy-build.sh); nothing is built or opened in a browser on this machine. Usage, from
# anywhere in the repo:
#   apps/veer-wonder-world/tools/deploy-preview.sh                 # a preview deployment of origin/main
#   apps/veer-wonder-world/tools/deploy-preview.sh --prod          # production: moves the preview address to it
#   apps/veer-wonder-world/tools/deploy-preview.sh --prod <ref>    # a given commit, branch or tag
# The commit is checked out into a temporary worktree without LFS content (the build reads no LFS file), its own two
# files in apps/veer-wonder-world/deploy/ are copied to the worktree root as vercel.json and .vercelignore, and the
# worktree is removed afterwards. Preview deployments sit behind the Vercel team login; only --prod moves the
# address. Roll back with `vercel-auraone rollback` (DEPLOYMENT.md section 5).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VERCEL="${VERCEL:-vercel-auraone}"
# The Vercel team of the Aura3D site (the aura3d project), by ID, and a project name without the child's name.
TEAM="team_peHZvhHKYn5UsgYkLDOeaDm0"
PROJECT="aura3d-wonder-world"

TARGET=()
if [ "${1:-}" = "--prod" ]; then
  TARGET=(--prod)
  shift
fi
REF="${1:-origin/main}"
COMMIT="$(git -C "$REPO_ROOT" rev-parse --verify "${REF}^{commit}")"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/wonder-deploy.XXXXXX")"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORK/src" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM
GIT_LFS_SKIP_SMUDGE=1 git -C "$REPO_ROOT" worktree add --detach --quiet "$WORK/src" "$COMMIT"
DEPLOY_DIR="$WORK/src/apps/veer-wonder-world/deploy"
if [ ! -f "$DEPLOY_DIR/vercel.json" ] || [ ! -f "$DEPLOY_DIR/vercelignore" ]; then
  echo "deploy-preview: ${COMMIT} has no apps/veer-wonder-world/deploy/ files; deploy a commit that has them" >&2
  exit 1
fi
cp "$DEPLOY_DIR/vercel.json" "$WORK/src/vercel.json"
cp "$DEPLOY_DIR/vercelignore" "$WORK/src/.vercelignore"

echo "Deploying ${COMMIT} to ${PROJECT} (${TARGET[*]:-preview})"
"$VERCEL" deploy "$WORK/src" --yes --scope "$TEAM" --project "$PROJECT" ${TARGET[@]+"${TARGET[@]}"} --meta "commit=${COMMIT}"
if [ "${#TARGET[@]}" -gt 0 ]; then
  echo "https://${PROJECT}.vercel.app/" > "$REPO_ROOT/apps/veer-wonder-world/.preview-url"
fi

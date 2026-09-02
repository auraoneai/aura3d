#!/usr/bin/env bash
set -u

readonly MESHY_PACKAGE="@meshy-ai/cli@0.2.0"
readonly MESHY_VERSION="0.2.0"
check_only=0
check_balance=0

usage() {
  cat <<'USAGE'
Usage: setup-meshy.sh [--check] [--balance]

  --check    Verify prerequisites, CLI version, and authentication without mutation.
  --balance  Query the credit balance after authentication (read-only).
USAGE
}

while (($#)); do
  case "$1" in
    --check) check_only=1 ;;
    --balance) check_balance=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'setup-meshy: unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if ! command -v node >/dev/null 2>&1; then
  echo "setup-meshy: Node.js 24 or newer is required; node was not found." >&2
  exit 3
fi

node_version_output=$(node --version 2>/dev/null)
node_status=$?
if ((node_status != 0)); then
  echo "setup-meshy: unable to determine the Node.js version." >&2
  exit "$node_status"
fi
node_version=${node_version_output#v}
node_major=${node_version%%.*}
if [[ ! "$node_major" =~ ^[0-9]+$ ]] || ((node_major < 24)); then
  printf 'setup-meshy: Node.js 24 or newer is required; detected %s.\n' "$node_version_output" >&2
  exit 3
fi
printf 'Node.js: %s\n' "$node_version_output"

if ! command -v npm >/dev/null 2>&1; then
  echo "setup-meshy: npm is required but was not found." >&2
  exit 3
fi
npm_version=$(npm --version 2>/dev/null)
npm_status=$?
if ((npm_status != 0)); then
  echo "setup-meshy: unable to determine the npm version." >&2
  exit "$npm_status"
fi
printf 'npm: %s\n' "$npm_version"

meshy_version() {
  local raw status version
  raw=$(meshy --version 2>/dev/null)
  status=$?
  if ((status != 0)); then
    return "$status"
  fi
  version=$(printf '%s\n' "$raw" | awk 'match($0, /[0-9]+\.[0-9]+\.[0-9]+/) { print substr($0, RSTART, RLENGTH); exit }')
  if [[ -z "$version" ]]; then
    return 65
  fi
  printf '%s\n' "$version"
}

installed_version=""
if command -v meshy >/dev/null 2>&1; then
  installed_version=$(meshy_version)
  version_status=$?
  if ((version_status != 0)); then
    echo "setup-meshy: 'meshy --version' failed." >&2
    exit "$version_status"
  fi
fi

if [[ "$installed_version" != "$MESHY_VERSION" ]]; then
  if ((check_only)); then
    if [[ -z "$installed_version" ]]; then
      printf 'setup-meshy: Meshy CLI %s is not installed.\n' "$MESHY_VERSION" >&2
      exit 4
    fi
    printf 'setup-meshy: Meshy CLI %s is required; detected %s.\n' "$MESHY_VERSION" "$installed_version" >&2
    exit 5
  fi

  printf 'Installing exact package %s...\n' "$MESHY_PACKAGE"
  npm install --global "$MESHY_PACKAGE"
  install_status=$?
  if ((install_status != 0)); then
    echo "setup-meshy: npm installation failed." >&2
    exit "$install_status"
  fi
  hash -r

  if ! command -v meshy >/dev/null 2>&1; then
    echo "setup-meshy: installation completed but the meshy executable is unavailable." >&2
    exit 4
  fi
  installed_version=$(meshy_version)
  version_status=$?
  if ((version_status != 0)); then
    echo "setup-meshy: installed 'meshy --version' failed." >&2
    exit "$version_status"
  fi
  if [[ "$installed_version" != "$MESHY_VERSION" ]]; then
    printf 'setup-meshy: expected Meshy CLI %s after install; detected %s.\n' "$MESHY_VERSION" "$installed_version" >&2
    exit 5
  fi
else
  printf 'Meshy CLI: %s (already installed)\n' "$installed_version"
fi

meshy --help >/dev/null
help_status=$?
if ((help_status != 0)); then
  echo "setup-meshy: 'meshy --help' failed." >&2
  exit "$help_status"
fi
printf 'Meshy CLI verification: version %s and help succeeded.\n' "$installed_version"

if [[ -n "${MESHY_API_KEY:-}" ]]; then
  echo "Authentication source: MESHY_API_KEY is set in the environment (value hidden)."
fi

if meshy auth status >/dev/null 2>&1; then
  authenticated=1
  echo "Authentication: authenticated (credential details hidden)."
else
  authenticated=0
  echo "Authentication: not authenticated."
  echo "For local interactive use, run: meshy auth login"
  echo "For CI, inject MESHY_API_KEY through the CI secret manager environment."
fi

if ((check_balance)); then
  if ((authenticated)); then
    meshy balance
    balance_status=$?
    if ((balance_status != 0)); then
      echo "setup-meshy: 'meshy balance' failed." >&2
      exit "$balance_status"
    fi
  else
    echo "Balance: skipped because authentication is unavailable."
  fi
fi

if ((check_only)); then
  echo "Check complete; no installation or login was performed."
else
  echo "Meshy CLI setup complete."
fi

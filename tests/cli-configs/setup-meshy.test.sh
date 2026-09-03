#!/usr/bin/env bash
set -eu
SCRIPT=$(cd "$(dirname "$0")/../.." && pwd)/cli-configs/setup-meshy.sh
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
pass=0
assert_status() { expected=$1; shift; set +e; "$@" >"$TMP/out" 2>"$TMP/err"; actual=$?; set -e; [ "$actual" -eq "$expected" ] || { echo "expected status $expected, got $actual" >&2; cat "$TMP/out" "$TMP/err" >&2; exit 1; }; }
assert_contains() { grep -F -- "$2" "$1" >/dev/null || { echo "missing: $2" >&2; cat "$1" >&2; exit 1; }; }
assert_not_contains() { ! grep -F -- "$2" "$1" >/dev/null || { echo "unexpected: $2" >&2; cat "$1" >&2; exit 1; }; }
new_case() { CASE=$TMP/case-$pass; pass=$((pass+1)); mkdir -p "$CASE/bin"; : >"$CASE/log"; }
make_exe() { name=$1; shift; printf '#!/bin/sh
%s
' "$*" >"$CASE/bin/$name"; chmod 755 "$CASE/bin/$name"; }
run_case() { env -i PATH="$CASE/bin:/usr/bin:/bin" HOME="$CASE/home" FAKE_BIN="$CASE/bin" FAKE_LOG="$CASE/log" FAKE_MESHY_VERSION="${FAKE_MESHY_VERSION:-0.2.0}" INSTALL_SOURCE="${INSTALL_SOURCE:-}" MESHY_API_KEY="${MESHY_API_KEY:-}" MESHY_HELP_EXIT="${MESHY_HELP_EXIT:-0}" MESHY_BALANCE_EXIT="${MESHY_BALANCE_EXIT:-0}" "$@"; }
# shellcheck disable=SC2016 # Literal body is written to a fake executable.
node24() { make_exe node 'if [ "${1:-}" = --version ]; then echo "v24.19.0"; else exit 0; fi'; }
# shellcheck disable=SC2016 # Literal body is written to a fake executable.
npm_fake() { make_exe npm 'printf "npm:%s\n" "$*" >> "$FAKE_LOG"; if [ "${1:-}" = --version ]; then echo 11.1.0; exit 0; fi; if [ "${1:-}" = install ] && [ -n "${INSTALL_SOURCE:-}" ]; then cp "$INSTALL_SOURCE" "$FAKE_BIN/meshy"; chmod 755 "$FAKE_BIN/meshy"; fi; exit "${NPM_EXIT:-0}"'; }
meshy_fake() {
  FAKE_MESHY_VERSION=${1:-0.2.0}
  cat >"$CASE/bin/meshy" <<'FAKE'
#!/bin/sh
printf 'meshy:%s\n' "$*" >> "$FAKE_LOG"
case "${1:-}" in
  --version) echo "$FAKE_MESHY_VERSION"; exit "${MESHY_VERSION_EXIT:-0}" ;;
  --help) exit "${MESHY_HELP_EXIT:-0}" ;;
  auth) exit "${MESHY_AUTH_EXIT:-0}" ;;
  balance) echo 'Balance: 25.5'; exit "${MESHY_BALANCE_EXIT:-0}" ;;
esac
exit 0
FAKE
  chmod 755 "$CASE/bin/meshy"
}

new_case
make_exe npm 'exit 0'
assert_status 3 run_case "$SCRIPT"
assert_contains "$TMP/err" "node was not found"

new_case
make_exe node 'echo v23.9.0'
npm_fake
assert_status 3 run_case "$SCRIPT"
assert_contains "$TMP/err" "detected v23.9.0"
assert_not_contains "$CASE/log" "install"

new_case
node24
assert_status 3 run_case "$SCRIPT"
assert_contains "$TMP/err" "npm is required"

new_case
node24
npm_fake
assert_status 4 run_case "$SCRIPT" --check
assert_not_contains "$CASE/log" "npm:install"

new_case
node24
npm_fake
meshy_fake 0.1.9
assert_status 5 run_case "$SCRIPT" --check
assert_contains "$TMP/err" "detected 0.1.9"
assert_not_contains "$CASE/log" "npm:install"

new_case
node24
npm_fake
cat >"$CASE/source-meshy" <<'FAKE'
#!/bin/sh
printf 'meshy:%s
' "$*" >> "$FAKE_LOG"
case "${1:-}" in --version) echo 0.2.0;; --help) exit 0;; auth) exit 1;; esac
FAKE
chmod 755 "$CASE/source-meshy"
INSTALL_SOURCE="$CASE/source-meshy" assert_status 0 run_case "$SCRIPT"
assert_contains "$CASE/log" "npm:install --global @meshy-ai/cli@0.2.0"
assert_not_contains "$CASE/log" "@latest"
assert_contains "$TMP/out" "meshy auth login"

new_case
node24
npm_fake
meshy_fake
assert_status 0 run_case "$SCRIPT" --check --balance
assert_contains "$TMP/out" "already installed"
assert_contains "$TMP/out" "Authentication: authenticated"
assert_contains "$TMP/out" "Balance: 25.5"
assert_contains "$TMP/out" "no installation or login was performed"
assert_not_contains "$CASE/log" "npm:install"

new_case
node24
npm_fake
meshy_fake
SECRET='synthetic-ci-secret-value'
MESHY_API_KEY="$SECRET" assert_status 0 run_case "$SCRIPT" --check
cat "$TMP/out" "$TMP/err" "$CASE/log" >"$TMP/combined"
assert_contains "$TMP/out" "value hidden"
assert_not_contains "$TMP/combined" "$SECRET"
assert_not_contains "$CASE/log" "--api-key"

new_case
node24
npm_fake
meshy_fake
MESHY_HELP_EXIT=41 assert_status 41 run_case "$SCRIPT" --check

new_case
node24
npm_fake
meshy_fake
MESHY_BALANCE_EXIT=42 assert_status 42 run_case "$SCRIPT" --check --balance

echo "setup-meshy.test.sh: 10 cases passed"

#!/usr/bin/env bash
set -eu
SCRIPT=$(cd "$(dirname "$0")/../.." && pwd)/cli-configs/meshy-mcp-keychain-launcher
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
pass=0
assert_status() { expected=$1; shift; set +e; "$@" >"$TMP/out" 2>"$TMP/err"; actual=$?; set -e; [ "$actual" -eq "$expected" ] || { echo "expected status $expected, got $actual" >&2; cat "$TMP/out" "$TMP/err" >&2; exit 1; }; }
assert_contains() { grep -F -- "$2" "$1" >/dev/null || { echo "missing: $2" >&2; cat "$1" >&2; exit 1; }; }
assert_not_contains() { ! grep -F -- "$2" "$1" >/dev/null || { echo "unexpected: $2" >&2; cat "$1" >&2; exit 1; }; }
new_case() { CASE="$TMP/case-$pass"; pass=$((pass + 1)); mkdir -p "$CASE/bin"; : >"$CASE/log"; }
run_case() { env -i PATH="$CASE/bin:/bin" USER="test-user" FAKE_LOG="$CASE/log" FAKE_KEY="${FAKE_KEY-synthetic-key-that-must-stay-hidden}" SECURITY_EXIT="${SECURITY_EXIT:-0}" MESHY_KEYCHAIN_SERVICE="${MESHY_KEYCHAIN_SERVICE:-}" MESHY_KEYCHAIN_ACCOUNT="${MESHY_KEYCHAIN_ACCOUNT:-}" "$@"; }
security_fake() {
  cat >"$CASE/bin/security" <<'FAKE'
#!/bin/sh
printf 'security-argc=%s\n' "$#" >>"$FAKE_LOG"
for arg in "$@"; do printf 'security-arg=%s\n' "$arg" >>"$FAKE_LOG"; done
[ "${SECURITY_EXIT:-0}" -eq 0 ] || exit "$SECURITY_EXIT"
printf '%s\n' "${FAKE_KEY:-}"
FAKE
  chmod 755 "$CASE/bin/security"
}
npx_fake() {
  cat >"$CASE/bin/npx" <<'FAKE'
#!/bin/sh
[ "${MESHY_API_KEY:-}" = "${FAKE_KEY:-}" ] || { echo 'key was not exported' >&2; exit 90; }
printf 'npx-argc=%s\n' "$#" >>"$FAKE_LOG"
for arg in "$@"; do printf 'npx-arg=%s\n' "$arg" >>"$FAKE_LOG"; done
printf 'key=present\n' >>"$FAKE_LOG"
exit "${NPX_EXIT:-0}"
FAKE
  chmod 755 "$CASE/bin/npx"
}

new_case
npx_fake
assert_status 3 run_case "$SCRIPT"
assert_contains "$TMP/err" 'macOS security tool was not found'
new_case
security_fake
assert_status 3 run_case "$SCRIPT"
assert_contains "$TMP/err" 'npx is required'
new_case
security_fake
npx_fake
SECRET='synthetic-key-that-must-stay-hidden'
FAKE_KEY="$SECRET" assert_status 0 run_case "$SCRIPT"
assert_contains "$CASE/log" 'security-arg=find-generic-password'
assert_contains "$CASE/log" 'security-arg=-w'
assert_contains "$CASE/log" 'security-arg=aura3d-meshy-mcp'
assert_contains "$CASE/log" 'security-arg=test-user'
assert_contains "$CASE/log" 'npx-arg=-y'
assert_contains "$CASE/log" 'npx-arg=@meshy-ai/meshy-mcp-server@0.5.1'
assert_contains "$CASE/log" 'key=present'
cat "$TMP/out" "$TMP/err" "$CASE/log" >"$TMP/combined"
assert_not_contains "$TMP/combined" "$SECRET"
[ "$(grep -c '^npx-arg=' "$CASE/log")" -eq 2 ]
new_case
security_fake
npx_fake
MESHY_KEYCHAIN_SERVICE='custom-service' MESHY_KEYCHAIN_ACCOUNT='custom-account' assert_status 0 run_case "$SCRIPT"
assert_contains "$CASE/log" 'security-arg=custom-service'
assert_contains "$CASE/log" 'security-arg=custom-account'
new_case
security_fake
npx_fake
SECURITY_EXIT=44 assert_status 4 run_case "$SCRIPT"
assert_contains "$TMP/err" 'could not read Meshy API key'
assert_not_contains "$CASE/log" 'npx-arg='
new_case
security_fake
npx_fake
FAKE_KEY='' assert_status 4 run_case "$SCRIPT"
assert_contains "$TMP/err" 'returned an empty Meshy API key'
assert_not_contains "$CASE/log" 'npx-arg='
echo "meshy-mcp-keychain-launcher.test.sh: 6 cases passed"

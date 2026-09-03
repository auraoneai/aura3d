#!/usr/bin/env bash
set -eu
SCRIPT=$(cd "$(dirname "$0")/../.." && pwd)/cli-configs/meshy-agent
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
run_case() { (cd "$CASE" && env -i PATH="$CASE/bin:/usr/bin:/bin" HOME="$CASE/home" FAKE_BIN="$CASE/bin" FAKE_LOG="$CASE/log" FAKE_MESHY_VERSION="${FAKE_MESHY_VERSION:-0.2.0}" FAKE_AGENT_EXIT="${FAKE_AGENT_EXIT:-0}" MESHY_API_KEY="${MESHY_API_KEY:-}" MESHY_AUTH_EXIT="${MESHY_AUTH_EXIT:-0}" MESHY_BALANCE="${MESHY_BALANCE:-25.5}" MESHY_MIN_BALANCE="${MESHY_MIN_BALANCE:-}" "$@"); }
meshy_fake() {
  FAKE_MESHY_VERSION=${1:-0.2.0}
  cat >"$CASE/bin/meshy" <<'FAKE'
#!/bin/sh
printf 'meshy:%s\n' "$*" >> "$FAKE_LOG"
case "${1:-}" in
  --version) echo "$FAKE_MESHY_VERSION"; exit "${MESHY_VERSION_EXIT:-0}" ;;
  auth) exit "${MESHY_AUTH_EXIT:-0}" ;;
  balance) echo "Balance: ${MESHY_BALANCE:-25.5}"; exit "${MESHY_BALANCE_EXIT:-0}" ;;
esac
exit 0
FAKE
  chmod 755 "$CASE/bin/meshy"
}
uuid_fake() { make_exe uuidgen 'echo 123E4567-E89B-42D3-A456-426614174000'; }
agent_fake() {
  FAKE_AGENT_EXIT=${1:-0}
  cat >"$CASE/bin/codex-kiro" <<'FAKE'
#!/bin/sh
printf 'client=%s\njob=%s\nsession=%s\nroot=%s\nargc=%s\n' "$PRISM_CLIENT_ID" "$PRISM_JOB_TYPE" "$PRISM_SESSION_ID" "$MESHY_OUTPUT_ROOT" "$#" >> "$FAKE_LOG"
for arg in "$@"; do printf 'arg=%s\n' "$arg" >> "$FAKE_LOG"; done
exit "$FAKE_AGENT_EXIT"
FAKE
  chmod 755 "$CASE/bin/codex-kiro"
}

new_case
meshy_fake
uuid_fake
assert_status 2 run_case "$SCRIPT"
assert_status 127 run_case "$SCRIPT" --agent missing-agent

new_case
meshy_fake 0.3.0
uuid_fake
agent_fake
assert_status 5 run_case "$SCRIPT" --agent codex-kiro
assert_contains "$TMP/err" "detected 0.3.0"

new_case
meshy_fake
uuid_fake
agent_fake
MESHY_AUTH_EXIT=43 assert_status 43 run_case "$SCRIPT" --agent codex-kiro
assert_contains "$TMP/err" "authentication is required"

new_case
meshy_fake
uuid_fake
agent_fake 47
assert_status 47 run_case "$SCRIPT" --agent codex-kiro

new_case
meshy_fake
uuid_fake
agent_fake
ROOT="$CASE/outputs"
assert_status 0 run_case "$SCRIPT" --agent codex-kiro --output-root "$ROOT"
assert_status 0 run_case "$SCRIPT" --agent codex-kiro --output-root "$ROOT"
SESSION=$(cat "$ROOT/.meshy-agent-session")
[ "$SESSION" = 123e4567-e89b-42d3-a456-426614174000 ]
[ "$(grep -c '^client=meshy-agent$' "$CASE/log")" -eq 2 ]
[ "$(grep -c '^job=3d-generation$' "$CASE/log")" -eq 2 ]
[ "$(grep -c "^session=$SESSION$" "$CASE/log")" -eq 2 ]

new_case
meshy_fake
uuid_fake
agent_fake
SECRET='synthetic-agent-secret-value'
MESHY_API_KEY="$SECRET" assert_status 0 run_case "$SCRIPT" --agent codex-kiro -- --model safe
assert_contains "$CASE/log" "arg=--model"
assert_contains "$CASE/log" "--dry-run"
assert_contains "$CASE/log" "--max-credits N"
assert_contains "$CASE/log" "explicit user approval"
assert_contains "$CASE/log" "task ID and exact resume command"
assert_contains "$CASE/log" "--async"
assert_contains "$CASE/log" "immediately with -o"
assert_contains "$CASE/log" "Never disclose credentials"
assert_not_contains "$CASE/log" "$SECRET"
assert_not_contains "$CASE/log" "--api-key"

new_case
meshy_fake
uuid_fake
agent_fake
assert_status 0 run_case "$SCRIPT" --agent codex-kiro
assert_not_contains "$CASE/log" "meshy:balance"
assert_not_contains "$TMP/err" "warning"

new_case
meshy_fake
uuid_fake
agent_fake
MESHY_BALANCE=9.5 MESHY_MIN_BALANCE=10 assert_status 0 run_case "$SCRIPT" --agent codex-kiro
assert_contains "$CASE/log" "meshy:balance"
assert_contains "$TMP/err" "below configured minimum 10"

new_case
meshy_fake
uuid_fake
agent_fake
ROOT="$CASE/outputs"
assert_status 2 run_case "$SCRIPT" --agent codex-kiro --output-root "$ROOT" --output ../escape
assert_status 2 run_case "$SCRIPT" --agent codex-kiro --output-root "$ROOT" --output /tmp/escape
mkdir -p "$ROOT" "$CASE/outside"
ln -s "$CASE/outside" "$ROOT/linked"
assert_status 2 run_case "$SCRIPT" --agent codex-kiro --output-root "$ROOT" --output linked
mkdir -p "$ROOT/occupied"
printf existing >"$ROOT/occupied/model.glb"
assert_status 6 run_case "$SCRIPT" --agent codex-kiro --output-root "$ROOT" --output occupied
[ "$(cat "$ROOT/occupied/model.glb")" = existing ]
assert_not_contains "$CASE/log" "client=meshy-agent"

echo "meshy-agent.test.sh: 9 cases passed"

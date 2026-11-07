#!/usr/bin/env bash
# lane/511-general-cheatsheet: docs-only Aura arm on 6 unseen tasks (31-36), n=3, same model and seed in both arms.
#   baseline: docs of origin/main (no first screen)   sheet: docs of the given commit (llms.txt carries docs/agents/first-screen.md)
#   tools/agent-eval/run-511.sh <sheet-commit> [baseline-ref]
set -eu
SHEET_REF="${1:?sheet commit}"
BASE_REF="${2:-origin/main}"
export AGENT_EVAL_AURA_VERSION=5.0.2
export AGENT_EVAL_BASE_ROOT="${AGENT_EVAL_BASE_ROOT:-/tmp/sheet-base}"
export AGENT_EVAL_WORK="${AGENT_EVAL_WORK:-/tmp/agent-eval-runs-511}"
export AGENT_EVAL_EVIDENCE=evidence/cheatsheet-511/agent-eval
CONC="${CONC:-4}"
node tools/agent-eval/run.mjs --arm aura --task 31,32,33,34,35,36 --runs 3 --batch b511-base --docs-ref "$BASE_REF" --concurrency "$CONC" --seed 20261107 &
node tools/agent-eval/run.mjs --arm aura --task 31,32,33,34,35,36 --runs 3 --batch b511-sheet --docs-ref "$SHEET_REF" --concurrency "$CONC" --seed 20261107 &
wait

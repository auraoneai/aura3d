#!/usr/bin/env bash
# bench505 physics: aura (docs, condition base) + three in batch bench505-physics; aura-sheet (condition A) in bench505-physics-sheet.
set -u
export AGENT_EVAL_AURA_VERSION=5.0.2
export AGENT_EVAL_WORK=/tmp/b505-physics-runs
export AGENT_EVAL_BASE_ROOT=/tmp/b505-physics-base
export AGENT_EVAL_EVIDENCE=evidence/agent-eval-505/physics
CONC="${CONC:-3}"
node tools/agent-eval/run.mjs --arm both --task 10,11,12 --runs 3 --batch bench505-physics --condition base --concurrency "$CONC" --seed 20261106 &
node tools/agent-eval/run.mjs --arm aura --task 10,11,12 --runs 3 --batch bench505-physics-sheet --condition A --concurrency "$CONC" --seed 20261106 &
wait

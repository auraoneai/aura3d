#!/usr/bin/env bash
# exp/turn-gap-504 driver: Aura arm only, n=3 per task per condition, tasks 2,5,8,9 (baseline rerun on 2,8).
# Same model, 40-turn cap and seed as the docs503 trial. Run from the repo root.
set -u
export AGENT_EVAL_AURA_VERSION=5.0.2
export AGENT_EVAL_EVIDENCE=evidence/agent-eval-504
CONC="${CONC:-4}"
for spec in "$@"; do
  cond="${spec%%:*}"
  tasks="${spec#*:}"
  node tools/agent-eval/run.mjs --arm aura --task "$tasks" --runs 3 --batch "b504-$cond" --condition "$cond" --concurrency "$CONC" --seed 20261106
done

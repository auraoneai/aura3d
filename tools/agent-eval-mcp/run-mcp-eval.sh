#!/usr/bin/env bash
# usage: run-mcp-eval.sh <condition> <tasks> <runs> <batch>
set -u
WT=/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_0a753117-9f6-4
cd /tmp/ae504wt
export AGENT_EVAL_AURA_VERSION=5.0.2
export AGENT_EVAL_BASE_ROOT=/tmp/ae-mcp-base
export AGENT_EVAL_WORK=/tmp/ae-mcp-runs
export AGENT_EVAL_EVIDENCE=evidence/agent-eval-mcp
export AGENT_EVAL_MCP_ARGS="[\"$WT/packages/aura3d-mcp/dist/cli.js\"]"
export AGENT_EVAL_MCP_BUNDLE=/tmp/mcp-bundle-M.json
export AGENT_EVAL_MCP_BUNDLE_SHEET=/tmp/mcp-bundle-N.json
nice -n 10 node tools/agent-eval/run.mjs --arm aura --task "$2" --runs "$3" --batch "$4" --condition "$1" --concurrency "${CONC:-4}" --seed 20261106

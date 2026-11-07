#!/usr/bin/env bash
set -eu
WT=/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_0a753117-9f6-4
for v in M N; do
  r=/tmp/mcp-bundle-$v
  rm -rf "$r"
  mkdir -p "$r/docs"
  cp -R /tmp/ae504wt/docs/agents "$r/docs/agents"
  cp /tmp/ae504wt/llms.txt "$r/"
  cp "$WT/docs/agents/error-codes.md" "$r/docs/agents/"
  cp /tmp/ae504wt/package.json "$r/package.json"
done
rm /tmp/mcp-bundle-M/docs/agents/first-screen-cheatsheet.md
node /tmp/mkbundle.mjs

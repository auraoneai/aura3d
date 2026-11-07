#!/usr/bin/env bash
# usage: MCP_WT=<lane worktree> AE=<harness checkout> mkbundle.sh
set -eu
for v in M N; do
  r=/tmp/mcp-bundle-$v
  rm -rf "$r"
  mkdir -p "$r/docs"
  cp -R "$AE/docs/agents" "$r/docs/agents"
  cp "$AE/llms.txt" "$r/"
  cp "$MCP_WT/docs/agents/error-codes.md" "$r/docs/agents/"
  cp "$AE/package.json" "$r/package.json"
done
rm /tmp/mcp-bundle-M/docs/agents/first-screen-cheatsheet.md
node "$(dirname "$0")/mkbundle.mjs"

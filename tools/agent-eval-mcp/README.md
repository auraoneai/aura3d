# agent-eval MCP conditions (lane 511)

Applies on top of `origin/exp/turn-gap-504` `tools/agent-eval` (that harness is not on main). Conditions: `base`, `A` (cheat sheet only), `B` (aura_lookup), `M` (MCP only), `N` (sheet + MCP).

```sh
mkdir /tmp/ae && git archive origin/exp/turn-gap-504 | tar -x -C /tmp/ae && cd /tmp/ae && git init -q && git add -A && git commit -qm base
patch -p1 -i <this dir>/mcp-condition.patch
cp <this dir>/mcp.mjs tools/agent-eval/lib/ && cp <this dir>/report-mcp.mjs tools/agent-eval/
rm -rf evidence/agent-eval-5*   # the harness leak check rejects committed sandbox snapshots
npx tsc -p packages/aura3d-mcp/tsconfig.json   # in the lane worktree
export MCP_WT=<lane worktree> AE=/tmp/ae
bash <this dir>/mkbundle.sh     # docs bundles M (no sheet) and N (sheet) through the public allow-list
<this dir>/run-mcp-eval.sh M 2,5,8,9 3 m513-M   # also base, A, N
node tools/agent-eval/report-mcp.mjs evidence/agent-eval-mcp m513-base m513-A m513-M m513-N
```

Results: `evidence/agent-eval-mcp/RESULTS.md`.

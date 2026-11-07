# agent-eval MCP conditions (lane 511)

Applies on top of `origin/exp/turn-gap-504` `tools/agent-eval` (that harness is not on main).

```sh
git worktree add --detach /tmp/ae504wt origin/exp/turn-gap-504
cd /tmp/ae504wt && git apply <this dir>/mcp-condition.patch && cp <this dir>/mcp.mjs <this dir>/report-mcp.mjs tools/agent-eval/lib/ ... # mcp.mjs -> lib/, report-mcp.mjs -> tools/agent-eval/
rm -rf evidence/agent-eval-5*   # the harness leak check rejects committed sandbox snapshots
node mkbundle.mjs               # docs bundles M (no sheet) and N (sheet) from the 504 docs
./run-mcp-eval.sh M 2,5,8,9 3 m511-M   # also N and B
node tools/agent-eval/report-mcp.mjs evidence/agent-eval-mcp m511-B m511-M m511-N
```

Paths inside the scripts are those of the lane run (`/tmp`, the lane worktree); adjust them. Results: `evidence/agent-eval-mcp/RESULTS.md`.

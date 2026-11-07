# @aura3d/mcp

A stdio [Model Context Protocol](https://modelcontextprotocol.io) server that gives a coding agent version-pinned, public-surface-only knowledge of Aura3D without reading the repository or `node_modules/**/dist`.

Status: phase 1 (E3-03). The package is `private` and is in no release inventory until the owner decides. The snippets below use a local build; replace the command with `npx -y @aura3d/mcp` once it is published.

## What it is good for (and not)

Measured on the cold-start trial (4 tasks, n=3, `evidence/agent-eval-mcp/RESULTS.md`): the MCP tools alone cut turns by about 31% against no entry docs (12 vs 17.5 median), but a first-screen cheat sheet alone is far better (4.5 turns), and adding the MCP on top of the sheet did not help (6.5). It does not save turns over a good sheet. Use it for exact signatures from the version you installed, error-code lookup, structured scaffold, asset and deploy-check calls, and for agents that cannot read the repository docs. Do not expect it to replace the cheat sheet on the first screen.

## What it answers

Every answer starts with a stamp such as `[aura3d-mcp docs@5.0.2 | installed @aura3d/engine@5.0.2]`. The docs bundle is built from the repository at build time; signatures are read from the engine you installed in the project, so where they differ the installed declarations win. Each answer stays under 2,500 tokens (characters / 3.6).

| Tool | Input | Returns |
| --- | --- | --- |
| `get_symbol` | `name` (dotted for members), `subpath?`, `package?` | Signature, doc comment, default values, an example. Read from the installed `@aura3d/*` `.d.ts` through the package `exports` map only; modules outside the exports map are never opened. |
| `search_docs` | `query`, `limit?` | BM25 over `llms.txt`, the agent quickstart, recipes, API signature tables, the three.js translation table and the error-code table. Passages are whole chunks of at most 1,200 characters (sections split on paragraph boundaries with overlap), never clipped mid-fact. |
| `get_recipe` | `task` | The best working scene source for the task plus one-line signatures of the engine exports it imports. |
| `scaffold` | `template`, `dir?`, `agent?` | Creates a project with `create-aura3d` (installed copy, else `npx create-aura3d@latest`), including `llms.txt` and the Aura3D skills. Does not install dependencies. |
| `assets_resolve` | `need`, `name?`, `role?`, `dryRun?` | `aura3d assets resolve --json` as structured data (dry run by default). |
| `assets_inspect` | `file`, `animation?`, `skeleton?`, `morphs?`, `license?` | `aura3d assets inspect` as structured data. |
| `check_deploy` | `dist?`, `release?` | `aura3d check-deploy` as `{ ok, failures, warnings }`. |
| `explain_error` | `code` (or the whole console line) | Cause and fix from `docs/agents/error-codes.md`, the single source for error and warning codes. |

Resources: `aura3d://llms.txt`, `aura3d://docs/threejs-to-aura3d`, `aura3d://docs/api-signatures`, `aura3d://docs/error-codes`.

All tools take an optional `projectDir` (default: `--project`, `AURA3D_PROJECT_DIR`, or the working directory). `get_symbol` and the CLI wrappers need `@aura3d/engine` and `@aura3d/cli` installed in that project; the server says so when they are not.

## Install snippets

Build once from the monorepo (`pnpm build`, then `pnpm --filter @aura3d/mcp bundle-docs`), then point the client at `packages/aura3d-mcp/dist/cli.js`.

### Claude Code

```sh
claude mcp add aura3d --env AURA3D_PROJECT_DIR="$PWD" -- node /path/to/aura3d/packages/aura3d-mcp/dist/cli.js
# published form:  claude mcp add aura3d -- npx -y @aura3d/mcp
```

Or commit a project `.mcp.json`:

```json
{ "mcpServers": { "aura3d": { "command": "npx", "args": ["-y", "@aura3d/mcp"] } } }
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.aura3d]
command = "node"
args = ["/path/to/aura3d/packages/aura3d-mcp/dist/cli.js", "--project", "/path/to/your/project"]
# published form: command = "npx", args = ["-y", "@aura3d/mcp"]
```

### Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "aura3d": {
      "command": "node",
      "args": ["/path/to/aura3d/packages/aura3d-mcp/dist/cli.js", "--project", "${workspaceFolder}"]
    }
  }
}
```

## Protocol

The official `@modelcontextprotocol/sdk` is not available in the offline pnpm store used for this lane, so the server implements the minimal newline-delimited JSON-RPC 2.0 stdio transport itself: `initialize` (protocol versions 2025-06-18, 2025-03-26, 2024-11-05), `notifications/initialized`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`. Swapping in the SDK later changes only `src/protocol.ts`.

## Development

```sh
pnpm exec vitest run tests/unit/aura3d-mcp      # tool unit tests (fixture project) + stdio conformance test
node packages/aura3d-mcp/dist/bundle/cli.js     # rebuild data/docs-bundle.json (also built on the fly from source in the monorepo)
```

Public surface only: the docs bundle excludes repository-internal documents (`docs/agents/codebase-map.md`, process protocols), and `get_symbol` accepts only `@aura3d/*` package names and subpaths in the package `exports` map.

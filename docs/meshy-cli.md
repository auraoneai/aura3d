# Meshy CLI asset pipeline

**Capability label:** CLI asset pipeline
**Supported official CLI baseline:** `@meshy-ai/cli@0.2.0` on Node.js 24 or newer
**Optional MCP baseline:** `@meshy-ai/meshy-mcp-server@0.5.1`

Meshy is an upstream asset-generation tool. It is not an Aura3D renderer, Prism model, browser dependency, or game-runtime API. The official CLI owns Meshy authentication, request planning, task creation, polling, resumption, and download. Aura3D owns local admission, hashing, inspection, provenance, typed asset generation, validation, and route evidence.

The CLI commands below reflect the pinned official CLI and upstream documentation checked for this integration. Re-run `meshy --help` and `meshy <resource> --help` before relying on flags because the upstream command contract remains source-dependent.

## Install and authenticate

The repository setup script is intentionally separate from this documentation and pins the CLI exactly. Its `--check` mode must only inspect Node, npm, the CLI version, authentication, and optional balance; it must not install, log in, or modify files.

Local users should authenticate with browser OAuth:

```bash
meshy auth login
meshy auth status
meshy balance
```

Named profiles use the official auth surface:

```bash
meshy auth login --profile work
meshy auth list
meshy auth use work
```

The CLI refreshes OAuth tokens as needed. Its profile store is under `~/.config/meshy/credentials.json` and must never be copied into this repository. In authorized headless jobs, inject `MESHY_API_KEY` from the CI secret manager into the process environment. Never pass a key in command arguments, paste it into a prompt, or save it in task metadata.

## Plan before spending

`meshy make` chooses the documented chain from its input. Text input uses text-to-3D preview followed by refine; image input uses image-to-3D. The default is synchronous and waits for completion.

```bash
meshy make "a stylized arena relic with a readable silhouette" --dry-run
# Review the displayed plan and obtain explicit approval for its maximum.
meshy make "a stylized arena relic with a readable silhouette" \
  --max-credits <approved-maximum> \
  -o artifacts/meshy/arena-relic/
```

The value for `--max-credits` comes from the displayed plan and the user's approval; no example is a universal price. Existing output targets are not overwritten. Choose a new output directory or obtain direct instructions before archiving/removing an existing one.

For an image input, first confirm the exact pinned help, then use the same planning guard:

```bash
meshy make ./reference.png --dry-run
meshy make ./reference.png --max-credits <approved-maximum> -o artifacts/meshy/image-candidate/
```

Only intentional prompts and selected media may be sent to Meshy. Do not transmit repository source, unrelated user data, credentials, or confidential content without authorization.

## Resource lifecycle and asynchronous work

Every supported resource exposes `create`, `get`, `list`, `wait`, and `delete`. Confirm resource-specific create flags from help:

```bash
meshy text-to-3d --help
meshy text-to-3d create --help
meshy text-to-3d get <task-id>
meshy text-to-3d list
meshy text-to-3d wait <task-id>
meshy text-to-3d delete <task-id>
```

Use corresponding `image-to-3d` help and verbs for image tasks. Text-to-3D is a preview/refine lifecycle: retain the preview task ID and use the provider's reported resume command or hint for refine. Do not recreate a successful preview merely because a later stage failed.

With `--async`, resource `create` returns a task ID instead of waiting. `make --async` submits only the first planned step, returns that task ID, and requires the reported resume path for later steps. Persist task IDs in ignored local run state, continue independent work, then use the resource's `get` or `wait`. A successful run is not complete until `-o` has downloaded the model and metadata locally.

## Output, retention, and provenance

Write candidates only beneath `artifacts/meshy/<run-or-asset>/`. This tree is ignored and is not a durable public asset source. Preserve sanitized metadata, task and parent IDs, settings, estimated and consumed credits, local artifact names, content hashes, and rights evidence. Do not retain OAuth/API credentials, authorization headers, environment dumps, or signed artifact query strings.

**Current-source-dependent retention claim (official Meshy docs checked 2026-09-02):** API-generated assets are retained for a maximum of three days for non-Enterprise customers; the official page says Enterprise customers may retain assets indefinitely. This is a provider policy, not an Aura3D guarantee, and may change. Recheck [Meshy Asset Retention](https://docs.meshy.ai/en/api/asset-retention). Download successful artifacts and metadata immediately rather than relying on provider retention or expiring signed URLs.

Record the rights and plan evidence that actually applies. Do not infer CC0, CC BY, exclusivity, or release readiness from provider success or a “game-ready” label.

## Aura3D admission

Generation and admission are separate decisions. The PRD-target bridge is:

```bash
npx @aura3d/cli assets import-meshy artifacts/meshy/arena-relic/ \
  --name arenaRelic \
  --quality candidate \
  --role prop \
  --rights-evidence artifacts/meshy/arena-relic/rights.json
```

That command is **not part of the current package source in this documentation-only slice**. Do not run or advertise it as available until the owning CLI implementation and tests land. Once available, it must reuse Aura3D's existing add, hash, inspect, manifest, and type-generation path. Game code then imports `assets.arenaRelic`; it never consumes `artifacts/meshy`, provider URLs, or task IDs directly. Provider output remains candidate quality until normal asset, route-health, mechanic, screenshot, and human-review gates pass.

## Exit codes

The pinned official CLI documents these codes; wrappers must propagate them:

| Code | Meaning |
| ---: | --- |
| 0 | Success |
| 1 | Generic or server error |
| 2 | Usage or flag-parse error |
| 3 | Authentication / HTTP 401 |
| 4 | Validation / HTTP 400 or 422 |
| 5 | Not found / HTTP 404 |
| 6 | Rate limit / HTTP 429 |
| 7 | Network error |
| 8 | Timed out waiting for a task |
| 9 | Credits exhausted / HTTP 402 |

## Agent and official skill strategy

The repository skill at [`.cursor/skills/meshy-cli/SKILL.md`](../.cursor/skills/meshy-cli/SKILL.md) is deliberately small. It points agents to the installed pinned help and official docs instead of copying upstream instructions. The full official skill is [meshy-dev/meshy-3d-agent](https://github.com/meshy-dev/meshy-3d-agent). The convenience command `npx skills add meshy-dev/meshy-3d-agent` follows an upstream moving revision unless the installer supports a reviewed pin, so do not automate it as a reproducible dependency without pinning destination and revision behavior.

For Claude, Codex, or another Prism-backed agent, give the agent the repository skill/policy and require the same dry-run, explicit approval, maximum-credit, task-resume, and immediate-download controls. Prism identity or scheduling failures are separate from Meshy API/CLI failures; attribution variables do not solve shared-principal capacity.

## Optional MCP configuration

The MCP installer merges the exact server pin into an explicit JSON config while preserving unrelated settings:

```bash
./cli-configs/install-meshy-mcp.sh --config "$HOME/.cursor/mcp.json" --client Cursor
./cli-configs/install-meshy-mcp.sh --check --config "$HOME/.cursor/mcp.json" --client Cursor
```

The generated entry is equivalent to:

```json
{
  "mcpServers": {
    "meshy": {
      "command": "npx",
      "args": ["-y", "@meshy-ai/meshy-mcp-server@0.5.1"]
    }
  }
}
```

The installer does not execute `npx`, contact Meshy, or put a key in command arguments or config. It validates JSON, backs up an existing file before a change, writes atomically, and is idempotent. `--check` makes no file, directory, or backup changes and exits nonzero when the exact entry is absent.

The MCP server requires `MESHY_API_KEY` when it starts. Supply it through the environment of the process that launches the client: use a Keychain-backed launcher for a local desktop client, a protected secret manager for CI, or a secure hosted secret store such as AWS SSM SecureString for an internal worker. OAuth remains preferred for direct CLI work. Restart the client after changing its MCP config.

## Troubleshooting boundaries

1. Run `meshy --version`, `meshy auth status`, resource help, and a read-only balance check. These diagnose CLI version, authentication, and account issues.
2. Preserve and report the official exit code. Rate limit, network, timeout, validation, credit, task, and signed-URL failures belong to Meshy.
3. If a Prism-backed agent cannot launch, queue, or obtain capacity, diagnose Prism/Kiro separately; do not relabel it as a Meshy failure.
4. If MCP does not appear, validate the selected JSON file, run the installer with `--check`, ensure the client startup environment contains the key, and fully restart the client.
5. If an Aura3D import or asset gate fails after a successful download, keep the file as a rejected local candidate. Generation success does not override Aura3D validation.

## Official sources

- [Meshy CLI repository and command reference](https://github.com/meshy-dev/meshy-cli)
- [Meshy CLI product page](https://www.meshy.ai/cli)
- [Text to 3D API](https://docs.meshy.ai/en/api/text-to-3d)
- [Image to 3D API](https://docs.meshy.ai/en/api/image-to-3d)
- [Asset retention](https://docs.meshy.ai/en/api/asset-retention)
- [Official Meshy agent skill](https://github.com/meshy-dev/meshy-3d-agent)
- [Official MCP server](https://github.com/meshy-dev/meshy-mcp-server)

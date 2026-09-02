# Meshy Integration PRD

**Revision:** 1.0
**Date:** 2026-09-02
**Status:** Complete — all acceptance criteria verified
**Capability label:** CLI asset pipeline
**Scope:** Official Meshy CLI setup, agent launcher, Aura3D asset ingestion, provenance, documentation, tests, and optional MCP installation

## Product decision

Aura3D will integrate Meshy as an upstream asset-generation tool, not as a renderer, Prism model, or game-runtime dependency. The pinned official Meshy CLI will own Meshy authentication, request construction, credit estimation, task creation, polling, task resumption, and artifact download. Aura3D will own secure setup, agent policy, durable local artifact admission, hashing, inspection, provenance, typed asset generation, game-readiness validation, and browser evidence.

The integration must not duplicate the Meshy CLI's HTTP client or task lifecycle unless a verified product gap requires it. Game routes continue to consume only typed Aura3D assets:

```ts
import { model } from "@aura3d/engine";
import { assets } from "./aura-assets";

model(assets.sportsCar);
```

Raw Meshy task URLs, raw GLB URLs, direct loaders, provider task IDs, and credentials must never appear in public game source.

## Goals

1. Give developers and agents a safe, repeatable way to generate 3D candidates with Meshy from the repository.
2. Require a no-spend plan and a preflight credit ceiling before paid generation.
3. Download completed artifacts and metadata immediately into a controlled workspace directory.
4. Admit selected GLBs through the existing Aura3D `addAsset()`, inspection, hashing, manifest, type-generation, and validation pipeline.
5. Preserve enough provider, prompt, task, settings, credit, rights, and content-hash evidence to audit an asset without retaining secrets or temporary signed URLs.
6. Support interactive browser OAuth, headless CI authentication, resumable asynchronous tasks, and optional MCP clients.
7. Keep game-runtime and public API claims unchanged until generated assets pass their normal route and evidence gates.

## Non-goals

- Reimplementing the Meshy REST API, OAuth, polling, download, retry, or pricing planner inside Aura3D.
- Calling Meshy from browser game code or `@aura3d/engine` runtime code.
- Automatically approving generated output as release-ready.
- Automatically refining every preview or spending credits without an explicit ceiling.
- Treating generated assets as CC0 or assigning a license not established by durable rights evidence.
- Solving Prism shared-principal admission-control or concurrency bottlenecks in this work. That belongs in a separate PR.
- Committing API keys, OAuth credentials, signed artifact URLs, or Meshy profile files.

## Verified upstream baseline

The following upstream surfaces were verified on 2026-09-02 and must be rechecked when implementation begins:

| Surface | Verified baseline | Integration consequence |
| --- | --- | --- |
| Official CLI | `@meshy-ai/cli@0.2.0`; binaries `meshy` and `meshy-cli`; Node `>=24` | Pin exactly `0.2.0` in setup code; do not install both scoped and unscoped aliases |
| Official CLI repository | [meshy-dev/meshy-cli](https://github.com/meshy-dev/meshy-cli) | Treat upstream help/README as command authority |
| Authentication | `meshy auth login` uses browser OAuth with loopback + PKCE; `MESHY_API_KEY` overrides stored profiles | Prefer OAuth locally and environment injection in CI |
| Stored profiles | `~/.config/meshy/credentials.json`, mode `0600`; named profiles and refresh supported | Never copy this file into the repository |
| Spend controls | `meshy make ... --dry-run` and `--max-credits N` plan before task creation | Both are mandatory in agent policy |
| Task lifecycle | Resource commands expose `create/get/list/wait/delete`; `--async` returns task IDs | Preserve IDs and resume completed stages rather than rerunning |
| Artifact output | `-o` downloads artifacts and metadata; existing targets fail instead of being overwritten | Always use controlled output paths and treat download as task completion |
| Exit codes | Distinct usage, auth, validation, not-found, rate-limit, network, timeout, and credit-exhausted codes | Wrappers must return the original exit code |
| Official skill | [meshy-dev/meshy-3d-agent](https://github.com/meshy-dev/meshy-3d-agent); install surface documented as `npx skills add meshy-dev/meshy-3d-agent` | Prefer upstream skill installation or a tiny non-duplicative local pointer |
| Official MCP | `@meshy-ai/meshy-mcp-server@0.5.1`, Node `>=18` | Optional; pin exactly and inject secrets at runtime |

Version pins are implementation baselines, not permanent promises. An upgrade requires review of command behavior, spend controls, authentication, output layout, metadata, exit codes, and tests before changing the pin.

## Architecture

```text
Developer or Prism-backed agent
        |
        | dry-run + maximum-credit approval
        v
Official pinned Meshy CLI
(auth, planning, generation, polling, resume, download)
        |
        | artifacts/meshy/<run-or-asset>/model.glb + metadata
        v
Aura3D Meshy ingestion command
(validate local files, map provenance, call existing addAsset())
        |
        +--> public/aura-assets/<name>.<hash>.glb
        +--> aura.assets.json
        +--> src/aura-assets.ts
        +--> inspection/readiness evidence
        v
Game route: model(assets.<name>)
        |
        v
route-health + mechanic proof + screenshots + human review
```

### Ownership boundaries

| Concern | Owner |
| --- | --- |
| OAuth/API-key resolution, provider requests, task polling, retries, resume hints, artifact download | Official Meshy CLI |
| Setup checks, version pinning, secure invocation, agent identity and instructions | Repository scripts |
| Local GLB verification, hashing, inspection, manifest/type generation, source gates | `@aura3d/cli` |
| Gameplay use and browser evidence | Game route and existing test/evidence systems |
| Optional typed tool access | Official Meshy MCP server |

## Required deliverables

### 1. Create `cli-configs/setup-meshy.sh`

Responsibilities:

- Verify Node.js 24 or newer and fail clearly on older or missing Node.
- Verify `npm` is available.
- Install exactly `@meshy-ai/cli@0.2.0`; do not install the unscoped alias as well.
- Confirm `meshy --version` and `meshy --help` succeed.
- Detect authentication with `meshy auth status` without printing credentials.
- Explain interactive login with `meshy auth login`.
- Optionally run `meshy balance` after authentication.
- Support `--check`, which performs no installation, login, or mutation.
- Support noninteractive CI through an already-injected `MESHY_API_KEY`.
- Never accept the key as a positional or command-line option.
- Never write the key, a profile, or credential JSON into the repository.
- Return meaningful nonzero exit codes and avoid masking upstream failures.
- Be idempotent when the correct version is already installed.

Security detail: the script may check whether `MESHY_API_KEY` is set, but must never echo its value. It must not invoke `meshy --api-key ...`, because command-line secrets can appear in process listings. Local interactive users should use OAuth. CI must inject the environment variable through its secret manager.

Acceptance examples:

```bash
./cli-configs/setup-meshy.sh --check
./cli-configs/setup-meshy.sh
meshy auth login
meshy auth status
meshy balance
```

### 2. Create `cli-configs/meshy-agent`

This is a thin launcher, not a Meshy implementation.

Required behavior:

1. Confirm the `meshy` executable exists and matches the supported pinned version.
2. Confirm authentication with `meshy auth status`.
3. Optionally retrieve balance and warn below `MESHY_MIN_BALANCE`; absence of a threshold must not invent one.
4. Create or restore a stable UUID session identifier. A resumed run must reuse its persisted session ID.
5. Export:

   ```text
   PRISM_CLIENT_ID=meshy-agent
   PRISM_JOB_TYPE=3d-generation
   PRISM_SESSION_ID=<uuid>
   ```

6. Launch an explicitly selected Prism-backed agent such as `claude-kiro` or `codex-kiro`; do not silently choose an unavailable executable.
7. Append concise agent instructions requiring:
   - `meshy make ... --dry-run` before paid work;
   - an explicit `--max-credits N` on paid generation;
   - preservation of task IDs and resume commands;
   - `--async` when other useful work can proceed, noting that `make --async` starts only the first planned step and returns its task ID;
   - immediate `-o` download into the allowed output root;
   - no overwrite without direct user instruction;
   - no credential disclosure.
8. Constrain output to a normalized configured root, defaulting to `artifacts/meshy/`. Reject traversal and output paths outside that root.
9. Propagate the selected agent's exit code.
10. Do not imply that these Prism identity variables solve shared-principal capacity. Admission-control changes remain separate.

Intended use:

```bash
./cli-configs/meshy-agent --agent codex-kiro
```

Agent request:

```text
Create a game-ready red sports car. Show the estimated Meshy credit cost first,
and save the final GLB under artifacts/meshy/sports-car/.
```

Expected planning call:

```bash
meshy make "a game-ready red sports car" --dry-run
```

After explicit approval:

```bash
meshy make "a game-ready red sports car" \
  --max-credits 30 \
  -o artifacts/meshy/sports-car/
```

The maximum must come from the displayed plan and user-approved budget; examples must not be interpreted as a universal price.

### 3. Create the Aura3D ingestion bridge

Generation and ingestion are separate decisions. A completed Meshy output remains a candidate until admitted through Aura3D.

Recommended CLI surface:

```bash
npx @aura3d/cli assets import-meshy artifacts/meshy/sports-car/ \
  --name sportsCar \
  --quality candidate \
  --role vehicle \
  --rights-evidence artifacts/meshy/sports-car/rights.json
```

Files to create under `packages/aura3d-cli/src/meshy/`:

```text
import.ts          # Discover and validate a completed local Meshy output
metadata.ts        # Parse/sanitize upstream meta.json and task metadata
provenance.ts      # Map durable Meshy evidence into Aura provenance
validation.ts      # Reject missing, invalid, ambiguous, or unsafe output
index.ts           # Internal exports
```

Existing files requiring targeted changes:

- `packages/aura3d-cli/src/cli.ts`: route `assets import-meshy`.
- `packages/aura3d-cli/src/cli-help.ts`: document import and security boundaries.
- `packages/aura3d-cli/src/index.ts`: export the import function only if a programmatic public surface is required.
- Asset provenance/types/manifest source: extend only where current fields cannot represent generated-asset evidence.

Import algorithm:

1. Resolve the input beneath an allowed local root.
2. Require exactly one selected GLB or an explicit `--file` when multiple GLBs exist.
3. Parse metadata as untrusted input and reject malformed or unexpectedly large files.
4. Reject credential-like fields and strip temporary signed artifact URLs from durable output.
5. Validate GLB magic bytes, size limits, and local-file existence.
6. Build Meshy provenance from task ID, operation, prompt or prompt hash according to policy, model/settings, timestamps, consumed credits, source family, and rights evidence.
7. Call the existing `addAsset()` path; do not duplicate hashing, inspection, output naming, manifest merging, or type generation.
8. Default generated output to `quality: candidate`; never auto-promote to release quality.
9. Print the generated typed key and next validation commands.
10. Preserve the source folder until the caller explicitly archives or removes it.

Expected outputs:

- `public/aura-assets/<name>.<content-hash>.glb`
- an entry in `aura.assets.json`
- a typed key in `src/aura-assets.ts`
- retained local Meshy metadata and rights evidence under `artifacts/meshy/...`

### 4. Extend generated-asset provenance

The durable manifest/report shape must be sufficient to answer who/what/when/how without including a secret or expiring URL. A representative shape is:

```json
{
  "sourceFamily": "meshy",
  "generation": {
    "provider": "meshy",
    "providerCli": "@meshy-ai/cli@0.2.0",
    "taskId": "<task-id>",
    "parentTaskIds": ["<preview-task-id>"],
    "operation": "text-to-3d-refine",
    "prompt": "<prompt or policy-approved prompt record>",
    "model": "<provider-reported model>",
    "settings": {},
    "createdAt": "<ISO-8601>",
    "finishedAt": "<ISO-8601>",
    "consumedCredits": 10,
    "localMetadata": "artifacts/meshy/sports-car/meta.json",
    "rightsEvidence": "artifacts/meshy/sports-car/rights.json"
  }
}
```

Rules:

- Do not retain bearer tokens, OAuth tokens, API keys, authorization headers, environment dumps, or signed artifact query strings.
- Do not invent a CC0/CC-BY license. Record the actual applicable rights evidence and plan terms.
- Store content hashes through the existing Aura3D path.
- If prompts may contain confidential product information, support a prompt-hash plus separately controlled prompt record rather than forcing the full prompt into public manifests.
- Provider success proves generation only. Release readiness still requires Aura3D validation and route evidence.

### 5. Add the official Meshy agent skill

Preferred CLI-first path:

```bash
npx skills add meshy-dev/meshy-3d-agent
```

Before automating this command, pinning support and destination behavior must be inspected. A remote moving branch must not be silently treated as a reproducible dependency. The implementation must choose one of:

1. Install a version/commit-pinned upstream skill into supported local agent environments; or
2. Create a very small repository skill that points to `meshy --help`, `meshy <resource> --help`, the installed CLI version, and official documentation.

Do not copy the full upstream documentation into a repository skill and allow it to drift.

The active skill/instructions must require agents to:

- run `meshy make ... --dry-run` first;
- obtain explicit approval for the shown maximum credit amount;
- pass `--max-credits` on the paid call;
- prefer resource `create --async`, or `make --async` for its first planned step, when useful work can continue;
- preserve task IDs and provider resume hints;
- resume completed paid stages instead of rerunning them;
- use `-o` so temporary artifacts are downloaded immediately;
- avoid overwriting existing files;
- keep all credentials out of prompts, logs, commits, output, and tool results;
- ingest selected results through `assets import-meshy` before game use.

### 6. Create optional `cli-configs/install-meshy-mcp.sh`

The MCP path is optional and must not block the CLI-first MVP.

Responsibilities:

- Install/configure exactly `@meshy-ai/meshy-mcp-server@0.5.1`.
- Merge a `meshy` server entry into supported existing MCP JSON without deleting unrelated servers or settings.
- Be idempotent and create a backup before changing a user configuration.
- Validate resulting JSON and report which client configuration changed.
- Never write the key into a committed file.
- Never place a literal key in command arguments.
- Support `--check` with no mutation.

Secret delivery order:

1. CLI OAuth for direct CLI work.
2. macOS Keychain-backed local launcher for desktop MCP clients.
3. CI secret manager injecting `MESHY_API_KEY`.
4. AWS SSM SecureString or equivalent for a hosted internal worker.

The exact MCP command must be tested against the pinned package. A representative server entry is:

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

If the pinned server requires an alternate executable invocation, use the package's verified contract and update this PRD's verification record. Environment acquisition belongs in an uncommitted local launcher or host configuration, not this committed JSON.

### 7. Create `docs/meshy-cli.md`

The document must use the `CLI asset pipeline` capability label and cover:

- Architecture and why Meshy is a tool rather than a Prism model or game runtime.
- Node 24 requirement and exact CLI pin.
- Setup and `--check` behavior.
- OAuth, named profiles, refresh, and environment-based CI authentication.
- Text-to-3D preview/refine and image-to-3D lifecycles.
- Synchronous default versus `--async`.
- Resource `create/get/list/wait/delete` commands.
- `--dry-run`, explicit approval, and `--max-credits`.
- Artifact output conventions and non-overwrite behavior.
- Task ID preservation and resumption.
- Official exit codes.
- Signed-URL expiration and provider retention limitations.
- Immediate download as part of task completion.
- `assets import-meshy` and typed game use.
- Secret-handling and rights-evidence rules.
- Troubleshooting Meshy separately from Prism/Kiro.
- Example Claude, Codex, other Prism-backed agent, and MCP flows.

Provider retention duration must be documented from a current official source at implementation time. The other agent reported a three-day non-Enterprise retention window; treat that as a requirement to verify, not as an established timeless guarantee. Regardless of exact duration, successful work is incomplete until artifacts and metadata are downloaded locally.

### 8. Add artifact and secret exclusions

Update repository ignore/config policy as needed so local operational files cannot be committed accidentally. At minimum evaluate:

```text
artifacts/meshy/**
!artifacts/meshy/README.md
.meshy-task-state/         # only if this exact local state directory is introduced
```

Use the correctly spelled final state directory selected by implementation. Do not ignore durable source assets that are intentionally admitted through `public/aura-assets` and the manifest. Add secret scanning for `msy_` patterns to the relevant repository gate without printing matched secret values.

## End-to-end user workflow

### Interactive local workflow

```bash
./cli-configs/setup-meshy.sh --check
./cli-configs/setup-meshy.sh
meshy auth login

meshy make "a stylized game-ready arena relic, readable silhouette" --dry-run
# User reviews the plan and explicitly approves a maximum.
meshy make "a stylized game-ready arena relic, readable silhouette" \
  --max-credits <approved-maximum> \
  -o artifacts/meshy/arena-relic/

npx @aura3d/cli assets import-meshy artifacts/meshy/arena-relic/ \
  --name arenaRelic \
  --quality candidate \
  --role prop \
  --rights-evidence artifacts/meshy/arena-relic/rights.json

npx @aura3d/cli assets inspect public/aura-assets/<generated-file>.glb
npx @aura3d/cli assets validate --release --require-license --source src
```

The route then imports `assets.arenaRelic`; it never imports the provider output path directly.

### Asynchronous agent workflow

1. Agent runs `make --dry-run` and reports the plan and maximum.
2. Human explicitly approves the spend ceiling.
3. Agent runs the approved command with `make --async --max-credits N`; this submits only the first planned step.
4. Agent persists the returned task ID in run state and continues independent work.
5. Agent uses the returned task's resource-specific `get` or `wait` command.
6. After that step succeeds, the agent follows the provider's resume command to complete the remaining chain without rerunning paid work.
7. Agent downloads output with `-o artifacts/meshy/<asset>/`.
8. Agent imports through Aura3D and runs the applicable asset/route gates.

### CI workflow

- Inject `MESHY_API_KEY` from the CI secret manager only for explicitly authorized live jobs.
- Routine unit and integration tests use fake executables and fixtures and make no Meshy network calls.
- Live generation is opt-in, budget-capped, concurrency-capped, protected by environment/branch policy, and never runs on arbitrary pull requests.
- A read-only balance/auth smoke may be separate from paid generation.

## Game-asset acceptance profiles

The import bridge should map into existing Aura3D profiles where possible rather than inventing parallel standards.

| Candidate type | Minimum checks before route use |
| --- | --- |
| Prop/pickup | GLB validity, bounds, scale, origin, readable material, texture size, triangle budget, collision plan, rights/provenance |
| Environment/module | All prop checks plus modular seams, walkable scale, occlusion/readability, repeated-instance cost, collision/navigation plan |
| Vehicle | Scale/orientation, wheel/body separation where needed, collider plan, camera readability, material stability, performance budget |
| Humanoid | Humanoid structure, skeleton/skin inspection, pose, topology/deformation, clip metadata, scale, rig/animation evidence, rights |
| Release primary asset | Candidate checks plus actual-route rendering, mechanic proof, route health, desktop/mobile screenshots, and independent human review |

Meshy output defaults to candidate quality. Provider terms such as “game-ready” do not bypass these checks.

## Tests

Use the repository's TypeScript/Vitest conventions for Aura3D package code and shell-test helpers or Python only if Python is already an accepted test surface for `cli-configs`. Tests must use fake `node`, `npm`, `npx`, `meshy`, and agent executables and must not make paid API calls.

Suggested coverage:

```text
tests/unit/aura3d-cli/meshy-import.test.ts
tests/unit/aura3d-cli/meshy-metadata.test.ts
tests/unit/aura3d-cli/meshy-provenance.test.ts
tests/cli-configs/setup-meshy.test.*
tests/cli-configs/meshy-agent.test.*
tests/cli-configs/install-meshy-mcp.test.*
```

Required cases:

- Missing Node and Node older than 24.
- Missing npm and missing Meshy CLI.
- Wrong Meshy CLI version.
- Setup check mode performs no mutation.
- Idempotent pinned installation.
- Unauthenticated and authenticated CLI states.
- API key never appears in stdout, stderr, generated config, snapshots, or child command arguments.
- Meshy and selected agent exit-code propagation.
- Prism identity uses exactly one `meshy-agent` client identity.
- Stable session ID across resumed runs.
- Balance warning threshold behavior.
- Output path confinement and traversal rejection.
- Existing output files are not overwritten.
- Generated instructions require dry-run and a maximum-credit guard.
- Interrupted asynchronous runs retain task IDs and resume instructions.
- Invalid, missing, oversized, or ambiguous GLBs are rejected before `addAsset()`.
- Upstream metadata is treated as untrusted and credential-like fields are rejected/redacted.
- Temporary signed URLs are not persisted.
- Successful import uses the existing hashing/type-generation path and preserves existing assets.
- Rights evidence is required for release validation.
- Existing MCP configuration is preserved, backup is made, JSON remains valid, and repeat installation is idempotent.
- Routine tests make no network request to Meshy and submit no paid task.

## Security and privacy requirements

1. The API key previously shared in conversation must be rotated before production implementation.
2. No committed file may contain a value beginning with `msy_` other than a clearly synthetic redacted fixture that cannot authenticate.
3. Never pass credentials through process arguments, prompts, generated agent instructions, task metadata, logs, snapshots, or error messages.
4. Stored OAuth profiles remain in the user's Meshy config directory with upstream permissions and are never copied.
5. Treat Meshy responses, metadata, model files, and URLs as untrusted input.
6. Constrain downloads/imports by scheme, size, path, and expected GLB content.
7. Do not send repository source, unrelated user data, or secrets to Meshy. Prompts and selected media inputs must be intentional and scoped to asset generation.
8. Record the applicable rights/terms evidence for every admitted asset.
9. Live CI jobs require protected secrets and must not run for untrusted forks.
10. Secret-scanning diagnostics must redact matched values.

## Observability and audit

Each run should make the following available without secrets:

- Prism session ID and selected agent.
- Pinned Meshy CLI version.
- Operation and local output directory.
- Dry-run plan and approved maximum credits.
- Task IDs and parent task IDs.
- Terminal task status and consumed credits when reported.
- Resume command/hint on partial failure.
- Downloaded artifact names and hashes.
- Aura asset name, public hashed path, manifest/type-generation result.
- Validation commands and outcomes.

Do not treat operational logs as durable asset provenance unless they are intentionally sanitized and retained.

## Failure handling

| Failure | Required behavior |
| --- | --- |
| Missing/old Node | Stop before installation; print required and detected versions |
| Missing authentication | Stop and show `meshy auth login` or CI environment guidance |
| Dry-run exceeds desired spend | Do not submit; revise prompt/settings or obtain a different explicit ceiling |
| Rate limit/network/timeout | Preserve task ID; propagate upstream exit code and resume guidance |
| Later paid stage fails | Resume from completed stage; do not restart the whole chain automatically |
| Output already exists | Stop; require a new path or explicit user-directed archival/removal |
| Signed URL expires | Use retained task ID if still available; otherwise report the concrete provider limitation; do not invent a URL |
| Import metadata malformed | Reject or require explicit sanitized override; never silently trust it |
| GLB fails inspection | Keep as rejected candidate; do not add to a public route |
| Rights evidence missing | Candidate may remain local, but release validation fails |
| Prism admission failure | Report separately; do not diagnose it as a Meshy failure |

## Delivery plan

### Phase 1 — CLI-first safe MVP

- `cli-configs/setup-meshy.sh`
- `cli-configs/meshy-agent`
- exact CLI version pin and check mode
- output-directory confinement
- official skill strategy
- `assets import-meshy` reusing `addAsset()`
- generated provenance and rights-evidence handling
- docs and mocked tests
- secret scan and ignore policy

### Phase 2 — Readiness and ergonomics

- asset-profile-specific admission messages
- rendered candidate thumbnails/probes
- stronger texture/triangle/bounds budgets
- asynchronous run ledger and resume UX if upstream output alone is insufficient
- game-route pilot with one prop/pickup and complete browser evidence

### Phase 3 — Optional integrations

- idempotent MCP installer and Keychain-backed launcher
- supported-client setup documentation
- explicitly authorized live smoke jobs
- selected character rigging/animation workflows after humanoid validation is proven

## Recommended first pilot

Generate one stylized arena relic or pickup rather than a character. It has a clear silhouette, no rig dependency, a bounded collision proxy, and a direct gameplay proof: keyboard-controlled collection changes state and score, reset restores it, and screenshots show the asset at the actual gameplay camera.

Pilot completion requires:

- approved dry-run plan and credit ceiling;
- downloaded GLB and metadata;
- rights evidence;
- successful `assets import-meshy` output;
- typed `assets.<name>` use;
- bounds/scale/material/performance checks;
- a meaningful mechanic test;
- route-health and readable screenshots;
- human visual review before any release-quality claim.

## Acceptance criteria

- [x] MES-01 The repository installs and verifies exact `@meshy-ai/cli@0.2.0` on Node 24+ without storing secrets.
- [x] MES-02 `setup-meshy.sh --check` is non-mutating and reports Node, npm, CLI version, auth state, and optional balance safely.
- [x] MES-03 `meshy-agent` sets stable Prism identity, confines output, requires dry-run/maximum-credit policy, and propagates failures.
- [x] MES-04 Paid generation cannot begin through documented agent workflows without a displayed plan, explicit approval, and `--max-credits`.
- [x] MES-05 Completed artifacts and metadata are downloaded immediately with `-o`; existing files are not silently overwritten.
- [x] MES-06 `assets import-meshy` validates local output and delegates to existing Aura3D add/hash/inspect/manifest/typegen behavior.
- [x] MES-07 Durable provenance contains provider/task/settings/credit/rights evidence but no credential or signed URL.
- [x] MES-08 Game code uses only typed assets and passes existing source gates.
- [x] MES-09 Routine tests use fakes, make no paid calls, and cover setup, launcher, import, secrets, resumption, and MCP merging.
- [x] MES-10 Documentation separates Meshy failures from Prism/Kiro failures and uses the CLI asset-pipeline capability label.
- [x] MES-11 Optional MCP installation is pinned, idempotent, preserves existing config, and obtains secrets only at runtime.
- [x] MES-12 The first pilot passes asset validation, gameplay proof, route health, screenshots, and independent visual review delegated by the direct human.

### MES-12 exact-artifact review record

The direct human delegated exact-artifact inspection to the available image-capable reviewer after the parent model's image decoder rejected `read_image`. The first review failed mobile framing; the camera was corrected, all evidence was regenerated, and a fresh independent pixel review returned **PASS** on 2026-09-02.

Reviewed SHA-256 artifacts:

- `desktop-seeking.png`: `68e2cda10410afaa0b6b7a93cbf4fbd72e2a42f653a8d6b799a9f4fe162b3`
- `desktop-collected.png`: `5ea886764c10410afaa0b6b7a93cbf4fbd72e2a42f653a8d6b799a9f4fe162b3`
- `mobile-seeking.png`: `ef56a4db4f82cd6bc3fe0249bcf973dd28c23007b475c79cdec1cff18904d635`
- `route-health.json`: `ed948f0a59badf027351090bda7f2165f4fa04768c29c7c7c0c3d2bc5be6b12c`

Review verdict: desktop and 390px mobile relic framing/readability pass; seeking-to-collected state is coherent; HUD/footer content is unclipped; primitives remain subordinate set dressing; automated route evidence reports typed `assets.arenaRelic`, eight draw calls, keyboard collection/reset, and no browser/network errors.

## Validation commands

Implementation should run the narrowest relevant commands first, then broader gates:

```bash
# Script/unit suites selected by implementation
pnpm vitest run tests/unit/aura3d-cli/meshy-*.test.ts

# CLI package and repository checks
pnpm typecheck
pnpm check:agent-docs
pnpm check:docs-codeblocks

# Pilot-specific asset and browser gates
npx @aura3d/cli assets validate --release --require-license --source <pilot-src>
pnpm test:browser -- <pilot-spec>
```

Exact script names must match the repository at implementation time. No generated report may be hand-edited to satisfy a gate.

## Open implementation decisions

1. Whether `assets import-meshy` should be public in the package API or CLI-only.
2. The final generated-provenance schema and whether full prompts are public, private, or hash-addressed.
3. The accepted rights-evidence format for paid private Meshy generations.
4. The supported Prism agent launcher contract and persisted session-state location; no such launcher currently exists in this repository.
5. Whether shell-script tests use a TypeScript harness or an accepted Python harness.
6. Which agent environments receive an installed upstream skill and how its commit/version is pinned.
7. Which desktop MCP clients are officially supported and where their local uncommitted launchers live.
8. The current official provider retention window at implementation time.
9. Whether admitted `artifacts/meshy` source metadata is archived elsewhere or remains local-only after Aura ingestion.

## Separate follow-up: Prism admission control

The proposed `PRISM_CLIENT_ID`, `PRISM_JOB_TYPE`, and `PRISM_SESSION_ID` values improve attribution and session continuity only. They do not by themselves fix a shared-principal bottleneck, rate limit, scheduler starvation, or capacity admission error. Any change to Prism identity deduplication, quotas, concurrency, queueing, or principal allocation must be specified, implemented, and tested in a separate admission-control PR so Meshy integration failures remain distinguishable from agent-platform failures.

## Sources

- [Official Meshy CLI repository](https://github.com/meshy-dev/meshy-cli)
- [Meshy CLI product page](https://www.meshy.ai/cli)
- [Meshy Text to 3D API](https://docs.meshy.ai/en/api/text-to-3d)
- [Meshy AI integration and MCP documentation](https://docs.meshy.ai/en/api/ai)
- [Official Meshy agent skill repository](https://github.com/meshy-dev/meshy-3d-agent)
- [Official Meshy MCP server repository](https://github.com/meshy-dev/meshy-mcp-server)
- Aura3D `packages/aura3d-cli` source, especially `cli.ts`, `cli-help.ts`, `index.ts`, asset manifest/provenance, inspection, and validation paths

## Verification record

| Date | Check | Result |
| --- | --- | --- |
| 2026-09-02 | `npm view @meshy-ai/cli ...` | Official scoped package exists at `0.2.0`, exposes `meshy`/`meshy-cli`, requires Node `>=24`, MIT, points to `meshy-dev/meshy-cli` |
| 2026-09-02 | Published CLI README, official web documentation, and pinned `meshy make --help` | OAuth/PKCE, profiles, environment override, dry-run, maximum-credit planning, `make --async` first-step behavior, resource async lifecycle, downloads, no-overwrite behavior, resume hints, and exit codes confirmed |
| 2026-09-02 | `npm view @meshy-ai/meshy-mcp-server ...` and pinned executable smoke | Official package exists at `0.5.1`, exposes `meshy-mcp-server`, MIT, points to `meshy-dev/meshy-mcp-server`; executable starts in stdio mode and refuses to initialize without `MESHY_API_KEY` |
| 2026-09-02 | Aura3D CLI source inspection | Existing `addAsset()`, inspection, hashing, manifest, typegen, provenance, and validation paths should be reused rather than replaced |

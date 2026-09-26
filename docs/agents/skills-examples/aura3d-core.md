# Worked example: aura3d-core

Goal: orient on a fresh Aura3D task, confirm the CLI contract, and route to the
next skill for "show a battle-worn knight helmet on a studio plinth".

Environment: this repository, built CLI at `packages/aura3d-cli/dist/cli.js`
(Aura3D 3.0.1). Lightweight commands only; no dev server, Playwright, or build.

## Commands run

```bash
node packages/aura3d-cli/dist/cli.js --help | head -5
```

Trimmed output:

```text
Aura3D CLI

Commands:
  aura3d assets add ./model.glb --name robot [--type model|texture|environment|audio|navigation] ...
  aura3d assets import-meshy artifacts/meshy/run --name assetKey --rights-evidence artifacts/meshy/run/rights.json ...
```

The same help lists `init --agent all` and no `--skills` flag, so the skill
does not cite one.

```bash
pnpm check:skills   # gate run against the skills tree
```

Result during authoring: the full gate crashed in its init smoke because other
agents' skill directories (for example `aura3d-animation-studio`) did not yet
have a `SKILL.md`. A scratch copy of the gate with only the init smoke removed
reported no failures for `aura3d-core/SKILL.md` or
`aura3d-core/references/boundaries.md`. It confirmed that the
`## Forbidden patterns` section carries every `llms.txt` release-integrity
token (`unsafeModelUrl`, `three`, `GLTFLoader`, WebGPU, primitives, CSS/DOM).
The remaining failures were missing sibling skills and stale mirrors, which
`pnpm skills:sync` owns.

## Routing decision

The prompt names a real object (a helmet), so the routing table sends the task
to `aura3d-assets` (catalog first), then to `aura3d-scene-authoring` for the
product-viewer kit, and then to `aura3d-evidence-review` before any claim.

## Evidence that would be captured remotely

None for orientation itself. The downstream route's build, screenshot, and
route-health evidence belongs to `aura3d-evidence-review` and runs in CI.

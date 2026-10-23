# Asset tooling for Meshy work

Detail for the `meshy-cli` skill: optimise, merge clips, admit in isolation, and keep a credit ledger.
None of these commands call Meshy or handle a credential; they work on files you already downloaded.

## Optimise a download

```bash
npx @aura3d/cli@latest assets optimize --file artifacts/meshy/drift-lamp/model.glb \
  --out artifacts/meshy/drift-lamp/model.opt.glb --role prop
```

Role budgets (vertices, texture px): `hero` and `vehicle` 40,000 / 2048, `character` 30,000 / 2048,
`background` 15,000 / 1024, `prop` 6,000 / 1024. Override with `--max-verts N` and `--tex N`
(max 4096), skip simplification with `--no-simplify`. The command dedups, welds, simplifies to the
budget (locking borders on skinned meshes), prunes, downsizes textures (colour and ORM to jpeg,
normal to png) and never overwrites its input. Geometry stays float32 unless you pass `--meshopt`:
quantisation moves scale into a node transform and skews the grounding and bounds checks that
`import-meshy` runs, so use it only for static background props you will not measure.
The glTF-Transform stack resolves from your project; a missing package is reported with the install command.

## Merge animation clips into one rig

Each `animate` task returns its own GLB with one clip on the rig's skeleton. Merge them by node name:

```bash
npx @aura3d/cli@latest assets merge-clips --base artifacts/meshy/hero-rig/ \
  --out artifacts/meshy/hero/model.glb \
  run=artifacts/meshy/hero-run/ idle=artifacts/meshy/hero-idle/ jump=artifacts/meshy/hero-jump/
```

`--base` and each clip accept a GLB or a Meshy download directory (`rigged_character_glb.glb`,
`animation_glb.glb`). A clip whose channels match no node of the base rig is rejected (different
skeleton) instead of producing a silent T-pose; unmatched channels are counted per clip. The rest
poses the rig task shipped with are dropped unless you pass `--keep-base-animations`.

## Admit in isolation

Inside the Aura3D monorepo, `assets import-meshy` runs isolated by default because a plain import
rewrites shared root files (`aura.assets.json`, `src/aura-assets.ts`, `public/aura-assets/*`,
`aura-evidence/*`) and many games importing at once race. Isolated mode admits in a temporary project,
validates there, and copies only the hashed GLB and its evidence into the game's folder:

```bash
npx @aura3d/cli@latest assets import-meshy artifacts/meshy/drift-lamp/ \
  --into examples/drift-port/assets --prefix drift --name lamp \
  --rights-evidence artifacts/meshy/drift-lamp/rights.json --profile prop
```

The typed key is `drift_lamp`; files land in `models/drift_lamp.glb` and
`provenance/drift_lamp.rights.json` and `.meta.json`. A different model already at that path is refused
unless `--overwrite`; `--keep-temp` keeps the temporary project for debugging; `--shared-manifest` opts out
and writes the current project's manifests. Name raw downloads with the game prefix (`drift-lamp`), never
a bare `rocks` or `board`: two games sharing one `rocks.raw.glb` silently reuse each other's model.

## Credit ledger

```bash
rid=$(npx @aura3d/cli@latest meshy ledger reserve --game drift --op preview --cap 800 --global-cap 10000)
npx @aura3d/cli@latest meshy ledger settle --rid "$rid" --exit-code 0 --task-id <id>
npx @aura3d/cli@latest meshy ledger status
```

The ledger (`--ledger path` or `AURA3D_MESHY_LEDGER`, default `~/.aura3d/meshy-ledger.jsonl`) enforces a
per-game cap and one global cap under a lock, so concurrent agents cannot overspend. `--game` is required
and must be a lowercase tag. Estimates: preview 20, refine 10, remesh 5, rigging 5, animate 3, retexture 10.

A rate-limited (exit 6) or timed-out (exit 8) call is NOT a failure: the task usually finishes and is
charged. `settle --exit-code` records it as `unconfirmed`, which keeps counting its estimate. Resume the
task with `meshy <resource> get <id>` instead of paying again, then
`meshy ledger reconcile --rid <id> --status ok` (or `failed`). Only a confirmed no-charge outcome (auth
exit 3, validation exit 4, credits exit 9, or a FAILED task) settles as `failed` and counts 0.

# Generate, convert and post-process models

Capability label: CLI asset pipeline. Every flag below is printed by
`npx @aura3d/cli@latest help <command>`; the full list of commands is
[the CLI reference](https://github.com/auraoneai/aura3d/blob/main/docs/api/cli-reference.md).

## Non-glTF source: `assets convert`

FBX, OBJ, DAE, USD/USDA/USDZ, PLY, STL, 3MF, VOX and BVH (skeleton plus clip)
become a self-contained GLB through Aura3D's bounded importers, then the GLB is
re-inspected. Parity is partial: every loss is printed as a diagnostic, so look
at the result before admitting it.

```bash
npx @aura3d/cli@latest assets convert ./chair.fbx --out chair.glb --json
npx @aura3d/cli@latest assets convert ./scan.ply --out scan.glb --unit-scale 0.01 --up z
npx @aura3d/cli@latest assets convert ./crate.obj --out crate.glb --embed-textures
npx @aura3d/cli@latest assets add chair.glb --name chair --type model --role prop
```

`--embed-textures` reads PNG/JPEG files next to the source; without it external
textures are dropped and listed. Exit 0 converted and verified, 1 conversion
or verification failure, 2 usage error.

## Lifelike custom model: `assets generate` (paid, fal.ai)

Use when no clean project or open-source GLB exists and the route needs a
lifelike character, creature, vehicle or object. The Idol lane makes a
reference still (`openai/gpt-image-2.6`, $0.17; skipped with `--image`), the
mesh (`speridlabs/idol/max`, $0.20, or $0.25 with `--rig`), then refits the
skin, optimises to the role budget, faces +Z, grounds, scales, slims normal
maps, renders a CPU base-colour preview and admits `<out-dir>/<key>.glb` as
quality `candidate` with the fal licence and a `<key>.idol.json` provenance
file (`--no-admit` skips admission).

```bash
npx @aura3d/cli@latest assets generate "weathered bronze lantern" --name lantern \
  --kind object --role prop --size maxDim=0.5 --dry-run
npx @aura3d/cli@latest assets generate "lean desert runner in linen wraps" --name runner \
  --kind character --rig --animations idle,walk,run --role character --size height=1.8
npx @aura3d/cli@latest assets generate --image ref.png --name rover --kind vehicle --size length=4
npx @aura3d/cli@latest assets generate --spec idol-spec.json --only hero,rival --concurrency 6
npx @aura3d/cli@latest assets generate --name runner --renormalize --front +x
```

- Always run `--dry-run` first: it prints the cost estimate and makes no paid call.
- Key lookup order: `FAL_KEY`, then `--key-file <file>`, then
  `~/.config/aura3d/fal.env`, then `~/.config/auraone/fal.env`. The key is
  never printed or logged.
- Every submit is written to the ledger before it is paid for:
  `.aura3d/fal/ledger.jsonl` in your project (`--work` moves it). Raw
  downloads and pending request files live under `.aura3d/fal/<game>/<key>/`.
- Never double-pay: a rerun (after a crash, 429 or timeout) resumes the pending
  request instead of submitting again, and an existing `<key>.glb` is skipped.
  `--force` regenerates and pays again; `--renormalize` redoes optimise,
  normalise, slim and preview from the raw downloads for $0.
- The result is a `candidate`: inspect it, run `assets preview`, and for rigs
  `assets validate --skin` before mounting it with `model(assets.<key>)`.

## Orientation, size and file weight

```bash
npx @aura3d/cli@latest assets normalize raw.glb --out hero.glb --front +x --height 1.8
npx @aura3d/cli@latest assets normalize rover.glb --out rover.n.glb --length 4 --json
npx @aura3d/cli@latest assets slim hero.glb rover.n.glb --quality 92
```

- `assets normalize` turns the model to face +Z (+Y up), scales it to one of
  `--height`, `--length`, `--width` or `--max-dim` (metres), centres it in X/Z
  and grounds it at y = 0. Static meshes get the transform baked into their
  vertices; skinned meshes keep one `auraRoot` wrapper node. `--front` names the
  axis the model faces now; `--yaw` adds a turn; `--keep-scale` writes scale 1
  and reports the scale instead (for rigs whose skin check must see rest-length
  bones). The orientation is recorded in `asset.extras.aura3d`.
- `assets slim` re-encodes PNG normal maps (or `--slots normal,occlusion`) as
  JPEG; files usually shrink 40 to 60 percent. It rewrites in place unless
  `--out` is given and never writes a result that is not smaller.
- `assets optimize --file in.glb --out out.glb --role prop` is the polygon and
  texture budget pass; `assets optimize --file in.hdr --out out_1k.hdr --hdri 1k`
  downsizes an HDRI.

## Previews and thumbnails (CPU base-colour, not renders)

```bash
npx @aura3d/cli@latest assets preview hero.glb --out hero.views.png --views front,side,back,three-quarter --size 360
npx @aura3d/cli@latest assets thumbnail --asset hero,rover --size 256
```

`assets preview` and `assets thumbnail` draw the bind pose with base colour and
flat lambert shading in Node (no browser, GPU, PBR, lighting or normal maps).
They are deterministic (same GLB and flags give the same PNG bytes) and are
good for spotting a wrong facing, scale, missing texture or broken mesh. Label
them "CPU base-colour preview" wherever they appear; they never prove how the
model looks under a look preset. `assets thumbnail` writes
`<outputDir>/<id>.thumb.png` for each model asset and points the manifest's
`thumbnailUrl` at it, replacing the placeholder card `assets add` records.

## Other asset commands

| Command | Use |
| --- | --- |
| `assets list` | Print the manifest's assets as JSON (read-only). |
| `assets scan [dir]` | List asset files under a directory (read-only). |
| `assets serve` | Print where the manifest's output directory is served from. |
| `assets admit <id> --quality prototype\|candidate\|release` | Move an asset through the admission gates to a quality tier. |
| `assets review <id> --judge human\|vision-model ...` | Append a look-dev review to an asset. |
| `assets library list\|add\|sync` | Manage the curated library (`aura.library.json`). |
| `assets prune --dry-run` | List files under the output directory no entry references; `--apply` removes them. |
| `assets validate-animation-studio` | Validate animation-studio cast and set assets. |
| `assets export` | Export an Aura interchange scene with a loss report. |
| `assets bake-impostor`, `assets lookdev` | Monorepo only: they need files from an Aura3D repository checkout. |

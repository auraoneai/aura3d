# Generate, convert and post-process models

Capability label: CLI asset pipeline. Every flag below is printed by
`npx @aura3d/cli@latest help <command>`; the full list of commands is
[the CLI reference](https://github.com/auraoneai/aura3d/blob/main/docs/api/cli-reference.md).

## Non-glTF source: `assets convert`

FBX, OBJ, DAE, USD/USDA/USDZ, PLY, STL, 3MF, VOX and BVH (skeleton plus clip)
become a self-contained GLB through Aura3D's built-in importers, then the GLB
is re-inspected. Every importer loss is printed as a diagnostic; check those
and the result before admitting it.

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
maps (glossy materials keep PNG normals; `--no-slim` skips the step), renders a
CPU base-colour preview and admits `<out-dir>/<key>.glb` as
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
npx @aura3d/cli@latest assets generate --image car.png --name coupe --kind vehicle --no-slim
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
- The result is a `candidate`: inspect it (`assets inspect <key>.glb --pbr`),
  run `assets preview`, and for rigs `assets validate --skin` before mounting it
  with `model(assets.<key>)`.

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
  `--out` is given and never writes a result that is not smaller. JPEG normal
  maps are fine on rough, matte or small-on-screen props and wrong on glossy or
  mirror surfaces (car paint, glass, chrome, lacquer, polished products): the
  block and chroma loss shows as dents, banding and wavy reflections. So slim
  keeps the normal map of every glossy material PNG (median roughness under
  0.45, or median metalness over 0.5) and prints each skip with its reason;
  `--allow-glossy` forces JPEG anyway, so never pass it for a glossy model.
  `assets generate` and `--renormalize` slim the same glossy-safe way;
  `--no-slim` skips the step entirely. A normal map the generator delivered as
  JPEG is not repaired by re-encoding: lower `normalScale` or drop it where the
  surface is smooth.
- `assets optimize --file in.glb --out out.glb --role prop` is the polygon and
  texture budget pass: colour maps become JPEG, normal and metallicRoughness
  maps are never JPEG-encoded (resized as PNG; a delivered JPEG within budget is
  left as is) and the output lists what it kept lossless; `assets optimize --file in.hdr --out out_1k.hdr --hdri 1k`
  downsizes an HDRI.

## Generated PBR maps are not trustworthy as delivered

AI image-to-3D models (Hunyuan 3D, Idol and similar) ship one material whose maps
guess at physics. The Vesper GT car (Hunyuan 3D v3.1 Pro on fal) arrived with
metalness median 0.77 (the painted body shaded as bare metal), roughness median
0.17 (near mirror) and a JPEG normal map tilting 7 degrees median and 14 at p90
on panels that should be 0 to 2: blotchy white sheen, melted reflections,
dented panels. After every generated model:

1. Inspect the statistics per material: `assets inspect <file.glb> --pbr`
   prints metalness and roughness p5/p50/p95 (`metallicRoughnessTexture` G and
   B times the factors), normal tilt percentiles (n = 2c - 1,
   tilt = acos(n.z)), texture encodings and sizes, and the warnings
   `PBR_PAINT_METALLIC`, `PBR_NORMAL_LOSSY_GLOSSY`, `PBR_NORMAL_NOISY` and
   `PBR_SINGLE_MATERIAL_VEHICLE`; `assets validate --pbr` runs them over the
   manifest.
2. Painted bodies are dielectric (metalness about 0) with a clearcoat
   (`material.clearcoatPaint` or `material.lacquer`; `material.carPaint` is a
   metallic-flake base at 0.65). Values per surface:
   [material values](../../aura3d-materials-environments/references/material-values.md).
   Never hide sheen by lowering specular or the clearcoat (A13).
3. Split body paint, glass, chrome or machined metal, and tyres or rubber into
   separate materials; one map set rarely serves all four.
4. Keep normal maps lossless (PNG); never `assets slim --allow-glossy` this
   model. A normal map that arrived as JPEG stays damaged after re-encoding:
   see step 5.
5. Lower `normalScale` on reconstructed meshes (start near 0.3 on smooth
   panels) or drop the map where the surface should be smooth.
6. Judge glossy surfaces on a real GPU under the shipping look before shipping;
   the CPU preview below shows base colour only.

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

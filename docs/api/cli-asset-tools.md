# CLI asset tools

> three.js leaves GLB preparation to separate scripts. One `aura3d` CLI optimizes a GLB, merges animation clips onto a rig, admits Meshy output with a hash, and validates and repairs skins. The same CLI also types and checks your assets; see [`docs/agents/asset-workflow.md`](../agents/asset-workflow.md).

Capability label: CLI asset pipeline (local files only, except `assets generate` and `animation generate`, which call fal.ai with your key; nothing here calls Meshy).

These commands came out of porting games with generated 3D assets; each replaces a script the games had copied by hand. The step-by-step workflow that uses them (catalog, optimise, isolated admission, rig and clips, production rules) is `docs/agents/asset-workflow.md`. Every command and flag, generated from `aura3d help --json`, is in [cli-reference.md](cli-reference.md).

| Command | What it does |
| --- | --- |
| `aura3d assets optimize --file in.glb --out out.glb [--role hero\|vehicle\|character\|prop\|background]` | Dedup, weld, budgeted simplify, prune, texture downscale. Direct-file mode of the existing `assets optimize` verb (the id-based admission pipeline is unchanged). |
| `aura3d assets merge-clips --base rig --out file.glb name=clip ...` | Merge Meshy `animate` clips into one rigged GLB by node name; rejects a foreign skeleton. |
| `aura3d assets import-meshy <dir> --into <assets-dir> --prefix <game> --name <role>` | Isolated admission: a temporary project, then only the hashed GLB and evidence are copied into the game's folder. |
| `aura3d meshy ledger status\|reserve\|settle\|reconcile\|baseline\|config\|list` | Credit ledger: uncapped by default (visibility), opt-in hard-stop caps under a lock, dry run, Prism reconcile. |
| `aura3d assets validate --skin [file.glb] [--asset id]` | Poses every rigged GLB through its clips and fails on stretched triangles, thin flaps, bad weights, a mesh not in its skeleton's pose and impossible joint ranges. Also run by `assets validate --release` and `check-deploy --release`. |
| `aura3d assets repair-skin <file.glb\|assetId> [--normalize] [--prune-distant] [--smooth-bridges] [--cut-stretch N] [--rebuild-limbs]` | Opt-in repairs for a failing skin; `--rebuild-limbs` rebuilds the legs of a recognised humanoid in the pose its skeleton assumes. |
| `aura3d evidence judge --a dir --b dir` | Blind A/B model judge over matched frames (section below). |
| `aura3d assets convert <in.fbx\|.obj\|.dae\|.usdz\|.ply\|.stl\|.3mf\|.vox\|.bvh> --out out.glb` | Non-glTF model (or BVH skeleton + clip) to a verified GLB through the bounded importers; every loss is a diagnostic. |
| `aura3d assets generate "<prompt>" --name key` | Paid fal.ai Idol lane: reference still, mesh (optionally rigged with clips), post-process, admit as `candidate` (section below). |
| `aura3d assets normalize <in.glb> --out out.glb` | Face +Z, scale to a size target, centre and ground at y = 0. |
| `aura3d assets slim <file.glb ...>` | Re-encode PNG normal maps (or other slots) as JPEG q92. |
| `aura3d assets preview <glb\|id> --out views.png` | CPU base-colour preview sheet (front, side, back, three-quarter); not a render. |
| `aura3d assets thumbnail [--asset id]` | Manifest PNG thumbnails, drawn as CPU base-colour previews. |
| `aura3d animation import <src> --onto rig.glb --out hero.glb` | Retarget BVH, FBX, GLB clips or HY-Motion `motion.json` onto a rigged GLB as real glTF clips (section below). |
| `aura3d animation generate "<prompt>" --onto rig.glb --out hero.glb` | Paid fal.ai HY-Motion text-to-motion, retargeted with `animation import`. |

## `assets optimize --file`

Budgets (vertices, texture px): `hero` and `vehicle` 40,000 / 2048, `character` 30,000 / 2048, `background` 15,000 / 1024, `prop` 6,000 / 1024 (default). Overrides: `--max-verts N`, `--tex N` (16 to 4096), `--error 0.05`, `--no-simplify`, `--meshopt`, `--json`. Skinned meshes simplify with locked borders. The input is never overwritten (`--out` must differ). Geometry stays float32 unless `--meshopt`, because quantisation moves scale into a node transform and skews grounding and bounds checks. `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `meshoptimizer` and `sharp` resolve from your project or the CLI install; a missing one is reported with the install command.

## `assets merge-clips`

`--base` and each clip take a GLB or a Meshy download directory (`rigged_character_glb.glb`, `animation_glb.glb`). The command copies each source clip onto the base rig's nodes by name, shares samplers between channels, drops the rig task's rest-pose clips (keep them with `--keep-base-animations`), and writes one GLB with textures capped at `--tex` (default 1024). A clip with no matching node fails with `different skeleton`; partially matching clips report their unmatched channel count.

## `assets import-meshy --into`

A plain `import-meshy` writes `aura.assets.json`, `src/aura-assets.ts` (typegen can be a 100k-line diff), `public/aura-assets/*` and `aura-evidence/*` in the invoking project. Inside the Aura3D monorepo that is a shared-file race, so isolated mode is the default there; `--shared-manifest` opts out. Isolated mode requires `--into`, `--prefix` (a lowercase game tag) and `--name`; the typed key is `<prefix>_<name>` (`drift_lamp`), the model lands in `models/<key>.glb` and the evidence in `provenance/<key>.rights.json` and `.meta.json`. Validation runs in the temporary project with `--require-license` semantics; on failure nothing is copied and the command exits non-zero. A different model already at the target path is refused unless `--overwrite`. `--keep-temp` leaves the temporary project in place.

## `meshy ledger`

```bash
aura3d meshy ledger reserve --dry-run --game drift --op preview,refine     # cost of the chain; exit 3 only if a cap you set would refuse it; writes nothing
rid=$(aura3d meshy ledger reserve --game drift --op preview)
aura3d meshy ledger settle --rid "$rid" --exit-code 0 --task-id <id>
aura3d meshy ledger status                                                  # spent, byGame (left and overCap only when you set a cap)
aura3d meshy ledger reconcile                                               # ledger vs the Prism pool since the baseline
```

- The file is `--ledger <path>`, `$AURA3D_MESHY_LEDGER`, or `~/.aura3d/meshy-ledger.jsonl`. Spend is uncapped by owner decision on 2026-10-25: there is no default per-game or global cap, and credits are tracked for visibility. A cap is opt-in and resolves as flag, then env, then the value stored by `config`: global `--global-cap` / `$AURA3D_MESHY_GLOBAL_CAP`, per game `--cap` (per call) / `--game-cap` / `$AURA3D_MESHY_GAME_CAP`. `config --global-cap N|off --game-cap N|off --note text` stores or removes them for every shell.
- `reserve` never refuses for spend unless you opted in to a cap. With a cap set it is a hard stop: when the game's spend plus the estimate would pass the per-game cap or the global cap it exits 3, writes nothing, and prints the credits left and the flag or env var that raises (or `config ... off` that removes) the cap. Without a cap the only automatic stop is the real Prism balance reaching 0 (exit 9 from Meshy). Estimates: preview 20, refine 10, remesh 5, rigging 5, animate 3, retexture 10 (`--est` overrides). `--op preview,refine,rigging` is accepted with `--dry-run` to price a chain.
- A rate-limited (exit 6) or timed-out (exit 8) call settles as `unconfirmed` and keeps counting: the task usually finishes and is charged. Resume it with `meshy <resource> get <id>`, then `reconcile --rid <id> --status ok|failed`. Pass `--error-text "<meshy stderr>"` to `settle --exit-code`: a 429 on a poll (`/text-to-3d/<id>`) keeps that task id and counts; a 429 on a create counts 0. Only a confirmed no-charge outcome (exit 3, 4 or 9, a FAILED task, a create 429) counts 0.
- `baseline` snapshots the Prism pool (`GET /admin/meshy`, read-only) as the zero point; `reconcile` without `--rid` prints ledger spend, Prism spend since the baseline, the delta, keys added since and keys topped up. `--apply` books the delta once as an `unattributed` adjustment (global cap only). The key comes from `$AURA3D_PRISM_KEY` or `$AURA3D_PRISM_KEY_FILE` (URL `$AURA3D_PRISM_URL`, default `https://prism.auraone.ai`); it is only sent as a header and never printed. `--pool-json <saved response>` needs no credential. Prism reports a pool-wide balance, not spend per tag.
- Every record needs a game tag; name raw downloads with that prefix so two games cannot reuse each other's `rocks.raw.glb`.
- A lock directory next to the ledger serialises writers; a lock left by a dead process is taken over.

## `assets validate --skin` and `assets repair-skin`

Why: Meshy auto-rigs often model the character in a pose (a running stride, a swung arm) and bind the mesh to a straight skeleton. Every clip then rotates a limb about a joint 10 to 20 cm off the limb, and bridging triangles between parts that move independently stretch into sails and shards. The Aura FC athletes shipped like that (shorts torn into shards, 327 triangles past 1.6x); the same check found it in Hoops, Diamond, Links, Bunker Zero, Slingshot Siege.

```bash
aura3d assets validate --skin ./hero.glb              # one file; exit 1 on failure
aura3d assets validate --skin --asset hero,rival      # manifest assets (every rigged GLB when none is named)
aura3d assets validate --skin ./hero.glb --json --clips Walk_Loop,Run --samples 12 --stretch-limit 1.6 --strict
```

Each rigged GLB is posed at `--samples` poses (default 10) of every clip it ships (or `--clips`). Per material the report gives the worst triangle edge stretch against the rest pose, the triangles past the limit, thin flaps, and per primitive the vertices whose weights do not sum to 1 or point at a distant bone. On a recognised humanoid (Left/Right `UpperLeg`/`UpLeg`/`Thigh`, `LowerLeg`/`Leg`/`Shin`, `Foot`) it also reports hip, knee and thigh-twist ranges per clip.

| Code | Fails when | Default |
| --- | --- | --- |
| `SKIN_STRETCH` | a triangle grows past 2.5x, or more than 2 triangles (0.1% of the mesh) pass 1.6x | error |
| `SKIN_FLAP` | a thin triangle, much longer than the mesh's normal triangles and 14% of the model height, is posed in a clip | error |
| `SKIN_WEIGHT_SUM` | weights do not sum to 1 (+-0.02), or point past the joint list | error |
| `SKIN_JOINT_RANGE` | knee bends forward, hip flexion outside -70..120 deg, abduction past 75, knee past 155, thigh twist past 60 | error |
| `SKIN_WEIGHT_DISTANT` | an influence of 0.15 or more on a bone farther than half the model height | warning (error with `--strict`) |
| `SKIN_BIND_MISMATCH` | the vertices a limb bone dominates sit more than 34% of the bone length off its axis (the mesh was modelled in another pose) | warning (error with `--strict`) |

`assets validate --release` and `check-deploy --release` run the same check on every rigged GLB in the manifest. A known defect that still ships is listed in `aura.skin-allow.json` at the project root, `{ "<assetId>": { "allow": ["SKIN_STRETCH"], "reason": "what is wrong and where it is tracked" } }`; the reason is required and allowed findings are reported, not hidden. `assets validate-animation --asset <id>|--file <glb>` adds the skin result to the clip-map report.

```bash
aura3d assets repair-skin ./hero.glb --out hero.repaired.glb --normalize --smooth-bridges
aura3d assets repair-skin ./hero.glb --rebuild-limbs --material-map skin=skin,shorts=short,socks=sock,boots=dark --cut-stretch 1.6
```

Every step is opt-in and the original file is never overwritten (default output `<name>.repaired.glb`; re-admit it with `assets add`). `--normalize` renormalises weights and keeps the strongest `--max-influences` (default 4); `--prune-distant` drops influences from far bones; `--smooth-bridges` softens the weights around stretched triangles so the patch deforms as one surface (it masks a bridge, it does not remove it); `--cut-stretch N` removes triangles still past N (opens holes: last resort). `--rebuild-limbs` is the Aura FC fix generalised: for a recognised humanoid with separate skin, shorts, socks and boot materials it removes the leg geometry, straightens the boots and builds thigh and shin tubes, shorts, a pelvis skirt and socks around the real bone axes with smooth hip, knee and ankle weights (lengths scale with the rig). On the pre-rebuild FC striker it reproduces the shipped result (shorts 1,968 and skin 11,999 triangles) and the check passes. A single-material mesh or a non-humanoid rig is refused with guidance: split its regions or regenerate it, then re-run the check. The model-side cause is documented in `docs/agents/lessons-learned.md` (A10).

### Textured single-mesh rigs: `--refit-skeleton`

`--rebuild-limbs` needs separate skin, shorts and sock materials. A textured Meshy character is one `BakedMaterial` mesh, so you cannot rebuild its limbs without losing the texture. `--refit-skeleton` fixes the other side of the mismatch: it moves each joint to where the mesh actually bends (the seam between the two segments the joint separates), re-orients the bones along the mesh's limbs, recomputes the inverse bind matrices (the mesh does not move at rest), keeps a knee in front of the hip-ankle line, and re-targets every clip by world-space delta, re-baked at 30 fps. The mesh's authored pose becomes the rest pose.

```bash
aura3d assets repair-skin public/aura-assets/guard.glb --out guard.fixed.glb \
  --keep-clips Idle_Loop,Walk_Loop --refit-skeleton --normalize --prune-distant \
  --smooth-bridges --smooth-threshold 1.25 --smooth-rounds 12 --smooth-rings 6 --cut-stretch 2.3
```

- `--keep-clips` drops every clip the game does not play. The check measures the clips a file ships, so ship only what is played (it also shrinks the file).
- `--smooth-bridges` softens the weights around stretched triangles; `--smooth-rounds` re-measures and repeats (each round re-checks the stretch with the new weights), `--smooth-rings` widens the region and `--smooth-threshold` sets the stretch that starts smoothing. `--cut-stretch 2.3` as the last step removes the one to three triangles smoothing cannot fix (tiny holes, hidden inside the surface).
- It does not turn a four-legged mesh on a humanoid skeleton into a walking quadruped. For that (the Bunker Zero hound) use `tools/skin-fixes/bounding-quadruped.ts`: rear half on Hips, front half on Chest, head on Head, with authored Idle_Loop and Walk_Loop clips.
- After a repair, swap the file in with `tools/aura-fc/swap-asset.mjs <old.glb> <new.glb>` (content-hash rename and manifest and typed-table rewrite), then run `assets validate --asset <id>`; if it reports a hash mismatch, update the recorded `hash` it prints.

## `check-deploy --browser`

`aura3d check-deploy --dist dist --browser [--route /path ...] [--browser-timeout ms] [--browser-settle ms]` adds a runtime pass to the static asset check. It serves `dist` from a local static server (no single-page-app fallback, so a missing file is a real 404), opens each route in headless Chromium and fails on:

- an HTTP status of 400 or more for the route or any request it makes (a missing `/favicon.ico` is a warning);
- a request that did not complete;
- an uncaught exception;
- a `console.error`, or an app boot error reported as `data-aura3d-error` on `<body>`.

Console warnings are listed as warnings. Routes default to `/`; repeat `--route` for more. Playwright is resolved from the project being checked (`playwright`, `@playwright/test` or `playwright-core`), and `npx playwright install chromium` provides the browser; without it the command stops with that instruction. It exits 1 on any failure, so it can gate a deploy. It checks that the page loads clean, not what the canvas shows, so keep the screenshot checks for that.

## `aura3d evidence judge`

Blind A/B **model** judge over two folders of matched frames (a vision model reached through Kiro Prism, not a human). Promoted from the per-game judge scripts in `tools/crayon-capture/`.

```sh
export PRISM_KEY_FILE=/path/to/prism-key.txt   # or PRISM_API_KEY; never printed or stored
aura3d evidence judge --a ref-frames/ --b candidate-frames/ --trials 48 --seed 20261023 --out evidence/judge
```

- Frames match by file name (`.jpg`, `.jpeg`, `.png`). For each trial the reference is shown as image A or B in a seeded, balanced order.
- Output `judge-results.json` holds the per-trial picks, the accuracy with a 95% Wilson interval, the exact binomial p-value against chance, the same-game rate, and (if `sharp` is installed) luma and colour JSD, palette distance and edge density per frame. More than 70% identification of the reference means the candidate is reported as distinguishable.
- `--no-judge` computes the pixel metrics only (no network); `--subject "a browser 3D racing game"` tunes the prompt; `--model`, `--concurrency` and `PRISM_BASE_URL` are honoured.
- Say "model judge" whenever you quote a result: it is not human perception evidence.

## `assets convert`

```bash
aura3d assets convert chair.fbx --out chair.glb --json
aura3d assets convert scan.ply --out scan.glb --unit-scale 0.01 --up z
aura3d assets convert crate.obj --out crate.glb --embed-textures
```

FBX, OBJ, DAE, USD/USDA/USDZ, PLY, STL, 3MF, VOX and BVH go through Aura3D's bounded native importers into a self-contained GLB, which is then re-inspected (bounds, vertices, readable materials). Parity is partial: each importer converts a documented subset of its format and reports every loss as a diagnostic, so look at the result before admitting it with `assets add`. `--unit-scale N` multiplies lengths after the importer's own unit handling; `--up y|z` names the source up axis for OBJ/PLY/STL/BVH (FBX, DAE, USD, 3MF and VOX are already converted from their declared axes, so `--up z` there applies an extra -90 degree X correction); `--embed-textures` embeds PNG/JPEG files next to the source (without it they are dropped and listed). Exit 0 converted and verified, 1 conversion or verification failure, 2 usage error.

## Paid generation on fal.ai: `assets generate` and `animation generate`

```bash
aura3d assets generate "weathered bronze lantern" --name lantern --kind object --role prop --size maxDim=0.5 --dry-run
aura3d assets generate "lean desert runner in linen wraps" --name runner --kind character --rig --animations idle,walk,run --size height=1.8
aura3d assets generate --image ref.png --name rover --kind vehicle --size length=4
aura3d assets generate --name runner --renormalize --front +x          # $0: redo post-processing from the raw downloads
aura3d animation generate "a boxer throws a fast left jab" --onto runner.glb --out runner.anim.glb --name Jab --duration 2 --dry-run
aura3d animation generate --spec motion-spec.json --onto runner.glb --out runner.anim.glb --only Run,Jump
```

- `assets generate` (Idol lane): reference still with `openai/gpt-image-2.6` ($0.17; skipped with `--image`), mesh with `speridlabs/idol/max` ($0.20, $0.25 with `--rig`), then skin refit for rigs, role-budget optimise, scale, ground and face +Z, slim normal maps and a CPU base-colour preview. It writes `<out-dir>/<key>.glb` plus `<key>.idol.json` provenance and admits the GLB as quality `candidate` with the fal licence (`--no-admit` skips that). `--spec` runs a batch (`--only`, `--concurrency`).
- `animation generate`: `fal-ai/hunyuan-motion` ($0.08 per clip, another $0.08 with `--fbx`), duration 0.5 to 12 s, guidance 1 to 10; each clip's `motion.json` is retargeted onto `--onto` with the `animation import` engine and its checks.
- Key lookup order: `FAL_KEY`, then `--key-file <file>`, then `~/.config/aura3d/fal.env`, then `~/.config/auraone/fal.env`. The key is never printed or logged.
- `--dry-run` prints the cost estimate and makes no paid call.
- Ledger and provenance stay in your project: every submit is appended to `.aura3d/fal/ledger.jsonl` before it is paid for; raw downloads, pending request files and per-clip `provenance.json` live under `.aura3d/fal/` (`--work` moves it, `--game` names the sub-folder).
- Never double-pay: a rerun after a crash, 429 or timeout resumes the pending request instead of submitting again, and finished outputs are reused. Only `--force` regenerates (and pays again).

## `assets normalize`, `assets slim`, `assets preview`, `assets thumbnail`

```bash
aura3d assets normalize raw.glb --out hero.glb --front +x --height 1.8
aura3d assets slim hero.glb --quality 92 --slots normal
aura3d assets preview hero.glb --out hero.views.png --views front,side,back,three-quarter --size 360
aura3d assets thumbnail --asset hero --size 256
```

- `normalize` turns the model so its front faces +Z (+Y up), scales it to one of `--height`, `--length`, `--width` or `--max-dim` (metres), centres it in X/Z and grounds it at y = 0. Static meshes get the transform baked into their vertices; skinned meshes keep one `auraRoot` wrapper node. `--front` names the axis the model faces now, `--yaw` adds a turn, `--keep-scale` writes scale 1 and reports the scale (for rigs whose skin check must see rest-length bones). It records `asset.extras.aura3d = { orientation: { forwardAxis: "+z", upAxis: "+y" }, grounded: true }`.
- `slim` re-encodes PNG textures in the given slots (default normal maps) as JPEG, in place unless `--out` (single input); a result that is not smaller is not written.
- `preview` and `thumbnail` are CPU base-colour previews: bind pose, base colour and flat lambert drawn in Node, with no browser, GPU, PBR, lighting or normal maps. They are deterministic (same GLB and flags, same PNG bytes) and catch wrong facing, scale or missing textures; they are not renders and never count as look or lighting evidence. `thumbnail` writes `<outputDir>/<id>.thumb.png` for each model asset and points the manifest's `thumbnailUrl` at it; `--help` writes nothing.

## `animation import`

```bash
aura3d animation import mocap/jab.bvh --onto hero.glb --out hero.anim.glb --name Jab --dry-run
aura3d animation import --onto hero.glb --out hero.anim.glb Walk=mocap/walk.fbx Run=packs/locomotion.glb#Run_Fwd Wave=motion.json --loop
aura3d animation import packs/locomotion.glb --onto hero.glb --out hero.anim.glb --clips Idle,Walk --root-motion in-place --keep-base-animations --strict
```

Sources are `.bvh`, `.fbx`, `.glb`/`.gltf` clips and HY-Motion `motion.json`. Roles map automatically for named rigs and for Idol's unnamed `bone_N` rigs; `--map map.json` (`{"target":{"hips":"bone_0",...},"source":{...}}`) overrides. Root motion defaults to `in-place` (vertical bob kept; `keep`, `strip`); `--face-forward` is the default and `--keep-turn` keeps a clip's own spins; `--source-facing` / `--target-facing` fix a wrong facing guess; `--window a,b`, `--loop` and `--fps` shape the bake.

Every clip is checked before writing: limb flips, retarget error against the source and a frozen T-pose fail the import (exit 1), so it never writes a silent T-pose. The output then runs `assets validate --skin` over the new clips. Skin defects the base rig already shows in its own clips, or that `aura.skin-allow.json` allows for the output or for the admitted `--onto` asset, are warnings unless the new clips make them materially worse (a new code, or more than 1.5x the stretched or flap triangles). `--strict` restores the plain rule: any skin error not allow-listed for the output fails. Check the result with `aura3d animation inspect-clips hero.anim.glb` (duration, channels and root motion per clip).

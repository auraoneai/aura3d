# Asset workflow: find, generate, admit, use

The one page for getting a 3D model, character or texture into an Aura3D scene as a typed `assets.<key>`. Every command below was checked against `packages/aura3d-cli/src`. Read `llms.txt` and `docs/agents/claims-and-boundaries.md` first.

`aura3d` followed by a subcommand below means `npx @aura3d/cli@latest` plus that subcommand (or the installed `aura3d` binary).

## 1. Resolve a need (one command decides)

```bash
aura3d assets resolve "street lamp" --role prop --dry-run        # show the decision, change nothing
aura3d assets resolve "street lamp" --role prop                  # admit it as assets.streetLamp
aura3d assets resolve "battle-worn knight" --role character      # character budget; a named subject with no open match needs a real model (sections 3 and 4)
aura3d assets resolve "garden fence"                            # no asset found: prints a primitives recipe
```

`resolve` works at build time and tries three rungs in order, stopping at the first that fits:

| Rung | What it does | Cost |
| --- | --- | --- |
| 1 Project | An asset already admitted in `aura.assets.json` whose id or source mentions the need's main noun. Use it as `model(assets.<id>)`. | free |
| 2 Open sources | A directly downloadable, licence-clear match from the curated library, the starter pack, Khronos samples, Poly Haven, ambientCG and the jsDelivr CC0 mirror. The title must contain the main noun ("wooden bridge" never resolves to a carved elephant); models must fit the role triangle budget; the report shows triangles and size. Admission records sha256, provenance and licence, then typegen. | free |
| 3 Procedural | Prints a paste-ready snippet built from `primitives` and `group` for common props (crate, barrel, table, chair, tree, rock, fence, lamp, building, car placeholder). | free |

Read the decision report: the chosen rung, why, and what was skipped. `--role hero|prop|background|character|texture|hdri` sets the budget and the kind of file; `--json` prints the report.

`resolve` is the build-time asset finder three.js does not have: it checks your project, then open licence-clear sources, then a procedural recipe, and admits the pick so production scenes load only admitted files (`model(assets.x)`, sha256 checked). Nothing is fetched from a hosted catalog at runtime.

Procedural recipes are for simple props, set dressing and placeholders. A named, recognisable subject (a character, a specific vehicle, a creature, a landmark) needs a real model: rung 2, a GLB you admit with `assets add` (section 3), or `assets generate` (section 4).

## 2. Manual search (when you want to choose yourself)

```bash
aura3d assets search "battle-worn knight helmet" --json
aura3d assets resolve "battle-worn knight helmet" --name helmet --candidate-id <id-from-search>
aura3d assets search "animated humanoid fighting character" --profile fighting-character --json
```

Search covers the same open sources as rung 2. Narrow with `--license cc0|cc-by`, `--max-tris N`, `--animated`; pick a specific hit with `--index N` or `--candidate-id ID`. Only auto-pullable rows may be pulled; marketplace deep-links are for the user to download, then admit with `assets add`. Add `texture`, `material`, `hdri` or `environment` to search surface maps instead of meshes. CC-BY assets need an attribution record in the shipped game; never use non-commercial (NC) licences.

## 3. Admit a file you already have

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot --type model --role character \
  --quality candidate --license CC0-1.0 --license-url <url> --source-page <url> \
  --author "<name>" --retrieved-at <ISO-8601>
npx @aura3d/cli@latest assets inspect public/aura-assets/<file>.glb --animation --humanoid --skeleton --morphs --license
npx @aura3d/cli@latest assets typegen
npx @aura3d/cli@latest assets validate --asset robot --source --no-placeholders --require-license
```

`add` writes `aura.assets.json`, a hashed file under `public/aura-assets/`, a thumbnail and `src/aura-assets.ts`. Read `src/aura-assets.ts` before writing scene code and reuse an existing key. `--type texture|environment|audio|navigation` admits non-model files. Roles: `character`, `vehicle`, `world`, `environment`, `track`, `product`, `weapon`, `prop`, `set-dressing`, `debug`, `abstract`.

Reject a candidate when: license, source or author is missing or temp-path only; a character claims animation but `skins === 0` or has no usable clips; bounds are extreme or orientation is unknown; the hash duplicates another asset unexplained; it is a raw, unoptimised export (section 5).

Other formats (FBX, OBJ, DAE, USD/USDA/USDZ, PLY, STL, 3MF, VOX, BVH) convert first, then admit the GLB (5.6.0; partial parity, every importer loss is printed as a diagnostic):

```bash
aura3d assets convert ./assets/robot.fbx --out ./assets/robot.glb --embed-textures   # --unit-scale 0.01 for centimetres, --up z for Z-up OBJ/PLY/STL/BVH
aura3d assets normalize ./assets/robot.glb --out ./assets/robot.n.glb --front +x --height 1.8   # face +Z, scale, ground at y = 0
aura3d assets preview ./assets/robot.n.glb --out robot-views.png                     # CPU base-colour preview, not a render
```

`add` makes a real PNG thumbnail for glTF/GLB models and PNG/JPEG/WebP textures (`assets thumbnail` reruns it); like `preview` it is a CPU base-colour view in the bind pose, never GPU evidence. `aura3d assets slim <file.glb>` re-encodes PNG normal maps as JPEG q92 and never writes a larger file; normal maps on glossy materials (median roughness under 0.45, or metallic) stay PNG unless `--allow-glossy` (lessons A12). `aura3d assets inspect <file.glb> --pbr` prints per-material metalness, roughness and normal-tilt percentiles with `PBR_*` warnings, and `aura3d assets validate --pbr` runs those warnings over the manifest (A11).


## 4. Generate on fal.ai: Idol models and HY-Motion clips (5.6.0, the default paid lane)

The 30 live games' lifelike models and motion come from this lane.

```bash
aura3d assets generate "weathered wooden rowing boat" --name rowboat --kind vehicle --size length=4 --dry-run   # prints the cost, submits nothing
aura3d assets generate "weathered wooden rowing boat" --name rowboat --kind vehicle --size length=4            # paid: admitted as quality "candidate"
aura3d assets generate "lean courier in a rain shell" --name courier --kind character --rig --size height=1.8
aura3d assets generate --spec idol-spec.json --game <slug>                   # batch; --renormalize redoes post-processing at no fal cost
aura3d animation generate "jogging loop, upright torso" --onto courier.glb --out courier-anim.glb --name Run --duration 2 --loop --dry-run
aura3d animation import ./mocap/jab.bvh --onto courier.glb --out courier-anim.glb --name Jab --strict   # BVH/FBX/glTF clips or HY-Motion motion.json
aura3d assets validate --skin courier-anim.glb
```

- `assets generate` sends a prompt (or `--image ref.png`) to `speridlabs/idol/max`; without an image it first makes a reference still with `openai/gpt-image-2.6`. The result is skin-refit (rigs), optimised to the role budget, normalised (+Z front, size target, grounded), slimmed (glossy materials keep PNG normals; `--no-slim` skips it) and previewed, then admitted with the fal licence (`--no-admit` skips admission).
- `animation generate` is text-to-motion on `fal-ai/hunyuan-motion` (0.5 to 12 s clips), retargeted onto `--onto` by the `animation import` engine. Import checks every clip for limb flips, retarget error and frozen T-poses, then runs `assets validate --skin --clips`; `--strict` fails on any skin error not allow-listed in `aura.skin-allow.json`.
- Key: `FAL_KEY`, then `--key-file`, then `~/.config/aura3d/fal.env`, then `~/.config/auraone/fal.env`. It is never printed. Every submit is appended to `.aura3d/fal/ledger.jsonl` (`--work` moves it) and a pending file is written before polling, so a rerun resumes or reuses the result instead of paying twice.
- Prompts describe a generic subject in your own words: no brand, product, character or title names, and no reference image taken from another game.
- Generated vehicles bake their wheels into the body: generate the body without wheels and add separate wheel nodes that spin about their measured hub (lessons M20). Rotors, sails and props that move are separate nodes too.
- Read the `assets preview` sheet, then judge real-GPU frames of the model moving in the game before calling it done (lessons V10).

## 5. Optimise heavy GLBs, admit in isolation

Raw exports from DCC tools, scans and generators often have 200,000 to 1,750,000 vertices and 20 to 65 MB of 4K textures. `assets generate` already optimises its output; optimise every other heavy GLB before admission:

```bash
aura3d assets optimize --file artifacts/<key>/model.glb --out artifacts/<key>/model.opt.glb --role prop
```

| Role | Vertex budget | Texture px |
| --- | --- | --- |
| `prop` (default) | 6,000 | 1,024 |
| `background` | 15,000 | 1,024 |
| `character` | 30,000 | 2,048 |
| `hero`, `vehicle` | 40,000 | 2,048 |

Overrides: `--max-verts N`, `--tex N`, `--no-simplify`, `--meshopt` (static background props only; quantisation breaks bounds and grounding checks). Skinned models: reduce to about 10,000 triangles before rigging and never simplify after rigging (`--no-simplify`). Keep the raw download and loose textures out of the committed tree.

In the Aura3D monorepo, admit **isolated**: a plain `assets add`, `validate` or `typegen` from the repo root rewrites `aura.assets.json`, `src/aura-assets.ts` (a 100k-line diff) and `public/aura-assets/*`, and races with other agents. Admit into the game's own manifest instead, then run `assets validate --asset <key> --require-license`. Read the `blockers` and `unproven` lists; `routeReady: false` is a result to report, and a blocked asset must not be hidden in a route.

Record the licence basis and the date for every admitted file. Do not claim CC0 or exclusivity unless the source states it.

## 6. Characters: rig, clips, mapping

Default path (section 4): `assets generate --kind character --rig`, then `animation generate` or `animation import` for clips, then steps 1 and 2 below.

If a rig and its clips arrive as separate GLBs, merge them into one first: `aura3d assets merge-clips --base rigged.glb --out hero.glb run=run.glb idle=idle.glb` (copies by node name; a foreign skeleton fails with `different skeleton`). Optimise with `--role character --no-simplify`.

1. Inspect and map before any code names a clip:

```bash
aura3d assets inspect <glb> --animation --humanoid --skeleton --morphs
aura3d assets validate-animation --clips idle,walk,run --map idle=<clip>,walk=<clip>,run=<clip> --require idle,walk,run --require-rig
```

2. Prove the skin before any code uses the character: `aura3d assets validate --skin <glb>`. It poses the rig through every clip and fails on stretched triangles, thin flaps, bad weights and a mesh modelled in a different pose than its skeleton (the defect that tore the FC athletes' shorts). Fix with `assets repair-skin` (see docs/api/cli-asset-tools.md) or regenerate; a known defect that must ship goes in `aura.skin-allow.json` with a reason. `validate --release` and `check-deploy --release` run it for you.

`"ok": false` with `missingActions` means the rig cannot play that action: report it, do not rename clips in code. Drive the character with `AnimationController` or `cloneSkinned` (skill `aura3d-character-animation`).

## 7. Retexture

Keep the geometry, change the maps, then follow skill `aura3d-retexture` to prove the geometry is untouched (bounds plus position-accessor hash) before admitting the new file as its own asset.

## 8. Use it in a scene

Regenerated or admitted keys come from `src/aura-assets.ts`; use them as generated.

```ts
import { groundedRenderedAssetPlacement, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const place = groundedRenderedAssetPlacement(assets.robot, { targetMaxDimension: 1.8, floorY: 0 });
scene().add(model(assets.robot).position(...place.position).scale(place.scale));
```

`targetHeight` suits upright humanoids; `targetMaxDimension` suits vehicles, weapons and wide props (source units vary, so always size with one of them). Rigged characters (`skins > 0`) play clips through the controller.

Games and examples with no project manifest declare models with `defineModelAssets`:

```ts
import { defineModelAssets, primitives, scene } from "@aura3d/engine";

const models = defineModelAssets({
  crate: { url: new URL("./assets/crate.glb", import.meta.url).pathname, sha256: "<64 hex>", license: "<terms>" }
});
scene().add(models.node("crate", { targetHeight: 1.2 }, () => primitives.box()));
```

## 9. Production rules (the bridge draws nothing if you break them)

- Every model needs a same-origin URL or pathname and a 64-character `sha256`; the production bridge accepts only `createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"`. An http(s) URL, a missing hash or an unhashed duplicate under `apps/<route>/public/aura-assets/` makes the scene draw nothing (`drawCalls` 0).
- `?models=0` switches `defineModelAssets` to the procedural fallback; keep a fallback only if loading can fail, and log a diagnostic when it triggers.
- Budget per game: keep newly generated asset bytes small (about 10 MB) and the whole game's assets around 25 MB.
- Ship only the optimised GLB; working downloads under `artifacts/` and raw GLBs stay out of the commit.

## 10. Forbidden in public examples

Raw `.glb`/`.gltf` URL literals outside a typed asset definition, `model("string")`, `unsafeModelUrl(...)`, `GLTFLoader`, `three` imports, renderer-internal imports, CSS/DOM fake particles in routes claiming Aura3D particles, and primitive-only primary subjects. `tests/unit/agent-api/public-example-boundary.test.ts` enforces this; run it.

```bash
npx @aura3d/cli@latest assets validate --source     # source scan: typedAssetUsages, filesByAsset
npx @aura3d/cli@latest assets validate --release    # release-grade provenance
```

If a command is missing in your installed version, do not weaken the claim: scan by hand and label the route `prototype` or `blocked`. If the expected key is absent after typegen, fix the admission; never fall back to a made-up id, string URL or artifact path.

## 11. Prove it renders

Browser proof runs remotely (`tools/remote-acr/run.sh`, software WebGL2), never local Playwright. Check `diagnostics().drawCalls > 0`, zero console errors, and look at a frame under the route's look preset. Hand results to skill `aura3d-evidence-review`. Game-route rules (live gameplay on frame 1, node-handle mutation on restart) live in `docs/agents/game-example-standards.md`.

## 12. Licensing boundary

Aura3D indexes license-aware metadata and can pull verified direct assets; downstream license obligations remain. Keep attribution, source pages and license metadata attached to asset evidence.

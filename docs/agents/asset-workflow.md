# Asset workflow: find, generate, admit, use

The one page for getting a 3D model, character or texture into an Aura3D scene as a typed `assets.<key>`. Every command below was checked against `packages/aura3d-cli/src` and the installed `meshy` 0.2.0 help. Read `llms.txt` and `docs/agents/claims-and-boundaries.md` first.

`aura3d <cmd>` below means `npx @aura3d/cli@latest <cmd>` (or the installed `aura3d` binary). Pass the Meshy key only through the environment, never as `--api-key`.

## 1. Pick the path (stop at the first that works)

| Situation | Path |
| --- | --- |
| The user gave you a GLB/glTF | Section 3 (`assets add`) |
| The prompt names a real object | Section 2 (catalog search first) |
| Catalog has no clean candidate, or you need a bespoke or stylised model | Section 4 (Meshy from a text prompt) |
| Mesh is right, look is wrong | Section 6 (retexture) |
| Humanoid must move | Section 5 (rig and clips) |

Never model a named real-world subject (character, vehicle, weapon, creature, landmark) from `primitives.box|sphere|cylinder`. Primitives are for ground, lines, rings, beams and invisible colliders.

## 2. Catalog search

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet" --json
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
# fighters and acted humanoids:
npx @aura3d/cli@latest assets search "animated humanoid fighting character" --profile fighting-character --json
```

Narrow with `--license cc0|cc-by`, `--max-tris N`, `--animated`; pick a non-top hit with `--index N` or `--candidate-id ID` and repeat the same `--profile`. Only auto-pullable candidates may be pulled: marketplace deep-links and "manual license check required" rows are for the user to download, then admit with `assets add`. If search prints a catalog fetch warning, report it verbatim and mark asset-dependent work `blocked`.

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

Reject a candidate when: license, source or author is missing or temp-path only; a character claims animation but `skins === 0` or has no usable clips; bounds are extreme or orientation is unknown; the hash duplicates another asset unexplained; it is a raw Meshy export that has not been optimised (section 4).

## 4. Generate with Meshy (text prompts only)

Rules that never bend:
- **Text prompts only, in your own words**, describing a generic object. Never image-to-3D from screenshots or frames of another game or product, never name a third-party character, brand or title in a prompt.
- Credentials: `MESHY_API_KEY` (and for AuraOne agents `MESHY_BASE_URL_V1/V2` pointing at Kiro Prism) come from the runtime environment. Never print, log, commit or paste a key. Never run `meshy auth login`, `auth login --with-key`, or any rotation script, and never call `api.meshy.ai` directly from agent runs that are meant to go through Prism.
- Get an approved credit maximum before spending. No approved maximum: stop after the dry run and show the plan. Never split a job to stay under a cap.
- Every paid call is reserved in the ledger (below) so per-game and global caps hold.

### Costs (credits; the ledger uses these as estimates, `--est` overrides)

| Operation | Credits |
| --- | --- |
| text-to-3d preview | 20 |
| text-to-3d refine (PBR) | 10 |
| `make` (preview + refine) | 30 (measured pool delta) |
| remesh | 5 |
| rigging (includes walk and run) | 5 |
| animate (per action) | 3 |
| retexture | 10 |

### Plan, reserve, run

```bash
meshy make "a sleek low-poly hover scooter, matte teal paint, worn rubber grips, game prop" --dry-run
rid=$(aura3d meshy ledger reserve --game <slug> --op preview --cap <per-game cap> --global-cap <total cap>)
meshy text-to-3d create --mode preview --prompt "<prompt>" --async     # look at the preview before paying for refine
aura3d meshy ledger settle --rid "$rid" --exit-code 0 --task-id <id>
meshy text-to-3d create --mode refine --preview-task-id <id> --texture-resolution 2k --async
meshy text-to-3d get <id> -o artifacts/meshy/<key>/                     # download immediately; Meshy keeps assets about 3 days
aura3d meshy ledger status
```

`meshy make "<prompt>" --max-credits N -o <dir>` runs preview then refine in one call if you do not need to inspect the preview. Put the look in the prompt (palette, material mood, silhouette, poly style) so the PBR set fits the scene lighting. Use `--texture-resolution 2k`; the default 4k wastes memory and `8k` fails every admission profile except `environment`. Exit codes: 3 auth, 4 validation, 6 rate limit (wait 60 s, retry once, stagger parallel calls), 8 timeout (the task may still finish: `get` it, never recreate paid work), 9 credits exhausted (stop and report). A rate-limited or timed-out call keeps counting in the ledger until you `reconcile --rid <id> --status ok|failed`. Re-prompt a bad result once with a sharper prompt; prefer retexture when only the look is wrong.

### Optimise (mandatory), admit in isolation, validate

Raw Meshy exports often have 200,000 to 1,750,000 vertices and 20 to 65 MB of 4K textures. Optimise every GLB first:

```bash
aura3d assets optimize --file artifacts/meshy/<key>/model.glb --out artifacts/meshy/<key>/model.opt.glb --role prop
```

| Role | Vertex budget | Texture px |
| --- | --- | --- |
| `prop` (default) | 6,000 | 1,024 |
| `background` | 15,000 | 1,024 |
| `character` | 30,000 | 2,048 |
| `hero`, `vehicle` | 40,000 | 2,048 |

Overrides: `--max-verts N`, `--tex N`, `--no-simplify`, `--meshopt` (static background props only; quantisation breaks bounds and grounding checks). Skinned models: remesh to about 10,000 triangles before rigging and never simplify after rigging (`--no-simplify`). Keep the raw download and loose textures out of the committed tree.

Admission profile budgets (checked by `import-meshy`): `prop` 100,000 triangles, 8 textures; `vehicle` 1,000 to 250,000, 12 textures; `humanoid` 3,000 to 150,000, 12 textures; `environment` 500,000, 16 textures; texture size at most 4,096 px (8,192 for `environment`).

In the Aura3D monorepo, admit **isolated** (the default there): a plain `import-meshy`, `validate` or `typegen` from the repo root rewrites `aura.assets.json`, `src/aura-assets.ts` (a 100k-line diff) and `public/aura-assets/*`, and races with other agents.

```bash
aura3d assets import-meshy artifacts/meshy/<key>/ --into examples/<game>/assets --prefix <game> --name <role> \
  --rights-evidence artifacts/meshy/<key>/rights.json --profile prop|vehicle|humanoid|environment --role prop|vehicle|character
```

The typed key is `<prefix>_<name>`; the model lands in `models/<key>.glb` and evidence in `provenance/<key>.rights.json` and `.meta.json`. Validation runs inside a temporary project; on failure nothing is copied and the exit code is 1. `--overwrite` replaces a different model at the target; `--keep-temp` keeps the temp project. Outside the monorepo a plain `assets import-meshy <dir> --name <typedKey> --rights-evidence <rights.json> --profile ... --role ...` followed by `assets validate --asset <typedKey> --require-license` is correct. Read the `blockers` and `unproven` lists; `routeReady: false` is a result to report, and a blocked asset must not be hidden in a route.

`rights.json` records the basis for the output (the generating account's Meshy plan terms at generation time) and the date. Do not claim CC0 or exclusivity. Record per asset: prompt text, Meshy task ids (not signed URLs), credits spent, date, optimise settings, GLB size and triangles, plan name if known.

## 5. Characters: rig, clips, mapping

1. Preview with a pose: `meshy text-to-3d create --mode preview --pose-mode a-pose --prompt "<generic humanoid description>"` (or `t-pose`), refine at 2k.
2. Remesh to about 10,000 triangles: `meshy remesh create --input-task-id <refine id> --target-polycount 10000`.
3. Rig: `meshy rigging create --input-task-id <remesh id> --height-meters 1.8` (includes walk and run).
4. More actions: `meshy animate create --rig-task-id <rig id> --action-id <n>` (Meshy action library id, integer), one task per action.
5. Merge clips into one GLB: `aura3d assets merge-clips --base artifacts/meshy/hero-rig/ --out artifacts/meshy/hero/model.glb run=artifacts/meshy/hero-run/ idle=artifacts/meshy/hero-idle/` (copies by node name; a foreign skeleton fails with `different skeleton`).
6. Optimise with `--role character --no-simplify`, admit with `--profile humanoid --role character`.
7. Inspect and map before any code names a clip:

```bash
aura3d assets inspect <glb> --animation --humanoid --skeleton --morphs
aura3d assets validate-animation --clips idle,walk,run --map idle=<clip>,walk=<clip>,run=<clip> --require idle,walk,run --require-rig
```

`"ok": false` with `missingActions` means the rig cannot play that action: report it, do not rename clips in code. Drive the character with `AnimationController` or `cloneSkinned` (skill `aura3d-character-animation`).

## 6. Retexture

Keep the geometry, change the maps: `meshy retexture create ...` (10 credits, reserve it in the ledger), then follow skill `aura3d-retexture` to prove the geometry is untouched (bounds plus position-accessor hash) before admitting the new file as its own asset.

## 7. Use it in a scene

Regenerated or admitted keys come from `src/aura-assets.ts`; use them as generated.

```ts
import { groundedRenderedAssetPlacement, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const place = groundedRenderedAssetPlacement(assets.robot, { targetMaxDimension: 1.8, floorY: 0 });
scene().add(model(assets.robot).position(...place.position).scale(place.scale));
```

`targetHeight` suits upright humanoids; `targetMaxDimension` suits vehicles, weapons and wide props (Meshy units vary, so always size with one of them). Rigged characters (`skins > 0`) play clips through the controller.

Games and examples with no project manifest declare models with `defineModelAssets`:

```ts
import { defineModelAssets, primitives, scene } from "@aura3d/engine";

const models = defineModelAssets({
  crate: { url: new URL("./assets/crate.glb", import.meta.url).pathname, sha256: "<64 hex>", license: "<terms>" }
});
scene().add(models.node("crate", { targetHeight: 1.2 }, () => primitives.box()));
```

## 8. Production rules (the bridge draws nothing if you break them)

- Every model needs a same-origin URL or pathname and a 64-character `sha256`; the production bridge accepts only `createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"`. An http(s) URL, a missing hash or an unhashed duplicate under `apps/<route>/public/aura-assets/` makes the scene draw nothing (`drawCalls` 0).
- `?models=0` switches `defineModelAssets` to the procedural fallback; keep a fallback only if loading can fail, and log a diagnostic when it triggers.
- Budget per game: keep newly generated asset bytes small (about 10 MB) and the whole game's assets around 25 MB.
- Ship only the optimised GLB; `artifacts/meshy/**` and raw GLBs stay out of the commit.

## 9. Forbidden in public examples

Raw `.glb`/`.gltf` URL literals outside a typed asset definition, `model("string")`, `unsafeModelUrl(...)`, `GLTFLoader`, `three` imports, renderer-internal imports, CSS/DOM fake particles in routes claiming Aura3D particles, and primitive-only primary subjects. `tests/unit/agent-api/public-example-boundary.test.ts` enforces this; run it.

```bash
npx @aura3d/cli@latest assets validate --source     # source scan: typedAssetUsages, filesByAsset
npx @aura3d/cli@latest assets validate --release    # release-grade provenance
```

If a command is missing in your installed version, do not weaken the claim: scan by hand and label the route `prototype` or `blocked`. If the expected key is absent after typegen, fix the admission; never fall back to a made-up id, string URL or artifact path.

## 10. Prove it renders

Browser proof runs remotely (`tools/remote-acr/run.sh`, software WebGL2), never local Playwright. Check `diagnostics().drawCalls > 0`, zero console errors, and look at a frame under the route's look preset. Hand results to skill `aura3d-evidence-review`. Game-route rules (live gameplay on frame 1, node-handle mutation on restart) live in `docs/agents/game-example-standards.md`.

## 11. Licensing boundary

Aura3D indexes license-aware metadata and can pull verified direct assets; downstream license obligations remain. Keep attribution, source pages and license metadata attached to asset evidence.

# GU47 lane ea: WP-1 (E-A) look overrides, HDRI catalogue, HDRI delivery

- Branch: `gu47/ea` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/ea`)
- Base commit: `f797808be`
- Wave: 1 (phase 1, code). Nothing was run in a browser, remotely or on a GPU.
- Scope: PRD contract lines 129-156, WP lines 382-388, PRD §4.1 E-A row, EXECUTION.md "HDRI catalogue convention".

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| E-A.1 override keys + clamps | M | done | `caeb8afec`, `b7775d788`, `e0ba9d54b` | `AuraLookOverrides` gains `hdri`, `environmentIntensity`, `environmentRotationDeg`, `key`, `rim`, `fog`, `grade`, `post` (PRD §3.1 E-A shapes); clamps in `clampLookOverrides`, emission in `applyOverrides` / `v0Children`. Predecessor's uncommitted contract + clamp work reviewed and kept (first commit). Default emission with only the C-34 keys is byte-identical to the base for all 15 looks x 7 override cases (JSON snapshot compared before item 3). |
| E-A.2 HDRI catalogue | M | done (size line partial) | `a3a6d23e5` | 14 new ids in `HDRI_ASSET` / `AuraHdriId` (17 total); `public/hdri/<id>_1k.hdr` x14 with rows in `public/hdri/ATTRIBUTION.md` and `assets/art-direction/hdri-environments.json` (`catalogue`). 8 of 14 are <= 1.5 MiB; 6 are 1.63-1.83 MB (see "HDRI sizes"). LFS lines for the 13 new files only. |
| E-A.3 default emission | M | done | `9001eb1f8` (own commit), `76912221d` | Preset `grade.temperature` (and `tint` when declared) on the look grade node; preset `post` as an `output.preset` child; colour `background` override -> look HDRI `background: false`. Pixel-neutral until E-C reads temperature / the child, except the HDRI-background fix. |
| E-A.4 `assets optimize --hdri` | M | done | `7f3d450f2` | `--file in.hdr --out out.hdr --hdri 1k|2k [--rgb9e5-cube] [--json]`; unit-tested on synthetic files. `cli-help.ts` line handed to E-C. |
| E-A.5 unit tests | M | done | `cd5c1a1fd` | `tests/unit/looks/look-overrides-47.test.ts` (22 tests) and `tests/unit/gu47/ea/optimize-hdri.test.ts` (8 tests). |
| E-A.6 FC acceptance receipt | M | phase 2 | `b66386681` | `tests/browser/gu47/look-background-override.spec.ts` (+ harness, html) written, not run. |
| E-A.7 lookNodeHandler | C | not done (not needed) | - | The v1 look node lowers through `looks.preset(..., { expansion: "v0" })`, so it inherits every new key; no handler change. |

## Decisions (resolved without questions)

1. **`output.preset` child shape.** No scene-node kind carries `output` today (it is only `createAuraApp({ output })`). The child is an empty group `{ kind: "group", name: "look output preset", children: [], output: { preset }, lookOutput: true }`: flatten drops empty groups, so no compile path draws, validates or reports it (an unknown effect kind would reach the effect lowering and lint). `lookOutputPreset(nodes)` finds it in v0 groups at any depth and in v1 `look` nodes; E-C applies it (handoff).
2. **Fields the builders do not copy** (`temperature`, `tint`, `lut` on the grade; `knee`, `clampLuminance` on bloom; C-21 fog fields) are spread onto the emitted node and appended to `postAuthored`, so the v2 bridge reads them and `validatePostEffectNode` stays clean (all are allowlisted).
3. **Fog override.** `near`/`far` replace the look range and ride on the node only when set (the C-21 linear mode reads them; exp2 keeps `density = 24/far`); `fogDensityScale` still scales on top and 0 still removes the fog. On a look without fog it adds one (colour = the look background, near 0, far 200 = the engine fog's 0.12 density). `height` spreads `AuraHeightFogSpec` onto the node with `mode: "height"` (`height.density` wins over the derived density; top-level `color` wins over `height.color`).
4. **Rim override.** On a look with a rim: retune (a new azimuth keeps the rim elevation). On a look without one: add at elevation 35 deg, azimuth key + 180 deg unless set, intensity 1.4 (the character-showcase rim), colour `rim.color ?? accent ?? palette.accent`.
5. **`hdri` on a no-HDRI look** replaces the procedural fill; its intensity defaults to 1 (those looks declare `environmentIntensity: 0`). `environmentIntensity` alone on a no-HDRI look scales the fill.
6. **Unknown ids throw** (`LOOK_HDRI_UNKNOWN:<id>`, `LOOK_POST_UNKNOWN:<id>`), like `LOOK_UNKNOWN`. Non-finite GU47 numbers are dropped (the preset value stays).
7. **Colour background rule** triggers on the look override only (`background: "#..."`), as the PRD states. aura-fc-3d sets `scene().background(...)` and passes no look `background`, so G09 must add it (handoff).
8. **`outdoor-midday` is Poly Haven `kloppenheim_06_puresky`** (library `outdoor-midday-2k` sha256 `99451201...` = the corpus kloppenheim_06_puresky 2k). Its 1k is a byte copy of the existing `kloppenheim_06_puresky_1k.hdr` (a regular blob, so git stores it once), not a re-encode. Two games choosing these two ids get the same sky (WP-38 handoff).
9. **HDRI encoder.** Area-average (box) downsample in linear float (keeps the mean radiance IBL integrates; 8x8 for the 8k starfield), re-encoded as per-scanline RLE RGBE with the engine decoder's `m * 2^(e-128) / 255` convention, so the engine reads back the averaged values. No upsampling (a smaller source is re-encoded at its size). The `--rgb9e5-cube` output is a radiance cube (face = width / 8, so 128 for 1k and 256 (~2.1 MB) for 2k; box mip chain to 1x1) in the minimal KTX2 container `readRgb9e5Cube` reads; it is not GGX-prefiltered (`aura3d environments bake --hdr` makes the probe).
10. **Sources.** The 11 corpus 2k/8k files are not in the worktree (removed in `54906fbac`); their LFS objects are in the shared store and were materialised read-only with `git show 875249df7:fixtures/environment-corpus/hdri/<file> | git lfs smudge > /tmp/gu47-ea/src/<file>`; every sha256 matched `fixtures/environment-corpus/manifest.json`. Nothing under `fixtures/` was staged.
11. **LFS.** The 13 new re-encoded files are LFS-tracked by explicit path lines in `.gitattributes`; the older `public/hdri` files and `outdoor-midday_1k.hdr` stay regular blobs (no LFS mismatch).

## HDRI sizes (acceptance "each 1k HDRI <= 1.5 MB")

The 6 noisy sources exceed 1.5 MiB as lossless 1024x512 RGBE RLE: three incompressible mantissa bytes per texel are 1.5 MiB on their own. Poly Haven's own 1k downloads have the same sizes (checked with `curl -I`: rooftop_night 1,624,479; cobblestone_street_night 1,760,191; hangar_interior 1,755,683; kloppenheim_02 1,740,414; spruit_sunrise 1,500,948; warm_bar 1,487,340), so this is the format's floor, not the encoder. I did not ship a lossy re-quantisation: an experiment with an absolute floor quantiser (step = mean luminance / 256, about 0.85 of an sRGB code in the darkest visible tones) only brought the starfield and cobblestone under 1.5e6; hangar needed mean/64 (about 3 codes, visible banding risk). "MB" is read as MiB (1,572,864) in the test; the 6 exceptions are pinned at their current size.

| id | bytes | <= 1.5e6 | <= 1.5 MiB |
|---|---|---|---|
| belfast_sunset_puresky | 1,215,904 | yes | yes |
| industrial_sunset_puresky | 1,180,675 | yes | yes |
| spruit_sunrise | 1,527,279 | no | yes |
| venice_sunset | 1,437,625 | yes | yes |
| rooftop_night | 1,629,654 | no | no |
| cobblestone_street_night | 1,766,411 | no | no |
| hangar_interior | 1,761,250 | no | no |
| warm_bar | 1,504,042 | no | yes |
| museum_of_history | 1,450,462 | yes | yes |
| kloppenheim_02 | 1,744,238 | no | no |
| deep_space_starfield (8k source) | 1,831,733 | no | no |
| outdoor-midday (byte copy) | 1,173,154 | yes | yes |
| sunset-dramatic | 1,541,600 | no | yes |
| indoor-workshop | 1,638,244 | no | no |

Production command (one per file; the outdoor-midday row is `cp public/hdri/kloppenheim_06_puresky_1k.hdr public/hdri/outdoor-midday_1k.hdr`):

```bash
cli() { node_modules/.bin/tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts "$@"; }
SRC=/tmp/gu47-ea/src   # corpus LFS objects, see decision 10
for pair in belfast_sunset_puresky:$SRC/belfast_sunset_puresky_2k.hdr industrial_sunset_puresky:$SRC/industrial_sunset_puresky_2k.hdr \
  spruit_sunrise:$SRC/spruit_sunrise_2k.hdr venice_sunset:$SRC/venice_sunset_2k.hdr rooftop_night:$SRC/rooftop_night_2k.hdr \
  cobblestone_street_night:$SRC/cobblestone_street_night_2k.hdr hangar_interior:$SRC/hangar_interior_2k.hdr warm_bar:$SRC/warm_bar_2k.hdr \
  museum_of_history:$SRC/museum_of_history_2k.hdr kloppenheim_02:$SRC/kloppenheim_02_2k.hdr deep_space_starfield:$SRC/deep_space_starfield_8k.hdr \
  sunset-dramatic:assets/library/hdri/sunset-dramatic-2k.hdr indoor-workshop:assets/library/hdri/indoor-workshop-2k.hdr; do
  cli assets optimize --file "${pair#*:}" --out "public/hdri/${pair%%:*}_1k.hdr" --hdri 1k
done
```

A game that needs a 2k copy asks for `public/hdri/<id>_2k.hdr` (`--hdri 2k`, optionally `--rgb9e5-cube`).

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|
| E-C | `packages/aura3d-cli/src/cli-help.ts` (assets optimize line) | add `aura3d assets optimize --file in.hdr --out out_1k.hdr --hdri 1k\|2k [--rgb9e5-cube] [--json]` | E-A's new verb mode; EXECUTION assigns cli-help.ts to E-C. The same form belongs in the `assets optimize` `usage` string at `packages/aura3d-cli/src/commands/prd05/index.ts:124` (no GU47 owner; E-C or integration). |
| E-C | `packages/engine/src/agent-api/postBridge.ts:createRootPostPipeline` (and the `compiler/postprocess.ts:306` caller, E-G) | when the authored `output?.preset` is undefined, use `lookOutputPreset(snapshot.nodes)` (`agent-api/looks/looks.ts`) as the preset passed to `expandPostPreset` | so the look's declared post preset (the new `output.preset` child) reaches pixels; the look's own grade/bloom nodes then win field by field over the preset's. |
| E-C | `packages/engine/src/agent-api/nodes/effects.post.ts:colorGrade`, `:bloom` | copy `temperature`, `tint`, `lutIntensity` (grade) and `knee`, `clampLuminance` (bloom) onto the node | today `looks.ts` spreads them onto the emitted node itself (`withAuthoredFields`); harmless once the builders copy them. |
| E-C | `packages/engine/src/contracts/post.ts` (`AuraBloomOptions`), `AuraAssetType` `"lut"` | when these land, E-A swaps the `// GU47(E-C)` stand-ins in `contracts/looks.ts` (local `AuraBloomOptions`; `grade.lut: AuraAssetRef` -> `AuraAssetRef<"lut">`) in wave 2 | PRD types `grade.lut` as `AuraAssetRef<"lut">`; the type does not exist on the base. |
| E-B | `packages/engine/src/agent-api/compiler/environment.ts` | make the hdri node's `rotation` (radians, emitted for `environmentRotationDeg`) rotate probe sampling and the background | the override emits the node field; PRD E-B owns applying rotation to probe sampling. |
| E-G | `packages/engine/src/public/index.ts` (and the `src/lanes/prd13.ts` barrel) | export type `AuraHdriId`; export `lookHdriIds`, `lookHdriUrl`, `lookOutputPreset` | games can then name the catalogue type and list ids; today they are reachable from `agent-api/looks/looks.ts` only (a literal `hdri: "venice_sunset"` already type-checks through `AuraLookOverrides`). |
| G09 | `apps/showcase-aura-fc-3d/src/game/scene.ts:449` | pass `background: vl.background` in the `looks.preset(vl.look, { ... })` overrides | the HDRI-as-sky fix triggers on the look `background` override; the scene `.background()` alone keeps the studio HDRI drawn. |
| E-I | `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md` | document the look override keys (`hdri: "<id>"`, `environmentIntensity`, `environmentRotationDeg`, `key`, `rim`, `fog`, `grade`, `post`) and the 17-id catalogue at `/hdri/<id>_1k.hdr` | agent-facing API; E-I owns that skill doc (then `pnpm check:skills`). |
| WP-38 | distinctness (PRD §6.1) | `outdoor-midday` and `kloppenheim_06_puresky` are the same sky | two games picking those ids are not distinct. |
| WP-38 / owner | HDRI page weight | 6 catalogue files are 1.63-1.83 MB (table above) | decide: accept (same as Poly Haven 1k), a lossy floor quantiser, or 2k RGB9E5 cubes. |

## CHANGELOG text for WP-38

- Looks: `looks.preset(id, overrides)` takes `hdri` (an `AuraHdriId` from the 17-HDRI catalogue, or a typed `.hdr` texture), `environmentIntensity` (0-4), `environmentRotationDeg`, `key { color, intensity, shadow }`, `rim false | { color, intensity, azimuthDeg }`, `fog { color, near, far, height }`, `grade { contrast, saturation, temperature, tint, lut }` and `post` (a post preset id, or `{ bloom: false | options }`). Every look now carries its declared white balance and post preset, and a colour `background` override keeps the look HDRI for lighting without drawing it as the sky.
- HDRIs: 14 more CC0 environments ship as 1k files at `/hdri/<id>_1k.hdr` (sunsets, night streets, interiors, a procedural deep-space starfield), with licence rows in `public/hdri/ATTRIBUTION.md`.
- CLI: `aura3d assets optimize --file in.hdr --out out_1k.hdr --hdri 1k|2k [--rgb9e5-cube]` writes an area-averaged Radiance HDR and, optionally, a KTX2 RGB9E5 cube.
- Visual numbers for these changes are software WebGL2 captures.

## Phase-2 plan

1. FC acceptance: run `tests/browser/gu47/look-background-override.spec.ts` through `tools/remote-acr/run.sh`. It renders `interior-industrial` + scene background `#0d1a24` with the aura-fc-3d venue overrides, `before` (no look `background`) and `after` (`background: "#0d1a24"`), writes `artifacts/gu47-ea/fc-munich-{before,after}.jpg` and prints `GU47_EA_BACKGROUND {backgroundLuma, before, after}`. Pass: `|after.topRowLuma - 24| <= 10` (top 1/8 of the frame; `topRowLuma4` = top 1/4 for the 4-row grid). Expect `before` to show the studio HDRI (much brighter top row).
2. Catalogue look check: one steady-state frame per new id through `looks.preset("product-studio", { hdri: id })` on the exposure-looks harness scene: mean luma, darkFrac/clipFrac, and the background crop. `deep_space_starfield_1k` is an 8x8 area average of the 8k, so single-pixel stars dim by up to 64x: if the stars vanish, regenerate natively at 1k (`tools/asset-optimize/gen-starfield.py --res 1024`) or ship a 2k copy.
3. White balance (after E-C's grade writer): golden-hour (temperature 0.25) vs overcast (-0.05) vs polar-night (-0.2) R/B ratio shift in the same scene.
4. Output preset (after E-C applies `lookOutputPreset`): `diagnostics().post` stagesRan includes the preset's stages for golden-hour (`cinematic-film`) and night-city (`neon-night`); no change for scenes that author `output.preset`.
5. `environmentRotationDeg` (after E-B): 0 vs 90 deg frames of `outdoor-day` move the sun highlight in the background.

## API as shipped

`packages/engine/src/contracts/looks.ts`

```ts
export type AuraHdriId = "autumn_field_puresky" | "kloppenheim_06_puresky" | "studio_small_08"
  | "belfast_sunset_puresky" | "industrial_sunset_puresky" | "spruit_sunrise" | "venice_sunset"
  | "rooftop_night" | "cobblestone_street_night" | "hangar_interior" | "warm_bar" | "museum_of_history"
  | "kloppenheim_02" | "deep_space_starfield" | "outdoor-midday" | "sunset-dramatic" | "indoor-workshop";
export interface AuraLookOverrides {
  readonly sun?: { readonly azimuthDeg?: number; readonly elevationDeg?: number };
  readonly exposureEv?: number;            // [-2,2]
  readonly fogDensityScale?: number;       // [0,3]
  readonly accent?: AuraColor;
  readonly background?: "look" | AuraColor;
  readonly hdri?: AuraHdriId | AuraAssetRef<"texture">;
  readonly environmentIntensity?: number;  // [0,4]
  readonly environmentRotationDeg?: number; // wraps into [0,360)
  readonly key?: { readonly color?: AuraColor; readonly intensity?: number /* [0,20] */; readonly shadow?: AuraDirectionalShadowOptions };
  readonly rim?: false | { readonly color?: AuraColor; readonly intensity?: number /* [0,20] */; readonly azimuthDeg?: number /* wraps */ };
  readonly fog?: { readonly color?: AuraColor; readonly near?: number; readonly far?: number /* [0,100000] */; readonly height?: AuraHeightFogSpec };
  readonly grade?: { readonly contrast?: number; readonly saturation?: number /* [0,3] */; readonly temperature?: number; readonly tint?: number /* [-1,1] */; readonly lut?: AuraAssetRef /* GU47(E-C): AuraAssetRef<"lut"> */ };
  readonly post?: AuraPostPresetId | { readonly bloom?: false | AuraBloomOptions };
}
// AuraBloomOptions (module-local stand-in until E-C's lands, GU47(E-C)):
//   { intensity?: number /* [0,4] */; threshold?: number /* [0,64] */; knee?: number /* [0,1] */; scatter?: number /* [0,1] */; color?: AuraColor; clampLuminance?: number /* [0,64] */ }
```

`packages/engine/src/agent-api/looks/looks.ts`

```ts
export const lookHdriIds: readonly AuraHdriId[];                       // the 17 ids, catalogue order
export function lookHdriUrl(id: AuraHdriId): string;                   // `/hdri/${id}_1k.hdr`
export function lookOutputPreset(nodes: readonly AuraSceneNode[]): AuraPostPresetId | undefined;
export type { AuraHdriId } from "../../contracts/looks.js";
export function clampLookOverrides(overrides: AuraLookOverrides | undefined): AuraLookOverrides | undefined; // now also throws LOOK_HDRI_UNKNOWN:<id> / LOOK_POST_UNKNOWN:<id>
```

Emitted v0 children (`looks.preset`, `looks.nodes`, `expandLookChildren`):

- HDRI node: `name: "look hdri <id>_1k"` (catalogue id) or `"look hdri <ref.id>"`; `rotation` (radians) when `environmentRotationDeg` is set; `background: false` when `background` is a colour.
- Key light: `color`, `intensity`, `shadow: true | AuraDirectionalShadowOptions`.
- Rim light (`"look rim light"`): dropped, retuned or added (decision 4).
- Fog node (`"look fog"`): `color`, `density = height?.density ?? 24/far`, `near`/`far` when overridden, `mode: "height"` plus the `AuraHeightFogSpec` fields when `height` is set.
- Grade node (`"look color grade"`, `lookGrade: true`): `contrast`, `saturation`, `exposure`, `temperature` (always, from the preset or the override), `tint` and `lut` when defined; each in `postAuthored`.
- Bloom node (`"look bloom"`): absent for `post: { bloom: false }`; `intensity`, `threshold`, `scatter`, `color`, `knee`, `clampLuminance` from `post.bloom`.
- `output.preset` child: `{ kind: "group", name: "look output preset", children: [], output: { preset: AuraPostPresetId }, lookOutput: true }`, from `post` (id) or the preset's `post`.

`packages/engine/src/agent-api/looks/lookPresets.ts`: `AuraLookV0Expansion.grade` gains `readonly tint?: number`.

`packages/aura3d-cli/src/commands/assets/optimize.ts`

```ts
export type HdriSize = "1k" | "2k";
export const HDRI_SIZE_WIDTH: Readonly<Record<HdriSize, number>>;     // { "1k": 1024, "2k": 2048 }
export function isHdriSize(value: string): value is HdriSize;
export interface OptimizeHdriOptions { readonly input: string; readonly output: string; readonly projectDir?: string; readonly size: HdriSize; readonly width?: number; readonly rgb9e5Cube?: boolean }
export interface OptimizeHdriResult { readonly input: string; readonly output: string; readonly size: HdriSize; readonly bytesIn: number; readonly bytesOut: number; readonly widthIn: number; readonly heightIn: number; readonly width: number; readonly height: number; readonly resized: boolean; readonly cube?: { readonly output: string; readonly faceSize: number; readonly mipCount: number; readonly bytes: number } }
export function downsampleHdrImage(image: HdrImage, width: number, height: number): HdrImage;
export function encodeRadianceHdr(image: HdrImage, comments?: readonly string[]): Uint8Array;
export function encodeRgb9e5CubeKtx2(lanes: Pick<RenderingLanes, "equirectToCubeFaces" | "packRgb9e5" | "KTX2_MAGIC" | "VK_FORMAT_E5B9G9R9_UFLOAT_PACK32">, image: HdrImage, faceSize: number): { readonly bytes: Uint8Array; readonly mipCount: number };
export function hdriCubePath(output: string): string;                 // out_1k.hdr -> out_1k.rgb9e5.ktx2
export function optimizeHdriFile(options: OptimizeHdriOptions): Promise<OptimizeHdriResult>;
export function optimizeHdriUsage(): string;
```

CLI: `aura3d assets optimize --file in.hdr --out out_1k.hdr --hdri 1k|2k [--rgb9e5-cube] [--json]` (exit 2 on a bad `--hdri` value or `--rgb9e5-cube` without `--hdri`).

## Verification

- Typecheck delta (`bin/typecheck-delta.mjs`): first run after items 1-5 reported `NEW_ERRORS 5` (3 in `looks.ts`, 2 in the new test), fixed in `e0ba9d54b`; the run after the fix: 58 errors (baseline 58), `NEW_ERRORS 0`. Final run after `76912221d`: see the last line of this section.
- Base run before the first edit (tree = base + the predecessor's uncommitted clamps): `looks.test.ts`, `look-presets-environment.test.ts`, `look-fill-game-composition.test.ts`, `agent-api/look-lint.test.ts`, `contracts/impl/prd13-looks.test.ts` passed (69 tests); `aura3d-cli/assets-tooling/optimize-and-merge.test.ts` and `cli/look-lint.test.ts` did not run (vitest-worker RPC timeout `fetch /@vite/env` after 569 s under machine load, an infrastructure error, not a test failure).
- Branch run (`vitest run <15 files> --maxWorkers=2`): 15 files, 197 tests, all pass: the 7 above plus `aura3d-cli/assets-tooling/import-meshy-isolated.test.ts`, `agent-api/e2-wave3-post-handoffs.test.ts`, `agent-api/e1-wave2-remove-mounted-look-app.test.ts`, `agent-api/prompt-plan-v2.test.ts`, `pips-big-leap/shell.test.ts`, `aura-fc-3d/audit-fixes.test.ts` (look consumers) and the new `looks/look-overrides-47.test.ts` (22) and `gu47/ea/optimize-hdri.test.ts` (8). No test that passes on the base fails on the branch.
- Emission identity: a JSON snapshot of `expandLookChildren` for all 15 looks x 7 C-34 override cases was byte-identical to the base after item 1; item 3 changes every case only by the grade `temperature` (+ `postAuthored`) and the `output.preset` child (and the HDRI `background: false` for colour-background overrides), checked again after the type fixes.
- ESLint: clean on every touched file (`looks.ts`, `contracts/looks.ts`, `lookPresets.ts`, `optimize.ts`, `optimizeVerb.ts`, both new unit tests, the browser spec and harness).
- Not run (phase 1 rules): browsers, Playwright, `tools/remote-acr/run.sh`, `pnpm check:bundle-size` (needs a build; `looks.ts` grows by about 430 net lines, `contracts/looks.ts` is types only, the CLI change is CLI-only), `pnpm check:skills` (no skill doc edited).
- Final typecheck delta at `76912221d`: `project tsconfig.check.json: 58 errors (baseline 58, 0 baseline errors gone)`, `NEW_ERRORS 0`.

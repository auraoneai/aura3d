# Lane ei (E-I, WP-9): proof tooling and checks

Branch `gu47/ei`, base `f797808be` (gu47/integration), wave 1 (phase 1, code). Status: phase 1 complete (all 10 scope rows done; pixel, judge and real-GPU acceptance are phase 2).

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EI-1 GL_META v2, crops, GL_PAIR_MS | M | done (pixels: phase 2) | 6219836d6 | v1 fields and order kept (decode-luma/compare-luma unit-tested); page stats in `tests/browser/game-luma-stats.ts`; `tests/unit/gu47/ei/game-luma-stats.test.ts` |
| EI-2 region-luma, silhouette-iou | M | done | 6219836d6 | `tools/look-metrics/{region-luma,silhouette-iou}.mjs`; `tests/unit/gu47/ei/{region-luma,silhouette-iou}.test.ts` |
| EI-3 variant params and targets | M | done | adb089d3b | 59 GU47 rows appended in `@g9`..`@g15`; the 68 existing targets keep names, URLs and `@g1`..`@g8`; `VARIANT_PARAMS` per game; `tests/unit/game-luma-targets.test.ts` (8 tests). NEW params are implemented by the game lanes (table below) |
| EI-4 `look judge --judge prism` | M | done (live call: phase 2) | 3f6dc4679 | imports `judgeWithPrism` from `tools/quality-gate/src/judge-prism.ts`; `tests/unit/gu47/ei/look-judge-prism.test.ts` (provider stubbed) |
| EI-5 `evidence judge --mode sibling` | M | done (live call: phase 2) | a51f2386d | `same_game` / `same_game_confidence`, `--trials 48`, `--seed 20261023`; `tests/unit/gu47/ei/evidence-judge-sibling.test.ts` (fetch mocked) |
| EI-6 art-direction, look-identity, borrowed-asset / prop-exclusivity, luma-band | M | done (warn) | 76688ef8f, a461fae7d, 3ebcc15ab | `GU47_CHECK_SEVERITY = "warn"`; `tests/unit/game-checks/gu47-checks.test.ts` (10 tests); `run.mjs --all`: 0 errors (base 0), 181 warnings (base 20) |
| EI-7 certify categories | M | done | fb52f05ff | `--category sports\|fighting\|arena\|puzzle`; rules in `packages/aura3d-cli/src/commands/assets/certifyCategories.ts`; `tests/unit/gu47/ei/certify-categories.test.ts`; `tests/unit/aura3d-cli/assets.test.ts` unchanged and green |
| EI-8 real-GPU scenarios | M | done (runs: owner, phase 2) | afa026d35 | 18 new + 3 VFX debug (E-F); `tests/unit/gu47/ei/real-gpu-scenarios.test.ts` |
| EI-9 KTX2 encoder in the runner image | S | done (first build: phase 2) | 31378a0c1 | KTX-Software 4.4.2, same pin and sha256 as `tools/asset-optimize/tool-versions.json`; not built in phase 1 |
| EI-10 lessons + materials-environments skill | S | done | a539875ad, 7a6e1ccbe, e92e6ccc2, a61a58009 | lessons R21 (mean-luma trap), R22 (single production shadow caster), V8 (LFS pointer stubs); skill reference `references/look-overrides-4.7.md` (E-A and E-B handoffs); `check.ts` ok |

## Art-direction check: compliance recipe (game lanes, read this first)

The `art-direction` check (warn until WP-38) never evaluates TypeScript. It reads a JSON audit record that the game's own art-direction unit test writes beside `art/direction.ts`. To comply:

1. Ship `art/direction.ts` in the game's own folder: `apps/<appFolder>/art/direction.ts` (app games; `apps/<appFolder>/src/art/direction.ts` is also accepted) or `examples/<example>/art/direction.ts` for ports (the app folder is accepted for ports too). It default-exports `defineArtDirection({ ... })`.
2. In the unit test that runs `auditArtDirection`, write the record with the helper in `tools/game-checks/lib/art-direction.mjs` (typed by `art-direction.d.mts`):

   ```ts
   import direction from "../../../apps/<appFolder>/art/direction";
   import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
   import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

   const snapshot: ArtDirectionSnapshot = /* snapshotForAudit(app, assetManifestLike(manifest)) on the authored scene,
     or a literal mirror of the scene's lights, environment and models */;
   const violations = auditArtDirection(direction, snapshot);
   writeArtDirectionAudit("apps/<appFolder>/art/direction.ts", { direction, snapshot, violations });
   expect(violations).toEqual([]);
   ```

   The path argument is repo-relative (or absolute, or a file URL). The helper writes `art/direction.audit.json` (schema `aura3d.art-direction-audit/1`: sha256 of `direction.ts`, the direction data, the snapshot, the violations). No timestamp; the file is rewritten only when its content changes.
3. Commit `art/direction.audit.json` together with `art/direction.ts`, and rerun the test after every edit of `direction.ts` (a sha mismatch is reported as stale).

The check warns when: there is no `art/direction.ts`; the audit JSON is missing or invalid; it is stale; `violations` is not empty; the direction has no `id`, `signatureEffect` or `palette.primary`.

`look-identity` reads `signatureEffect`, `palette` and `lighting.environment` from the audit records of all live games. Only `environment.background: "hdri"` counts as the game's primary visible environment; give `environment.hdri` as the catalogue id (`belfast_sunset_puresky`) or the served path (`/hdri/belfast_sunset_puresky_1k.hdr`) so the check can hash the file.

## Variant URL params and luma targets (chosen in wave 1; game lanes implement the NEW ones)

Rule: every existing target keeps its name and URL; a variant gets a new target only if no existing target covers it; a param that already works on 4.6.0 is preferred, so WP-38's "before" capture on 4.6.0 shows the right variant.

As shipped (adb089d3b): the 68 base targets (the PRD's "64" predates four 4.6.1 rows) keep `@g1`..`@g8`; the 59 rows below follow in `@g9`..`@g15` (`GU47_FIRST_GROUP`), in inventory order. `VARIANT_PARAMS` in `tests/browser/game-luma-targets.ts` names the param per game; the unit test checks every GU47 row's URL against it and the variant ids against the game sources (VenueId, CircuitId, MAZE_ORDER, STAGES, CHAPTERS). A NEW param that a game has not implemented yet boots the default view, so its before/after rows show no change until the game lane lands it.

| Game | Param (status) | New variants (target `<slug>--<variant>`) |
|---|---|---|
| top-tennis | `?venue=` (exists, `examples/aura-slam/shell/boot.ts:599`) | grass, clay, desert, beach, moon (`default` is hard) |
| heatsink | `?circuit=grand\|dustfall\|vesper` (NEW, G03, CircuitId from `data.ts`) | dustfall, vesper (`default` is MEGACITY) |
| bunker-zero | `?floor=1..6\|kh` (NEW, G11, BZ-20) | floor1 ... floor6, killhouse |
| slingshot-siege | `?level=<5 x chapter>` (exists; chapter c = level 5c) | ch0 ... ch5 (SS47-E1 names ch0-ch5) |
| dot-dash-3d | `?maze=` (exists, MAZE_ORDER) | classic, spiral, twin, garden, foundry, zerocore |
| splat-rush-port | `?look=original\|carnival` (NEW, G16, CR-00) | original (`default` is carnival) |
| serpentine-sky-run-port | `?stage=1..8` (NEW, G17; 1-based, STAGES in `sim.ts`) | stage1 ... stage8 |
| drift-and-deliver-port | `?at=<elapsed shift seconds>` (NEW, G18; GC-L6 0:10/2:00/2:50) | golden (`?at=10`), sunset (`?at=120`), bluehour (`?at=170`) |
| ninja-runner-port | `?at=<metres>` (NEW, G20, NR-22) | village (100), rooftops (700), river (1300), forest (1900), gate (2500) |
| last-train-port | `?band=A..E` (NEW, G21, LT-01) | band-a ... band-e |
| where-the-wind-wanders-port | `?found=0..3\|epilogue` (NEW, G23; letters found, WW47-L1/PF2) | found0, found2, found3, epilogue |
| silt-and-signal-port | `?chapter=0..6&start=1` (exists, `examples/silt-and-signal-port/main.ts:5`) | ch0 ... ch6 |

Unchanged in wave 1: teleoperator keeps its four `data-tod` clicks (GD-21 renames golden to Marine dusk and makes it the boot sky; reconciled in wave 2), strange-orbit-port keeps the dev-server route `/apps/showcase-strange-orbit-port/` (`/apps/craterline-gp/` is the production rewrite, which the capture's dev server does not serve; SO47-X1), heatsink-port has no district param yet (IC-06 needs two district shots; add rows in wave 2 if G19 lists them), cloud-runner-port has one time of day.

## Crop contract (`window.__AURA_QA__.crops`)

A game publishes named crop rects for the steady-state capture in either place:

- `window.__AURA_QA__ = { crops }`, or
- a `crops` extra on its QA hook: `installQaHooks("<name>", { ..., extras: { crops } })`, read from `window.__AURA_<NAME>__.crops`.

`crops` is an array, or a function returning one, of `{ name, x, y, w, h }`: `name` matches `[a-z0-9][a-z0-9_-]{0,31}`, the rect is normalised 0..1 to the game's main (largest visible) canvas, origin top-left. It is read at every shot, so a function can project a moving subject's box. At most 16 crops. A target in `tests/browser/game-luma-targets.ts` can also declare static `crops`; the hook wins on a name clash.

## Asset ownership for borrowed-asset / prop-exclusivity (game lanes and WP-36)

`tools/game-checks/data/terms.json` `assetOwners.prefixes` maps a camel-case asset-id prefix to its owner (live slug, or the app that made it); the longest prefix wins at a camel-case boundary. Ids no prefix matches belong to the one app whose own `aura.assets.json` lists them, else to the app their root-manifest `source` sits in. `borrowed-asset` warns when a game references another owner's key; `prop-exclusivity` warns when two live games reference the same unowned, non-generic key (`assetOwners.generic`: `prop`, `helper`, `robotcand`, `animationPointer`). Escape hatch on the line: `// borrowed-asset: ok` / `// prop-exclusivity: ok`. New Meshy keys must start with the owning game's prefix (`ironCrown`, `pips`, `fc`, `links`, `bz`, `auraSlam`, ...; `aura3d assets import-meshy --prefix <game>`); a game that needs a new prefix lists it as a handoff to E-I. Today (base data): 107 borrowed keys in 13 games (Iron Crown 25, Pip's Big Leap 23, Links 20, FC 18, ...) and 4 shared keys.

## Luma bands (game lanes, phase 2)

`luma-band` reads `evidence/game-upgrades-47/<slug>/luma-after.json` (`node evidence/audit-fix/e5/decode-luma.mjs after=<acr-run.log> --out evidence/game-upgrades-47/<slug>`) and the game's `luma-bands.json` (schema `aura3d.luma-bands/1`, format in the header of `tools/look-metrics/region-luma.mjs`: `default`, `variants` keyed by variant or target name with frame metrics plus `cells` and `crops`, `exceptions`). Only steady shots (`settle-<s>s`, s >= 20) count; a blank frame or a shot with textures still uploading is always a miss. Without `luma-bands.json` the capture is checked against the PRD default (darkFrac <= 0.6, clipFrac <= 0.05) and the check says so.

## Handoffs received

| From | File | Ask | Result |
|---|---|---|---|
| E-A | `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md` | document the look override keys and the 17-id catalogue at `/hdri/<id>_1k.hdr` | applied: `references/look-overrides-4.7.md` linked from the skill (the body is at its 150-line limit), mirrors synced (7a6e1ccbe) |
| E-B | same skill | document `handle.setLight`, `app.lighting.setEnvironment` / `setEnvironmentRotation`, `setFog({ overrideSceneFog })`, tier caster caps, `diagnostics().lighting.{shadows, punctualLights, localShadowLights}` | applied (7a6e1ccbe, e92e6ccc2) |
| E-F | `tools/real-gpu/scenarios.json` | owner scenario: FC, Links, Iron Crown with `?vfx=on&vfxdebug=1`, read `__AURA_VFX_DEBUG__()` after a goal / shot / exchange | applied: `fc-vfx`, `links-vfx`, `iron-crown-vfx` (afa026d35); the read is an `evaluate` step that `capture.mjs` does not execute yet (handoff below) |

No handoff to E-I from E-C, E-D, E-E, E-G, E-H or E-J (re-checked before finishing).

## Handoffs

| To lane | File:symbol | Change | Why |
|---|---|---|---|
| E-C (finished; integration applies) | `packages/aura3d-cli/src/cli-help.ts:60-61` | `aura3d assets certify-game-geometry --asset(s) ... --category racing\|platformer\|sports\|fighting\|arena\|puzzle` | help text for EI-7; cli.ts already accepts the six (`CERTIFY_CATEGORY_USAGE`) |
| integration / WP-38 (no owner) | `tools/real-gpu/capture.mjs` step loop | support `{ "evaluate": "<expression>" }`: `page.evaluate` it and store the JSON result in `report.json` beside the shot | lets the E-F VFX scenarios record `__AURA_VFX_DEBUG__()`; today they give screenshots only |
| WP-38 | `tools/game-checks/lib/index.mjs:GU47_CHECK_SEVERITY` | `"warn"` -> `"error"` at the 4.7.0 release gate | PRD 7.3 (`run.mjs --all --strict` with the checks at error) |
| G03, G11, G16, G17, G18, G20, G21, G23 | their app / example boot code | implement the NEW variant params in the table above (`?circuit=`, `?floor=`, `?look=`, `?stage=`, `?at=`, `?band=`, `?found=`) | the 59 GU47 luma targets drive them |
| all game lanes | `apps/<app>/art/direction.ts` + test | follow the compliance recipe; commit `art/direction.audit.json` | `art-direction` and `look-identity` read it |
| WP-36 | Meshy admissions | key new assets with the owning game's prefix from `assetOwners.prefixes` | otherwise `borrowed-asset` / `prop-exclusivity` flag them |

## CHANGELOG text (WP-38)

```
### Proof tooling (GameUpgrades47 WP-9)
- Steady-state luma capture: GL_META v2 adds per-frame, per-cell and per-crop mean RGB, hue, luma stddev, p5/p95,
  Laplacian variance and edge density, named crops published by a game (window.__AURA_QA__.crops), a blank-frame flag,
  Git LFS pointer-stub lines and a two-shot diff mode (GL_PAIR_MS). The v1 fields and order are unchanged.
- 59 new variant targets (127 in total, run groups @g9-@g15) driven by ?venue=, ?circuit=, ?floor=, ?level=, ?maze=,
  ?look=, ?stage=, ?at=, ?band=, ?found= and ?chapter=.
- tools/look-metrics/region-luma.mjs (decode, per-variant bands, before/after compare) and silhouette-iou.mjs.
- aura3d look judge --judge prism --shots <jpg,...>: up to 4 frames to the Kiro Prism vision judge, written as a
  validated look judgement. aura3d evidence judge --mode sibling: "are these two frames from the same game?" over 48
  seeded trials, reporting same_game and same_game_confidence. Both are model judgements, not human ones.
- New game-checks: art-direction, look-identity, borrowed-asset, prop-exclusivity, luma-band.
- aura3d assets certify-game-geometry --category sports|fighting|arena|puzzle.
- Real-GPU scenarios for all 25 live games (owner-run). The remote Playwright image carries KTX-Software 4.4.2
  (Basis/KTX2 encoder).
All visual numbers are software WebGL2 unless a real-GPU run says otherwise.
```

## Phase-2 plan

| Row | Capture / run | Acceptance |
|---|---|---|
| EI-1 | `RUN_ID=gu47-ei-meta SPECS='tests/browser/game-luma-capture.spec.ts --grep=@g9' EXTRA_DIRS='apps/showcase-top-tennis apps/showcase-heatsink apps/showcase-bunker-zero' tools/remote-acr/run.sh`, plus one target with `GL_PAIR_MS=1000` and one game that publishes `__AURA_QA__.crops` | every row parses with `region-luma.mjs table`; `decode-luma.mjs` and `compare-luma.mjs` still read the log; GL_PAIR rows present; crop stats present |
| EI-3 | before (4.6.0) and after (4.7.0) captures of `@g1`..`@g15` | each GU47 row shows its variant once the game lane lands the param |
| EI-4 | one live `look judge --judge prism --shots` run with `PRISM_KEY_FILE` on 1-4 JPEG frames | output passes `look judge --validate`; key absent from logs |
| EI-5 | `evidence judge --mode sibling --a <game frames> --b <neighbour frames> --trials 48` per genre neighbour (PRD 6.1) | `same_game: false` at `same_game_confidence >= 0.8` (per WP bands) |
| EI-6 | `node tools/game-checks/run.mjs --all` after the game lanes commit audits and captures; WP-38 flips the severity | 0 warnings from the five checks, then `--strict` green |
| EI-8 | owner: `REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all` | renderer is a real GPU; no page errors or 4xx per scenario |
| EI-9 | first remote image build after merge | build log shows the sha256 check and `ktx --version` 4.4.2 |

## Decisions

- GU47 targets are appended in their own groups (`@g9`+) so the base 68 keep the exact `@g1`..`@g8` selection on 4.6.0 and 4.7.0.
- `look judge --judge prism` asks the model for the C-32 GameJudgementRecord shape (the provider validates it) plus `observations`, then maps it onto the 12 look categories (scores snapped to 0.5; a score below 7 without an observation gets the critique as its observation). JPEG only, at most 4 frames (the provider labels images image/jpeg; Prism takes 4 per turn). `PRISM_KEY_FILE` is read into `PRISM_API_KEY` for the call only and restored; errors are redacted.
- Sibling mode pairs frames by a seeded shuffle of every (a, b) combination, balanced A/B per pass; `same_game` is the majority answer (a tie counts as the same game) and `same_game_confidence` the mean confidence of the trials that gave it.
- The five checks warn (one constant for WP-38). `look-identity` compares HDRI file sha256 when the file is on disk and the normalised catalogue id otherwise (E-A's files 404 until merge); palettes are shared at 3 identical primary hexes (or every primary of the smaller palette), matching the PRD's Diamond/Hoops example. Asset ownership is data (`terms.json`), not guessed from folder names; app-local-only ids of other apps are never counted (they cannot load there).
- Certify categories reuse the existing machinery: a retained-probe subject (athlete, fighter, arena character) and the platformer playable-surface probe for venues, stages, arena floors and puzzle boards; racing and platformer are byte-identical in behaviour. `bind-game-route-evidence` stays racing|platformer (separate `AuraCliCertifyCategory` type). The rules sit in a new module because `index.ts` is the CLI's public surface.
- The KTX2 layer reuses the repo's existing KTX-Software pin (`tools/asset-optimize/tool-versions.json`) instead of a second version.
- Ownership note for merge: besides the PRD 4.1 E-I files, this lane edited `packages/aura3d-cli/src/index.ts` (`certifyGameGeometry`, two `label` parameter types) and `packages/aura3d-cli/src/asset-core-types.ts` (certify types) under scope row 7 ("and the certify code"), created `packages/aura3d-cli/src/commands/assets/certifyCategories.ts`, updated one premise-changed test in `tests/unit/cli/look-judge.test.ts`, and synced the `aura3d-materials-environments` mirrors (`.agents/`, `.claude/`, `.cursor/`, `packages/create-aura3d/skills/`). No other lane lists these files.
- The skill body is at the checker's 150-line limit, so the 4.7.0 API lives in a linked reference file; API names that only exist after the engine merges are kept out of inline code-span call form so `check.ts` passes on this branch.

## Verification

- Typecheck delta (`bin/typecheck-delta.mjs`): `NEW_ERRORS 0` (58 errors, baseline 58). An intermediate run found 4 new test-file errors (3 unused `@ts-expect-error` on `.mjs` imports, one `unknown[]`), fixed in a5a9fff5a.
- Base (branch head before this run's first edit, 6219836d6): 9 files, 166 tests pass (`game-luma-targets`, `game-checks`, `cli/look-judge`, `aura3d-cli/judge/evidence-judge`, `game-runtime/public-game-geometry`, `aura3d-cli/assets`, `gu47/ei/{game-luma-stats,region-luma,silhouette-iou}`).
- Branch: 14 files, 197 tests pass: the 9 above plus `game-checks/gu47-checks` (10), `gu47/ei/{look-judge-prism (6), evidence-judge-sibling (5), certify-categories (4), real-gpu-scenarios (3)}`. One existing test changed on purpose: `cli/look-judge.test.ts` "exits 2 with judge-unavailable when --judge prism has no C-32 export" became "exits 2 when --judge prism has no --shots" (the export now exists). No test that passes on the base fails on the branch. (`public-game-geometry` and `certify-categories` hit a vitest worker RPC timeout once under machine load and passed on rerun.)
- `node_modules/.bin/eslint` on every touched source and test file: clean.
- Skills: `tools/agent-skills/sync.ts` then `tools/agent-skills/check.ts` (what `pnpm skills:sync` / `pnpm check:skills` run): `ok: true`, no failures; only `aura3d-materials-environments` copies staged.
- `node tools/game-checks/run.mjs --all`: 0 errors (base 0); 181 warnings (base 20: screens-fresh 19, page-parity 1), the new ones being art-direction 25, luma-band 25, borrowed-asset 107, prop-exclusivity 4.
- Not run (phase 1 rules): browsers, Playwright, `tools/remote-acr/run.sh`, the Dockerfile build, `tools/real-gpu/run.sh`, Prism.

## API as shipped

- `tests/browser/game-luma-targets.ts`: `GameLumaTarget { name; slug; variant; url; group; prepare?(page); crops?: readonly GameLumaCrop[]; pairAdvance?(page) }`; `VARIANT_PARAMS: { readonly [slug]: string }` (18 games); `TENNIS_VENUES`, `HEATSINK_CIRCUITS`, `BUNKER_FLOORS` (`[variant, value]`), `SLINGSHOT_CHAPTERS`, `DOT_DASH_MAZES`, `SPLAT_RUSH_LOOKS`, `SERPENTINE_STAGES`, `DRIFT_PHASES` (`[variant, seconds]`), `NINJA_DISTRICTS` (`[variant, metres]`), `LAST_TRAIN_BANDS`, `WIND_DAYLIGHT` (`[variant, value]`), `SILT_CHAPTERS`; `GU47_FIRST_GROUP: number` (9); `GROUP_SIZE`, `GAME_LUMA_TARGETS` (127).
- `tests/browser/game-luma-stats.ts` (rows 1-2): types `GameLumaCrop { name; x; y; w; h }`, `LumaRegionStats`, `LumaHistograms`, `LumaPixelRect`, `LumaCropStats`, `GlMetaV1`, `GlMetaV2`, `DecodedFrame`, `FrameDecoder`, `GlMetaInput`, `GlMetaResult`, `PairDiffStats`, `GlPairDiff`, `GlPairInput`, `GlPairResult`; functions `glMetaInPage`, `glPairInPage`. Capture env: `GL_SETTLE`, `GL_PAIR_MS`, `GL_TEX_WAIT_S`; log lines `GL_META`, `GL_PAIR`, `GL_JPG`, `GL_LFS`.
- `tools/look-metrics/region-luma.mjs`: `LUMA_BANDS_SCHEMA`, `DEFAULT_BAND`, `STEADY_MIN_SECONDS`, `parseCaptureLog`, `loadCapture`, `shotSeconds`, `steadyRows`, `lastShots`, `targetMatches`, `srgbToLab`, `deltaE2000Lab`, `deltaE2000`, `hueDelta`, `aggregateCells`, `regionStats`, `fractionAbove`, `histogramL1`, `metricOf`, `checkBand`, `checkRowBand`, `bandFor`, `evaluateBands`, `compareCaptures`, `formatRowTables`, `formatBands`, `formatCompare`, `formatPairs`; CLI `table|bands|compare|pairs|extract`. `tools/look-metrics/silhouette-iou.mjs`: `crc32`, `decodePng`, `encodePng`, `borderColor`, `parseHexColor`, `maskFromImage`, `normalizeMask`, `iou`, `pairwiseIou`, `maskToPng`.
- `packages/aura3d-cli/src/look/judge.ts`: `type PrismJudgeFn = (packet: { itemId; images; prompt; kind: "benchmark" | "game" }, opts: { baseUrl; apiKeyEnv: "PRISM_API_KEY"; model: "claude-opus-5.5" }) => Promise<unknown>`; `interface LookJudgeDeps { loadPrismJudge?(): Promise<PrismJudgeFn | undefined> }`; `PRISM_LOOK_MODEL`, `PRISM_MAX_SHOTS` (4); `lookJudgePrompt({ itemId, subject, genre?, shots }): string`; `lookJudgementFromPrism(record, { round, shots, references? }): LookJudgement`; `collectJudgeShots(spec, cwd): { files; error? }`; `runLookJudge(argv, io, deps?)`. CLI: `aura3d look judge --judge prism --shots <a.jpg,b.jpg,...|dir> [--round 1] [--genre <g>] [--item <id>] [--subject <text>] [--references <id,...>] [--out look-judgement.json] [--json]`.
- `packages/aura3d-cli/src/commands/evidence/judge.ts`: `type JudgeMode = "reference" | "sibling"`; `SIBLING_CONFIDENCE_THRESHOLD` (0.8); `siblingPromptIntro(subject)`; `SIBLING_PROMPT_QUESTION`; `SiblingPair { step; pass; a; b; gameIs }`; `siblingPlan(aNames, bNames, trials, seed): SiblingPair[]`; `SiblingTrial`; `SiblingSummary { trials; valid; differentGame; sameGameYes; differentRate; ci95; confidentDifferent; confidentDifferentRate; same_game; same_game_confidence; passes }`; `summarizeSibling(trials)`. CLI: `--mode reference|sibling` (default reference); the sibling result file carries top-level `same_game`, `same_game_confidence`, `acceptance`, `summary`, `trials`.
- `tools/game-checks/lib/index.mjs`: `GU47_CHECK_SEVERITY` ("warn"); `artDirectionCandidates(root, game, src)`; `primaryHdriOf(root, appFolder, environment)`; `assetOwnerOf(id, terms, universe, inventory)`; `GAME_CHECKS` gains `art-direction`, `look-identity`, `borrowed-asset`, `prop-exclusivity`, `luma-band`. `tools/game-checks/data/terms.json` gains `assetOwners { note, prefixes, generic }`. `tools/game-checks/lib/art-direction.mjs` (143b7479f): `ART_DIRECTION_AUDIT_SCHEMA`, `ART_DIRECTION_AUDIT_FILE`, `artDirectionAuditPath`, `sha256File`, `artDirectionAuditRecord`, `writeArtDirectionAudit`, `readArtDirectionAudit` (typed by `art-direction.d.mts`).
- `packages/aura3d-cli/src/asset-core-types.ts`: `type AuraCliCertifyCategory = AuraCliGameGeometryCategory | "sports" | "fighting" | "arena" | "puzzle"` (used by `CertifyGameGeometryOptions.category` and `GameGeometryCertificationRow.category`); `AuraCliGameAssetCertification` gains `certified-sports-venue`, `certified-sports-athlete`, `certified-fighting-stage`, `certified-fighting-character`, `certified-arena-world`, `certified-arena-character`, `certified-puzzle-board`. `packages/aura3d-cli/src/commands/assets/certifyCategories.ts`: `CERTIFY_CATEGORIES`, `CERTIFY_CATEGORY_RULES`, `CertifyCategoryRule`, `isCertifyCategory`, `CERTIFY_CATEGORY_USAGE`.
- `tools/real-gpu/scenarios.json`: 18 new game keys (inventory slugs, production paths, optional `query`), `fc-vfx`, `links-vfx`, `iron-crown-vfx`; step key `evaluate` (recorded once `capture.mjs` supports it).
- `tools/remote-acr/Dockerfile.playwright`: `ARG KTX_VERSION=4.4.2`, `ARG KTX_SHA256`, `/opt/ktx`, `ENV A3D_KTX_BINARY=/opt/ktx/bin/ktx`, `LD_LIBRARY_PATH=/opt/ktx/lib`.

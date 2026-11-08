# Guessable API (E3-06): three.js names models try, and what Aura3D does with them

Models trained on three.js guess three.js names. This page is the evidence table and the decision for each guess. The translation table is [`threejs-to-aura3d.md`](threejs-to-aura3d.md).

## Evidence and method

Harvested from every `transcript.json` on `origin/exp/turn-gap-504`, `origin/lane/503-trial` and `origin/bench/505-{animation,effects,environments,games,interactive,materials,models,physics}`: 1,884 run transcripts, 1,461 of them Aura3D-arm runs (the rest are three.js controls and are excluded). Counted in the Aura3D arm only:

- (a) `error TS` lines in tool results of the agent's `typecheck` tool (occurrences, not runs);
- (b) `search` patterns and `aura_lookup` queries that hunt for an API by a three.js name (occurrences / distinct runs);
- (c) three.js names written into `write_file` / `edit_file` sources that Aura3D accepted (so they are guesses that worked, listed for completeness).

Caveats, stated plainly: the transcripts come from engine versions between 5.0.0 and 5.0.2, so some errors are already fixed in `main` (`mode: "exp2"` on `effects.fog` is valid now; the TS2322 message quoted the shared effect node's anti-alias union). The silent no-op class (c in the brief) was measured from the source side, not from transcripts: the only way a transcript shows a no-op is a captured frame, and none of the transcripts record one. Counts are model behaviour on 8 benchmark task families, not a population estimate.

## Ranked table: top 30 failed or hunted guesses

`Type` is T (typecheck error), H (hunt: search or lookup by the three.js name) or S (source-side silent no-op found by reading the builders). `Decision`: **alias** = new optional property or method with identical compiled output (equivalence test), **report** = typed `OPTION_IGNORED` note with a "did you mean" suggestion, **doc** = documented here and in the translation table.

| # | Guess (three.js) | Type | Count (occ / runs) | Decision |
| ---: | --- | --- | ---: | --- |
| 1 | `toneMapping` (renderer / how to set) | H | 486 / 200 | doc: `output: { toneMapping }` on `createAuraApp` or the look preset |
| 2 | `OrbitControls.autoRotate` | H | 450 / 269 | doc: `camera.orbit({ autoRotate })` exists; hunts are lookups, not failures |
| 3 | `Mesh` | H | 286 / 220 | doc: no `Mesh`; `primitives.*` / `model()` |
| 4 | `size: [w, h]` on a plane (`PlaneGeometry(w, h)`) | T | 40 / 40 | **alias**: `primitives.plane({ size: [w, d] })` = `[w, 1, d]` |
| 5 | `castShadow` on a mesh | H | 146 / 128 | already accepted (`primitives.*`, `model()`); no change |
| 6 | `Group` | H | 145 / 121 | doc: `group(name, children, opts)` |
| 7 | `lookAt` | H | 96 / 84 | already accepted (`.lookAt`, `camera target`); no change |
| 8 | `FogExp2` / `exp2` | H | 89 / 79 | doc: `effects.fog({ mode: "exp2", density })` |
| 9 | `ShaderMaterial` / `uniforms` | H | 70 / 40 | doc: `material.custom({ glsl, uniforms })`, `setUniform` |
| 10 | `receiveShadow` | H | 49 / 49 | already accepted |
| 11 | `transparent: true` | H+T | 40 / 32 (+2 TS2353) | **report**: stripped from the spec, note says "set `opacity < 1`" |
| 12 | `flatShading` | H | 38 / 38 | **report**: note says `geometry.computeNormals(geometry.toNonIndexed(src))` |
| 13 | `mapSize` (shadow) | H | 22 / 22 | already accepted in `shadow: { mapSize }` |
| 14 | `InstancedMesh` / `setMatrixAt` | H | 22 / 11 | doc: `instances.*({ transforms, colors })` |
| 15 | `requestAnimationFrame` / `Clock` loop | H | 40 / 30 | doc: `app.onFrame((f) => f.dt)` |
| 16 | builder `.rotation(x, y, z)` | T | 10 / 10 | **alias**: same as `.rotate(x, y, z)` |
| 17 | `light.castShadow = true` | S | n/a (code reads, no transcript row) | **alias**: `lights.{directional,point,spot}({ castShadow: true })` = `shadow: true` |
| 18 | `setLight({ skyColor })` (hemisphere) | T | 9 / 9 | **alias**: `AuraLightPatch.skyColor` = `color` |
| 19 | `HemisphereLight` colour as `color` | S | n/a | **alias**: `lights.hemisphere({ color })` = `skyColor` |
| 20 | `side: DoubleSide` / `"double"` | S | n/a (366 hits are `material.custom`, which already supports it) | **alias**: `material.pbr/metal({ side: "double" })` = `doubleSided: true`; `"back"` is reported |
| 21 | `aces-filmic` tone mapping name | T | 9 / 9 | doc: names are `none, linear, reinhard, aces, agx, neutral, cineon`; the TS error lists them |
| 22 | `createOrbitRig` / `bindOrbitPointer` (invented) | T | 10 + 10 / 10 | doc: do not exist; `interactions.orbit` + `camera.orbit` |
| 23 | `world.push(...)` on scene children | T | 11 / 11 | doc: children are `readonly`; call `.add()` / `.addMany()` |
| 24 | optional callback invoked directly (`app.xxx?.()`) | T | 20 / 20 | doc: handles list optional members; check before calling |
| 25 | `wireframe: true` | S | n/a | **report**: note says use `geometry.wireframe(source)` |
| 26 | `map` / `normalMap` / `aoMap` | S | n/a | **report**: notes say `texture`, `normal`, `occlusionMap` |
| 27 | misspelt option on a light builder (`intensty`, `angel`) | S | n/a | **report**: lights were the only unguarded builders; now `OPTION_IGNORED` + suggestion |
| 28 | `metalness`, `emissiveIntensity`, `envMapIntensity`, `opacity` | H | 103+9+13+36 / 8-100 | already accepted aliases (`metalness` mirrors `metallic`); no change |
| 29 | `OrbitControls`, `AnimationMixer`, `BoxGeometry`, `Points` by name | H | 10 each / 8-10 | doc: translation table rows exist; the hunts found them |
| 30 | `shadow: false` where options object expected | T | 1 / 1 | doc: `shadow` is `boolean \| options`; use `true` |

Rows 1-3, 5-10 and 13-15 are hunts that succeeded or are documentation problems rather than API gaps: the agent found the Aura3D name after one search. The alias and report rows are the ones where the guess failed or silently did nothing.

## What shipped (all additive)

- **Aliases** (identical node/compiled output, equivalence tests in `tests/unit/agent-api/guessable-api-aliases.test.ts`):
  `.rotation(...)` on builders, `primitives.plane({ size: [w, d] })`, `castShadow` on directional/point/spot lights, `lights.hemisphere({ color })`, `AuraLightPatch.skyColor`, `material.pbr/metal({ side })`. Declarations are new optional properties or overloads only; nothing is removed, narrowed or retyped (`primitives.plane` widens its `size` parameter, `AuraMaterialSpec` and the light option bags gain optional keys).
- **Unknown-option guard with a suggestion.** `OPTION_IGNORED` (already present on primitives, effects, model, instances, interactions) now ends with `Did you mean "x" -> "y"?` when a documented three.js name or a near spelling (transposition-aware edit distance) matches a valid key. The light builders (`lights.ambient/hemisphere/directional/point/spot`) were the unguarded gap and now carry the same note. Warn-only by default: the note becomes an `option-ignored` degradation in `app.diagnostics()`, and a strict mount (`A3D_QR_STRICT`) throws on it through the existing channel. Nothing throws at build time, so existing apps keep building.
- **Material guesses with no equivalent** (`wireframe`, `flatShading`, `map`, `normalMap`, `aoMap`, `transparent`, `depthTest`, `vertexColors`, `side: "back"`) are removed from the spec and reported on the primitive that carries the material, with the Aura3D spelling.

## Decisions not taken

- `transparent`, `wireframe`, `flatShading`, `map` are not added to `AuraMaterialSpec` types: accepting them would type-check and then do nothing, which is the failure this lane exists to remove. They stay untyped, so TypeScript users get a typecheck error; JavaScript users get the runtime note.
- `"aces-filmic"` is not added to the tone-mapping union: it lives in `@aura3d/rendering` contracts and a wider union would touch exhaustive records. The TS error already lists the valid names.
- `Mesh`, `Object3D.add`, `Raycaster`, `Clock`, `AnimationMixer.clipAction` keep their current mappings in the translation table; no class aliases were added (that would claim drop-in compatibility, which `claims-and-boundaries.md` forbids).

## Verification status

Run on this branch (`lane/515-guessable-api`), numbers from the run, not estimates.

- **Unit tests.** `tests/unit/agent-api/guessable-api-aliases.test.ts` (14 tests: one equivalence test per alias asserting identical node JSON, plus the suggestion tests) passes. `tests/unit/agent-api/option-coverage.test.ts` (127 tests, including "all documented options have downstream evidence") passes after the new option rows were added. The wider `tests/unit/agent-api` plus `tests/qr/prd15/compiler/option*` run: 2,506 passed, 4 failed. The failures are `texture-residency-runtime` (2, 5 s timeouts), `native-gaussian-splat-runtime` (1) and one atlas-retention case. `texture-residency-runtime` fails the same way when run alone; the atlas-retention file passes when run alone (33/33). They touch none of the changed files, but they were not run on the base commit, so "pre-existing" is an inference, not a measurement.
- **Typecheck.** `tsconfig.check.json` (repo-wide `tsc --noEmit`) exits 0. `docs/agents/recipes-src/tsconfig.json` (type-checks the translation table and signature examples, which now include the new aliases) is clean. `gen-api-signatures.mjs --write`, `pnpm skills:sync` and `pnpm check:skills` ran clean. `check:agent-docs` was not run (banned locally).
- **Strict mode.** The `option-ignored` degradation is the existing channel strict mounts already throw on (`recordDegrade` calls `ctx.degrade`). This lane did not add a test that a strict mount throws on a light-builder note.
- **Real-GPU proof of the aliases** (headless Chrome, Apple M4 Max via ANGLE/Metal, virtual-clock shim, 1280x640 canvas area). Three scenes shaped like the failed benchmark tasks (`evidence/guessable-api-515/proof/{forest,arm,glass-hall}`), each built once with canonical names and once with the three.js alias names (`?variant=alias`), plus the canonical build captured twice. Every frame was checked to be a populated canvas (title "E3-06 alias proof", one WebGL canvas, 281 / 122 / 360 distinct colours; the harness retries until the frame is populated and three consecutive shots are byte-identical). Mean absolute difference, canonical vs alias: forest 0, arm 0, glass-hall 0 (max channel difference 0, pixel-identical). Canonical vs canonical (run noise): 0 for all three. What each scene exercises: forest uses `plane size [w, d]` and `castShadow` on a directional light; arm uses `.rotation()` and `lights.hemisphere({ color })`; glass-hall uses `side: "double"`, `castShadow` on a spot light and `setLight({ skyColor })`. `transparent`, `wireframe` etc. are not in the proof because they are removed, not aliased.
- **No-regression frames, base commit vs this branch** (same machine, same shim, `?start=1`; base = `origin/main` at e5387f3b0 in a scratch worktree, captured twice for noise). Ten showcase games were captured. **Only three yielded real 3D game frames** on both builds: `showcase-bank-shot` (3,492 colours; mean abs diff 0.0123 base-vs-branch, 0.0007 base-vs-base), `showcase-blockfall-reactor` (2,525 to 2,561 colours; 7.2 base-vs-branch, 9.39 base-vs-base: pieces move between captures, so the difference is inside the noise), `showcase-slingshot-siege` (1,795 colours; 0.1411 base-vs-branch, 0.1411 base-vs-base). The other seven (`cross-hop`, `iron-crown`, `aura-hoops-3d`, `pips-big-leap`, `kart-havoc`, `aura-links-3d`, `heatsink`) rendered a black WebGL canvas with only the HTML overlay on **both** builds (diffs 0 to 0.16, equal to noise); they are not valid proof and are not counted. I did not find the cause (the console first showed asset-load failures from unpulled LFS files; after pulling them the canvases stayed black). The brief asks for at least five games; this lane has three. "No regression across the 25 games" is unproven by this lane: the changes are additive and a game that does not use the new names reaches no new code path except the unknown-option note on light builders, but that is reasoning, not measurement.
- **Not done.** A re-run of three benchmark sources through their original task harness (the proof scenes are shaped after them, not their literal sources); class aliases such as `Mesh` / `Raycaster` / `Clock` (decided against, above); an `aces-filmic` tone-mapping alias.

Evidence: `evidence/guessable-api-515/` (`frames/proof`, `frames/games`, contact sheets, `tools/` including the transcript harvest scripts in `tools/harvest`).

## 5.4 N7: second harvest (benchmark 505) and what changed

Source: every Aura3D-arm `transcript.json` on `origin/bench/505-{animation,effects,environments,games,interactive,materials,models,physics}`, `origin/lane/503-trial` and `origin/exp/turn-gap-504` (495 Aura3D-arm runs; three.js runs excluded), plus the 117 `snapshots/final/src` sources of the non-superseded 505 runs. Harvest scripts: `evidence/guessed-names-n7/tools/`; harvested (builder, key) pairs and namespace calls with run counts: `evidence/guessed-names-n7/data/`.

Method, beyond the E3-06 typecheck-error count: (1) every `write_file` / `edit_file` source was parsed with the TypeScript parser, and each `namespace.member(...)` call and each object-literal key passed to an engine builder was checked against the current `@aura3d/engine` declarations with the type checker; (2) `search` / `aura_lookup` inputs were scanned for setter names; (3) final sources were read for handles cast to invented types and called with `?.()`.

What it found: option-key guesses are now rare. Of 494 distinct (builder, key) pairs agents wrote, every key exists in the current types except `transparent` (already reported, row 11) and two one-off keys; the 505 typecheck errors are the E3-06 rows (plane `size: [w, h]`, `.rotation`, `skyColor`, `aces-filmic`, `transparent`) or user-declared readonly arrays. The remaining failures are runtime names:

| # | Guess (three.js) | Evidence (Aura3D-arm runs) | Decision |
| ---: | --- | --- | --- |
| N7-1 | `handle.setColor(c)` (`material.color.set`, `light.color.set`) | 43 runs searched for it, 1 wrote it | **alias**: light → `setLight({ color })`; primitive → `setMaterial({ ...material, color })`; model / group / shader material → RangeError naming `handle.materials` / `setUniform` |
| N7-2 | `handle.setIntensity(v)` (`light.intensity = v`) | 28 hunted, 2 wrote it (one as `setIntensity?.(v)` through a cast type, a silent no-op) | **alias** on lights (`setLight({ intensity })`); on any other kind a RangeError naming `setEmissive(color, intensity)` |
| N7-3 | `handle.setOpacity(a)`, `handle.setEmissive(c)` | 5 hunted each, 1 wrote each | **alias**: `setMaterial({ ...material, opacity })`, `setMaterial({ ...material, emissive, emissiveIntensity })`; RangeError on lights |
| N7-4 | `material.standard({ ... })` (`MeshStandardMaterial`) | 3 wrote it (TS2339) | **alias**: identical to `material.pbr(options)` |
| N7-5 | `toneMapping: "aces-filmic"` / `ACESFilmicToneMapping` | 2 wrote it, after reading `"aces-filmic"` in Aura3D's own `AppliedLookReport` / `rendererColorManagementPreset` declarations | **alias at runtime**: `createAuraApp({ output })`, `renderer.output` and `app.output.setOutput` map same-meaning spellings (`aces-filmic`, `ACESFilmicToneMapping`, `AgX`, `NoToneMapping` ...) to the operator; any other name (including `filmic`, which is a distinct postprocess curve, not ACES) throws `TONE_MAPPING_UNKNOWN` listing the seven operators (before, it failed later inside the output pass). The TypeScript union is unchanged, so typed code still gets a compile error for `"aces-filmic"` |

Not changed: optional members (`setLight?`, `setUniform?`) stay optional, so `?.()` on a node kind that lacks them is still a no-op; a handle-wide proxy that reports unknown members was rejected (per-frame cost on every handle). Invented imports seen in E3-06 (`createOrbitRig`, `bindOrbitPointer`) are real exports now.

Tests: `tests/unit/agent-api/guessed-names-n7.test.ts` (setIntensity / setColor on a mounted light equal `setLight` in the collected light; mesh setters equal `setMaterial` with the merged material; every refusal names the native call; `material.standard` equals `material.pbr` including its notes; tone-mapping alias and error cases). Translation table rows and `recipes-src/translation-table.check.ts` carry the new names.

Real-GPU no-regression check (headless Chrome, ANGLE Metal, Apple GPU; `pnpm build` then a single-route marketing build per game; branch build vs `https://aura3d.auraone.ai/apps/<slug>/`, one frame at 11 s): mean absolute difference teleoperator 4.09, pips-big-leap 1.57, aura-diamond-3d 1.54, bunker-zero 4.26 (title menu over a blurred scene), slingshot-siege 0.02; per-channel frame means equal within 1. The non-zero values are animation timing between two live runs (car speed 23 vs 24 mph in the teleoperator pair), not a look change. Side-by-side pairs: `evidence/guessed-names-n7/frames/`. The live site is a different build from this branch's base, so this shows no look change against production, not an isolated base-vs-branch diff; the only N7 path an existing game runs is the tone-mapping normalisation, which returns the same options object for every canonical name. `showcase-dot-dash-3d` does not build on this base (`labAppOptions` declared twice in its `main.ts`), unrelated to N7.

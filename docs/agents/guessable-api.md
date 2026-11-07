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

See the lane report: unit tests, typecheck and the frame comparison are listed there with what was and was not run.

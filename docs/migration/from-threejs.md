# Porting three.js code to Aura3D

Version: 4.6.1

Status: verified against `packages/aura3d-cli/src/migrate-three/mappings.ts` (245 rows: 48 exact, 150 approximate, 47 none, 0 pending) and against `tools/bench-vs-threejs` on current main, 2026-10-24.

## What you get with Aura3D

- **Typed, hashed, licensed assets.** `model(assets.robot)` is a generated typed key; each model records source, licence, author and sha256, and in production an unverified model does not draw.
- **Looks.** `looks.preset(id)` supplies HDRI lighting, a shadow-casting key light, grade and post effects in one call. A lit, framed, orbitable product is 10 lines ([evidence](../../evidence/vs-threejs/tagline-check/README.md)).
- **A game kit.** HUD, touch, audio cues, a fixed-step loop, seeded replay, a safety net and smooth motion on 120 and 144 Hz displays.
- **Agent docs.** `llms.txt`, 14 skills and compiled recipes are written into every new project.
- **Deploy checks.** `aura3d check-deploy` fails the build on a missing hashed asset, unreferenced files and asset-validation errors; `--release` adds licence and quality gates.

Aura3D is a standalone engine with its own renderer (`@aura3d/rendering`) and no `three` dependency. A port is a rewrite of the scene against `@aura3d/engine`, and the `aura3d migrate three` codemod is a helper for that rewrite: it reports what maps, what is approximate and what has no equivalent. It is not a compatibility layer, and there is no shim package, so do not import `@aura3d/three-compat`.

See [why teams port](../aura3d-vs-threejs.md) for the evidence behind the list above.

## 1. The fast path (about 10 minutes for a small scene)

1. Inventory: list every `three`, `three/examples/jsm/*` and `three/addons/*` import, plus every `WebGLRenderer`, render loop, loader and `EffectComposer` use. That list is the scope.
2. Scaffold the closest template: `npx create-aura3d@latest my-port --template custom-scene` (other fits: `premium-product-viewer`, `character-viewer`, `postprocess-scene`, `large-scene`, `mini-game`). Templates import only `@aura3d/engine`.
3. Run the codemod as a report: `npx @aura3d/cli@latest migrate three "src/**/*.ts"`. It prints one row per construct (verdict plus note) and a summary on stderr. Add `--write` only if you want the annotated rewrite saved in place (see section 4: it does not compile as is).
4. Write the scene by hand using the mapping in section 3. `createAuraApp` owns the renderer, camera aspect, resize, loop and disposal: delete that code, do not port it.
5. Admit every GLB the old code loaded by URL as a typed asset (`aura3d assets add`, then `model(assets.x)`); raw string model URLs fail the public-example boundary test and the deploy check.
6. Build, then run `aura3d check-deploy --dist dist --source`. A `three` import anywhere in the shipped tree fails it.
7. Record every approximation in a short migration note (what three.js did, what Aura3D does, the delta).

## 2. How to run the codemod

```sh
npx @aura3d/cli@latest migrate three "<glob>" [--write] [--report]
```

- The glob is the first argument; `.ts`, `.tsx`, `.js` and `.jsx` files are read, `node_modules` is skipped.
- The command always prints the per-construct report on stdout and a one-line summary on stderr (`files, changed, approximate, unmapped`). `--report` is accepted and is the default behaviour.
- `--write` replaces each changed file with the annotated rewrite.
- Programmatic use: `migrateThreeToA3D(source)` (import-level rewrite; returns `code`, `rewrittenImports`, `warnings`) and `emitMigratedSource(source)` (construct-level; returns `code`, `rows`).

## 3. Mapping for the 40 most common APIs

Verdicts come straight from `mappings.ts`. `exact` means the target is a drop-in. `approximate` means semantics survive but options, units or framing differ, so check the note. `none` means no rewrite is emitted, only a TODO.

| # | three.js | Aura3D target | Verdict | What to know |
|---|---|---|---|---|
| 1 | `Scene` | `scene()` | approximate | Children become `.add(...)` or `nodes[]` entries |
| 2 | `PerspectiveCamera` | `camera.perspective(...)` / `camera.orbit(...)` | approximate | `fov/near/far` map 1:1; aspect derives from the viewport |
| 3 | `OrthographicCamera` | `camera.orthographic(...)` | approximate | `left/right/top/bottom` collapse to `orthographicSize = (top - bottom) / 2` |
| 4 | `WebGLRenderer` + loop | `createAuraApp(canvas, { scene })` | approximate | App owns loop, resize, context and disposal |
| 5 | `Mesh` | `primitives.*` or `model()` node | approximate | Not a standalone object; carry the material across |
| 6 | `Group` / `Object3D` | `group(...)` | approximate | Children move into the group |
| 7 | `BoxGeometry` | `primitives.box({ size: [w, h, d] })` | approximate | Segment counts live in `params` |
| 8 | `SphereGeometry` | `primitives.sphere` | approximate | Aura spheres are unit diameter: radius maps to `size: r * 2` |
| 9 | `PlaneGeometry` | `primitives.plane` | approximate | three's plane faces +Z; Aura's lies in XZ. For vertex displacement, build the grid with `geometry.dynamic` |
| 10 | `CylinderGeometry` | `primitives.cylinder` | approximate | Unit cylinder; radii and height map through `size` |
| 11 | `BufferGeometry` / attributes | `geometry.dynamic(spec)` | approximate | Typed-array attributes and indices |
| 12 | `MeshStandardMaterial` | `material.pbr(...)` | approximate | |
| 13 | `MeshPhysicalMaterial` | `material.physical(...)` | approximate | |
| 14 | `MeshBasicMaterial`, `MeshLambertMaterial`, `MeshPhongMaterial` | `material.pbr(...)` | approximate | Shading model changes (Phong specular becomes GGX): write the delta down |
| 15 | `MeshToonMaterial`, `MeshMatcapMaterial`, `MeshNormalMaterial`, `MeshDepthMaterial` | none | none | For a toon look use `effects.toon(...)` (screen pass); others are manual |
| 16 | `ShaderMaterial` / `RawShaderMaterial` | `material.custom({ glsl, uniforms })` | approximate | Uniforms auto-declared; prelude names are documented in examples |
| 17 | `DirectionalLight` | `lights.directional({ shadow: true })` | approximate | Shadow camera extents are derived |
| 18 | `PointLight` / `SpotLight` | `lights.point` / `lights.spot` | approximate | |
| 19 | `AmbientLight` / `HemisphereLight` | `lights.ambient` | approximate | Hemisphere collapses to ambient |
| 20 | `GLTFLoader.load` | `model(assets.x, { targetHeight })` | approximate | Needs a typed asset with sha256; raw URLs are rejected |
| 21 | `RGBELoader.load` + `PMREMGenerator` | `environments.hdri({ texture })` | approximate | Loader and PMREM collapse into one node |
| 22 | `TextureLoader.load` | typed texture asset | approximate | |
| 23 | `OrbitControls` | `camera.orbit(...)` / `interactions.orbit({ target })` | approximate | `target` is a node name, not a point |
| 24 | `EffectComposer` | `effects.*` scene nodes | approximate | No composer object; passes become nodes |
| 25 | `UnrealBloomPass` | `effects.bloom({ intensity, threshold, radius })` | approximate | |
| 26 | `OutputPass` | `createAuraApp({ output })` | approximate | Output stage is built in |
| 27 | `ShaderPass` | `app.addPostPass` / `effects.shaderPass({ glsl })` | approximate | |
| 28 | `SSAOPass` / `GTAOPass` | `effects.ambientOcclusion` | approximate | Depth and quality differ |
| 29 | `Fog` / `FogExp2` | `effects.fog` / `effects.depthFog` | approximate | |
| 30 | `InstancedMesh` | `instances.box` / `instances.mesh` | approximate | Transforms and colours are declarative |
| 31 | `SkinnedMesh`, `Bone`, `Skeleton` | `model(assets.x)` + `AnimationController` | approximate | Skeleton rides inside the GLB |
| 32 | `AnimationMixer` | `AnimationController` | approximate | Play clips by name with a crossfade option |
| 33 | `LOD` | `groups.lod` | approximate | |
| 34 | `Points` / `Sprite` / `Line` | `points` / `sprites` / `lines.*` | approximate | |
| 35 | `Vector2`, `Vector3`, `Vector4`, `Matrix3`, `Matrix4`, `Quaternion`, `Euler`, `Box3`, `Sphere`, `Plane`, `Ray`, `Frustum`, `Triangle` | same names, from `@aura3d/math/three` | exact | Mutable and three.js-shaped (mutate in place, return `this`, target out-parameters, `null` on a miss); checked against three@0.185.1 goldens. At option sites the codemod still emits tuples |
| 36 | `Color` | `Color` from `@aura3d/math/three`, or `"#rrggbb"` strings at option sites | exact | Linear-sRGB working space, as three.js |
| 37 | `Clock` | `Clock` from `@aura3d/engine` | exact | For game loops prefer `createFixedStepLoop` |
| 38 | `MathUtils`, `CatmullRomCurve3`, `Shape`, `Path` | same names, from `@aura3d/engine/math` | exact | |
| 39 | `Raycaster` | `raycast` | approximate | |
| 40 | `FBXLoader`, `STLLoader`, `PLYLoader`, `ColladaLoader` and other non-glTF loaders | none | none | glTF is the supported interchange format; convert first |

Also `none`: `GlitchPass`, `HalftonePass`, `AfterimagePass`, `MaskPass`, `GPUComputationRenderer` and the exporters. `Layers` is `approximate`: node specs take `layers` bitmasks.

## 4. What the codemod cannot do (measured)

Run on `tools/bench-vs-threejs/pbr-viewer/three/scene.ts` (49 non-blank lines): 23 approximate rows, 2 unmapped rows, 22 `// a3d:` markers, 4 leftover `THREE.` references, and 55 non-blank output lines. The output does not compile as written: it emits `const scene = scene()` and `const camera = camera.perspective(...)`, which shadow their own factories, and it leaves `renderer.shadowMap.*` and `renderer.toneMapping` assignments in place. Treat the output as an annotated worklist, not as a port.

It also cannot:
- translate imperative mutation (`mesh.position.set`, `scene.add(...)` in loops) into declarative nodes;
- port custom render-target pipelines, multi-pass `EffectComposer` chains, or GLSL that assumes three's built-in uniforms and chunks;
- turn URL string loads into typed, hashed assets;
- tune exposure: identical nominal light intensities render brighter in Aura3D than in three.js in the benchmark.

## 5. Before and after (measured)

Same scene, both versions in `tools/bench-vs-threejs/pbr-viewer/`: a PBR model on a ground plane with HDRI, a shadowed sun, bloom and orbit control.

| | three.js | Aura3D |
|---|---|---|
| Scene source, non-blank lines | 49 | 24 |
| Import modules | 8 | 1 |
| Extra build files | none | `assets.generated.ts` (sha256 of the model), `vite.config.ts` |

Aura3D version (the scene itself, trimmed to the node list):

```ts
const assets = defineModelAssets({ truck: { url: "/model.glb", sha256: SHA256.truck } }, { license: "CC-BY 4.0, Cesium" });
const app = createAuraApp(canvas, {
  output: { toneMapping: "aces" },
  scene: scene()
    .background("#1a1d24")
    .camera(camera.orbit({ fov: 40, near: 0.1, far: 100, position: [4.5, 2.2, 5.5], target: [0, 0.8, 0] }))
    .add(environments.hdri({ name: "env", intensity: 1, background: false, texture: hdrAsset }))
    .add(lights.directional({ color: "#fff4e0", intensity: 2.5, position: [5, 8, 4], shadow: true }))
    .add(primitives.plane({ name: "ground", size: [30, 1, 30], material: material.pbr({ color: "#2b2f38", roughness: 0.9 }) }))
    .add(model(assets.refs.truck, { name: "truck", targetHeight: 2, castShadow: true }))
    .add(effects.bloom({ intensity: 0.35, threshold: 0.85, radius: 0.6 }))
    .add(interactions.orbit({ target: "truck" }))
});
```

Small print: Aura3D benchmark, five scenes; one author wrote both sides. The numbers come from `evidence/vs-threejs/RESULTS.md` (software WebGL2). The frames are not identical: mean luma was 55.0 in three.js and 89.3 in Aura3D at frame 25, so a port needs exposure tuning. When you quote the line counts, keep the qualifier "Aura3D benchmark, five scenes".

## 6. Stop conditions

Stop and report, rather than faking it with CSS, DOM overlays or CPU pixel passes, when the source depends on custom render targets, `EffectComposer` chains, `ShaderMaterial` passes with no engine equivalent, a non-glTF format, or a GLB loaded by URL with no typed asset. Never write "drop-in", "full parity" or "100% three.js compatible"; name the API and the test that covers it.

## 7. Related

- Skill (agents): `packages/aura3d-cli/skills/aura3d-threejs-migration/SKILL.md`
- Codemod source: `packages/aura3d-cli/src/migrate-three/` (`mappings.ts`, `emit.ts`, `report.ts`)
- Gap register: `docs/workflows/threejs-parity-gaps.md`
- Claims boundary: `docs/agents/claims-and-boundaries.md`

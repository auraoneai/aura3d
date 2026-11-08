# three-bridge: B1 narrow three.js asset bridge (prototype)

`aura3d import-three` runs a structured three.js scene factory headless at build time, exports it with three's
`GLTFExporter`, admits the GLB as a typed Aura3D asset, emits Aura3D source that references it, and writes a
supported / approximated / unsupported report. Plan row: B1 in `docs/project/future-engine-work.md` section 4.
Behaviour (input, physics, scoring, UI) stays native; the bridge only carries assets, lights, camera and output.

Code: `packages/aura3d-cli/src/import-three/` (contract, headless shims, analysis, emitter, pipeline) and the
command registration in `packages/aura3d-cli/src/commands/import-three/`. Tests: `tests/unit/aura3d-cli/import-three.test.ts`.

## Where three comes from

three is a dev/build dependency of the project that owns the recipe, never of an Aura3D package. The CLI resolves
`three/addons/exporters/GLTFExporter.js` from the factory module's own location (or `--three <dir>`) and imports the
matching `build/three.module.js`, so the factory and the exporter share one three instance. This folder is
standalone (not a pnpm workspace member, own `package-lock.json`, three pinned at 0.185.1), like `tools/spatial-bench`.

## Factory contract

A recipe is an ES module whose default export (or `createScene`) returns `{ scene, camera?, cameraTarget?, clips?, assets?, ready?, renderer?, environment?, post? }`:

| field | meaning |
|---|---|
| `scene` | the three.js scene to export (required) |
| `camera`, `cameraTarget` | main `PerspectiveCamera` and its look-at point; emitted as `camera.perspective` |
| `clips` | `AnimationClip`s, exported explicitly (`GLTFExporter({ animations })`); tracks addressed by original node name are retargeted to the stable ids |
| `assets`, `ready` | promises (array or record) awaited before export: the asset-readiness wait |
| `renderer` | `{ toneMapping, exposure }` of the three.js original; emitted as `createAuraApp({ output })` so the first import keeps the authored look |
| `environment` | `{ kind: "room", intensity }` when the original uses RoomEnvironment PMREM; emitted as `environments.neutral` (approximated) |
| `post` | post-processing passes; always reported, never emitted |

The factory receives `{ THREE, seed, random, params, mode }`. `random` is a seeded mulberry32; `Math.random` is
replaced by the same sequence while the factory and its readiness promises run, so a seed gives byte-identical
GLBs. `export const params = {...}` supplies defaults; `--params '<json>'` overrides them. The headless run has no
DOM or WebGL: textures must be `DataTexture`s (baked to PNG) to survive; image/canvas textures are detached and
reported.

## What the bridge writes (per `--name`)

| file | owner | content |
|---|---|---|
| `public/aura-assets/<name>.<hash>.glb`, `aura.assets.json`, `src/aura-assets.ts` | `assets add` | the typed asset (`generation.provider: three-bridge`, seed/params/generator hash in provenance) |
| `src/three-bridge/<name>.bridge.ts` | generated, rewritten every run | node ids, material names, hidden nodes, clips, `…Model()`, native `…Lights()`, camera, background, output |
| `src/three-bridge/<name>.scene.ts` | native, written once, never overwritten | the scene authors edit (behaviour, extra nodes, overrides, hidden ids) |
| `src/three-bridge/<name>.bridge.json` | generated | generator path + sha256, seed, params, three revision, GLB hash, ids, counts; the next run diffs ids against it |
| `src/three-bridge/<name>.report.md` | generated | supported / approximated / unsupported rows with native routes (from the `aura3d migrate three` mapping table) |

Stable ids: `userData.auraId` when the generator sets one, else parent id + `__` + slugged name (or type), with
`_1`, `_2` for same-named siblings. They become glTF node names, so `hiddenNodeNames` and other id-keyed native
edits keep working after regeneration with the same structure.

Classification rules worth knowing: `MeshStandardMaterial`/`MeshPhysicalMaterial` are supported; Lambert/Phong/Toon
and unlit are approximated (the exporter converts them); `ShaderMaterial`, `RawShaderMaterial`, node materials and
unknown types are unsupported and the meshes using them are hidden rather than shown with a substitute;
`onBeforeCompile` patches are unsupported (the GLB carries the unpatched base material); fog, texture backgrounds,
sprites, extra cameras and post are unsupported; `flatShading` is baked into faceted normals; hidden objects are
exported (`onlyVisible: false`) and hidden again through `model({ hiddenNodeNames })`; lights and cameras leave the
GLB and become native nodes (no KHR_lights_punctual doubling).

## Reproduce

```bash
npm install --prefix tools/three-bridge          # three@0.185.1
cd tools/three-bridge
node ../../node_modules/tsx/dist/cli.mjs --tsconfig ../../tsconfig.base.json ../../packages/aura3d-cli/src/cli.ts import-three recipes/tree-grove.mjs
node ../../node_modules/tsx/dist/cli.mjs --tsconfig ../../tsconfig.base.json ../../packages/aura3d-cli/src/cli.ts import-three recipes/city-block.mjs
node ../../node_modules/tsx/dist/cli.mjs --tsconfig ../../tsconfig.base.json ../../packages/aura3d-cli/src/cli.ts import-three recipes/stylized-car.mjs --params '{"paint":"#2a6fd2"}'
node ../../node_modules/vite/bin/vite.js build --config vite.config.ts     # dist/three.html + dist/aura.html
python3 -m http.server 10671 --bind 127.0.0.1 -d dist &                    # kill this PID afterwards
node capture.mjs http://127.0.0.1:10671 /tmp/three-bridge-frames 10672     # real GPU (headless Chrome, ANGLE Metal)
```

`three.html?recipe=<name>[&params=<json>]` renders the factory with three's `WebGLRenderer` (same seed);
`aura.html?recipe=<name>` mounts the emitted `<name>.scene.ts` unchanged. Evidence: `evidence/2026-11-08/README.md`.

Known: `tsc -p tools/three-bridge/tsconfig.json` reports two errors inside the `assets add` typegen output
(`src/aura-assets.ts`) for the animated car: the CLI writes C-17 `animationClips` as `{ name, duration, channelCount }`
objects while the engine's `AuraAssetMetadata.animationClips` is typed `readonly string[]`. This affects every
animated GLB admitted with `assets add`, not only the bridge; the bridge's own emitted modules typecheck clean.

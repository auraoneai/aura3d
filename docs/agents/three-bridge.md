# three.js asset bridge (`aura3d import-three`)

Carry procedural three.js content into an Aura3D project as a typed asset plus editable Aura3D source, instead of
porting it by hand. The bridge carries assets, animation clips, simple shaders, lights, camera and renderer output.
Behaviour (input, physics, scoring, UI) stays native Aura3D code. It is a build-time tool: `three` is a dev
dependency of your project, never a runtime dependency, and the shipped route imports only `@aura3d/engine`.

Status: prototype (B1). Every run writes a report of what was carried, approximated or left out; read it before
you show the result.

## When to use it

| You have | Use |
| --- | --- |
| A three.js function that builds a scene from code (procedural props, a generated city, an animated rig, a shader showcase) | `aura3d import-three` |
| Hand-written three.js app code (renderer, loop, controls) | the migration codemod and the `aura3d-threejs-migration` skill ([threejs-to-aura3d.md](threejs-to-aura3d.md)) |
| A GLB file | `aura3d assets add` |

## The factory contract

A recipe is an ES module whose default export (or `createScene`) returns `{ scene, camera?, cameraTarget?, clips?,
assets?, ready?, renderer?, environment?, post? }`. It receives `{ THREE, seed, random, params, mode }`; `random` (and
`Math.random` while it runs) is seeded, so one seed gives a byte-identical GLB. `export const params = {...}` sets
defaults and `--params '<json>'` overrides them. The run is headless (no DOM, no WebGL): textures must be
`DataTexture`s to survive.

```js
// recipes/windmill.mjs (excerpt): the clip addresses nodes by name; the bridge retargets it to stable ids.
export const params = { sail: "#efe6d2", height: 4.2, rpm: 15 };
export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();
  // ... tower, a `rotor` group with four blades, a vane, a barrel, lights ...
  const spin = new THREE.AnimationClip("rotor_spin", 60 / p.rpm, [new THREE.QuaternionKeyframeTrack("rotor.quaternion", times, quats)]);
  return { scene, camera, cameraTarget: [0, 2.4, 0], clips: [spin], renderer: { toneMapping: "aces", exposure: 1 } };
}
```

Run it from the project that owns `aura.assets.json`:

```bash
npm i -D three
npx @aura3d/cli@latest import-three recipes/windmill.mjs
npx @aura3d/cli@latest import-three recipes/windmill.mjs --params '{"sail":"#3c6fb0","height":4.8}'   # regenerate
```

## What it writes

| file | owner | content |
| --- | --- | --- |
| `public/aura-assets/<name>.<hash>.glb`, `aura.assets.json`, `src/aura-assets.ts` | `assets add` | the typed asset, `assets.<name>` (provenance records generator hash, seed, params) |
| `src/three-bridge/<name>.bridge.ts` | generated, rewritten every run | stable node ids (a `<Name>NodeId` type), material names, clip names, carried shaders, `<name>Model()`, native lights, camera, background, output |
| `src/three-bridge/<name>.scene.ts` | yours, written once, never overwritten | the scene you edit |
| `src/three-bridge/<name>.bridge.json`, `<name>.report.md` | generated | ids for the next run's diff; supported / approximated / unsupported rows with the native route for each |

Stable ids: `userData.auraId` when the generator sets one, else parent id + `__` + slugged name (`windmill__rotor`).
The same generator structure gives the same ids, so anything keyed by id keeps working after a regeneration.

## Animation

Clips returned in `clips` are exported with the GLB. Tracks addressed by original node name are retargeted to the
stable ids. The emitted scene plays the first clip on loop from mount (`.animate({ clip, loop: true })`) and gives the
model a runtime id; further clips play as named layers once the model is ready:

```ts
const animation = (app.nodes.get("windmill") as { readonly animation?: AuraActorAnimationApi } | undefined)?.animation;
animation?.playLayer("breeze", "breeze");
```

Proven here: node-hierarchy clips (rotation and position tracks). GLTFExporter also writes skinned and morph-weight clips, but the bridge has no paired proof for them yet.

## Custom shaders

A simple `ShaderMaterial` or `RawShaderMaterial` is carried as `material.custom`. GLTFExporter cannot write a shader,
so the GLB gets a named placeholder slot and `<name>.bridge.ts` installs the shader on it through
`model({ materialOverrides })`. The GLSL is passed through. The bridge changes only these things:

- three's built-ins map to the custom prelude: `modelMatrix`, `viewMatrix`, `modelViewMatrix`, `projectionMatrix`,
  `cameraPosition`, and in the vertex stage `position`, `normal`, `uv`. `normalMatrix` keeps three's meaning: it is
  view-space there and world-space in the prelude, so it becomes `mat3(viewMatrix) * normalMatrix`.
- A `RawShaderMaterial`'s own declarations of those built-ins are dropped, and so are the authored uniform
  declarations the bridge moves into `spec.uniforms`.
- GLSL ES 1.00 source is lowered to 3.00: `attribute`/`varying` become `in`/`out`, `gl_FragColor` becomes a
  declared output, `texture2D` becomes `texture`.
- A float uniform named `time`, `uTime`, `iTime` or `u_time` reads the Aura3D clock. A vec2 `resolution` reads the
  canvas size. Other uniforms keep their export-time values; drive them with the node's `setUniform`.
- The output is sRGB-decoded. three writes a shader's colour to the canvas as-is, and Aura3D encodes it, so the
  decode makes the colours match. Under a tone-mapped output, Aura3D also tone-maps the shader; three does not. The
  report marks that as approximated.

Refused, with the reason in the report (the meshes are hidden, never shown with a substitute): `#include` chunks,
`lights: true`, `fog: true`, cube maps, texture, matrix or array uniforms, custom attributes, vertex colours,
wireframe, skinning or morph inputs in the shader, custom blending. Port those by hand to `material.custom`.

## Editing the bridged scene

Edit `<name>.scene.ts`. Regenerating with new params rewrites the GLB and `<name>.bridge.ts` only. Edits that
survive a regeneration with the same structure:

```ts
const moved: Partial<Record<WindmillNodeId, { position?: [number, number, number]; rotation?: [number, number, number] }>> = {
  barrel: { position: [1.7, 0.4, 2.3] },
  crate: { position: [0.95, 0.35, 2.9], rotation: [0, -0.5, 0] }
};
scene()
  .add(windmillModel({ nodeTransforms: moved, hiddenNodeNames: ["flag"] }).runtime({ id: "windmill" }).animate({ clip: "rotor_spin", loop: true }))
  .add(lights.point({ name: "lantern", color: "#ffb347", intensity: 14, position: [0.9, 1.3, 2.3], distance: 6 }))
  .addMany(windmillLights());
```

`model({ nodeTransforms })` sets a named node's local position, Euler XYZ rotation (radians) or scale at load. An
animation channel that drives the same property wins while its clip plays. `materialOverrides` keyed by material
name, extra nodes and lights are plain Aura3D. The run prints `ids: N kept, A added, R removed`; a removed id is an
edit that no longer has a target.

## Proof

Paired frames (three.js `WebGLRenderer` on the left, the emitted Aura3D scene on the right, real GPU) for every
recipe, including the animated windmill at two matched clip times, the shader kiosk and the regeneration with native
edits: [tools/three-bridge/evidence/2026-11-08b/README.md](../../tools/three-bridge/evidence/2026-11-08b/README.md).
The source, recipes and capture driver are in [tools/three-bridge/](../../tools/three-bridge/README.md).

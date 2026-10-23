# Roadster Hours on Aura3D: porting notes

Port of the Crayon game *Roadster Hours* (release `20261021-halo-lighting-v11`, game 2.3.1) for the Phase B exit in
`docs/workflows/threejs-parity-gaps.md` (R-20). Source provenance and hashes:
`tests/fixtures/crayon/roadster-hours/PROVENANCE.md`.

## What the original is

A three.js r184 WebGL2 game bundled as four Vite modules: `sim` (16 KB, the driving and flight simulation), `game`
(UI, career, loop), `fx` (effects) and `world` (three.js plus the route builder). The simulation is a **pure function**
`R(state, input, 1/120)` of its input: no clock, no randomness, no GL. The game steps it at a fixed 1/120 s and exposes a
per-step input hook, `window.skybreakDemo.input(state)`, which is what makes a deterministic reference possible.

## What is ported

| Original | Port | Status |
| --- | --- | --- |
| `sim` (`C`, `R`, `D`, `k`, `A`, `j`, `N`, `L`, ...) | `sim.ts`, statement-for-statement, same evaluation order | exact: the recorded original run replays on the same steps |
| `world` route data (`Xu`, `Zu`, `ed`, `td`) | `data.ts`, extracted mechanically from the bundle | exact numbers |
| `world` course functions (`Qu`, `$u`, `od`, `sd`, `cd`, `fd`, `pd`) | `course.ts` | exact |
| road, kickers, shortcut decks, gates, cells, hazards, water | `world.ts` with `geometry.dynamic` + `material.custom` (road, water, solid/glow GLSL 300 es in `shaders.ts`) | procedural look, not pixel parity |
| 68 `BatchedMesh` + 121 `InstancedMesh` for traffic, lineups and scenery | ONE `batched.mesh` (`vehicles`) holding every traffic and lineup vehicle, one instance per collision box, two pooled geometries, per-instance colour and matrix writes each frame | functional; scenery instancing is not ported |
| 29 `ShaderMaterial`s | four `material.custom` programs | simplified look |
| `roadster-rocket.glb`, `world-kit.glb`, sky, post-processing, audio, career UI, touch controls | not ported (the Roadster is three procedural boxes; keyboard input only; minimal HUD) | gaps |

## Determinism and the reference

`tools/crayon-capture/roadster-hours.ts` (remote only) clicks the real "Drive" control in the original, then drives it with
the closed-loop `autopilot.ts` through `skybreakDemo.input`, with switchable virtual time so each frame covers a known
amount of game time, and records every step's input (run-length encoded), counter transitions and a 0.5 s state trace.
Two independent sessions must agree. `tests/unit/roadster-hours-port/reference-replay.test.ts` replays that script through
`sim.ts` and requires the same finish step, the same final state, the same transition steps and a trace within the
capture's own measured tolerance.

## Engine surface used

`material.custom` (GLSL 300 es, uniforms, no `time`/`pulse` names), `geometry.dynamic`, `geometry.custom`, `batched.mesh`
(`addGeometry`, `addInstance`, `setMatrixAt`, `setColorAt`), `primitives.*`, `lights.studio`, runtime node handles
(`setPosition`, `setRotation`, `setVisible`), the camera controller (`setPose`), `createAuraRouteHealthSnapshot`.
No `@aura3d/rendering` internals, no `TODO(a3d-migrate)`.

## Gaps and divergences

- Look: vehicles and the Roadster are boxes; the sky is a flat colour; there is no post-processing or shadows.
- The original replaces its built-in vehicle collision table with metadata from `world-kit.glb` at runtime; the port uses
  the built-in table (`ed`). The capture records the original's traffic dimensions and a test compares them.
- Slow motion, camera shake, audio, the career/results UI and touch controls are not ported.
- Verification of rendering is on a software WebGL2 runner (SwiftShader), not a hardware GPU.

## Engine fixes found while verifying the batched path

Running the port on a real WebGL2 context exposed four defects in the multi-draw route; all are fixed and covered by the remote spec:

1. `u_a3dDrawData` was bound as a raw `Texture`, which the uniform binder rejects (`Unsupported uniform value`); it is now one shared `TextureBinding` per draw-data texture (`drawDataBindingFor`).
2. Integer scalar uniforms (`u_drawId`) were uploaded with `uniform1f` (GL_INVALID_OPERATION); the binder now uses `uniform1i`/`uniform1ui` by reflected type.
3. The shader extension was spelled `WEBGL_multi_draw` (unknown to GLSL); it is `GL_ANGLE_multi_draw`, and `WEBGL_multi_draw` is now requested at device creation so it is enabled before programs link.
4. `canMultiDraw` compared per-item `TextureBinding`s by identity, so no real scene ever merged; equal bindings (same texture and sampler state) now compare equal.

## Verification record

- Reference: two independent in-browser sessions of the original's simulation under the same closed-loop policy, 6124 steps, bit-identical (tolerance 0). The unit replay matches the trace to 2e-14.
- Remote browser spec: passes (`evidence/roadster-hours-port/`). One frame's batched vehicles go out as 3 multi-draw calls (several passes) instead of 92 draws.
- Not done: the original's own rendering loop could not be driven to completion under software GL (2.5 to 5 s per frame), so the reference comes from the original's `sim` module driven directly, plus a partial in-game cross-check that is not part of the report.

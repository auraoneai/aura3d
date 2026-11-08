# B1 bridge evidence, 2026-11-08

Real GPU: headless Chrome, ANGLE Metal, Apple M4 Max, 960x540, `capture.mjs` (`capture.json` holds GPU strings and
console output per frame). Left = three.js original (`three.html`, WebGLRenderer, same factory/seed/params), right =
bridged Aura3D scene (`aura.html`, the emitted `<name>.scene.ts`). Branch exp/54-b1-bridge on exp/53d-integration.

| recipe | three.js | Aura3D | report |
|---|---|---|---|
| tree grove (flat-shaded, hidden spare tree, hemisphere + shadowed sun) | `tree-grove.three.png` | `tree-grove.aura.png` | 77 supported, 0 approximated, 0 unsupported |
| city block (baked DataTexture facades, InstancedMesh lamps, explicit `userData.auraId`, one ShaderMaterial sign) | `city-block.three.png` | `city-block.aura.png` | 106 / 1 / 2 (sign hidden, reported) |
| stylized car (MeshPhysical clearcoat paint, emissive lamps, wheel_spin clip, RoomEnvironment hint) | `stylized-car.three.png` | `stylized-car.aura.png` | 13 / 1 / 0 |
| car regenerated with `--params '{"paint":"#2a6fd2"}'` after native edits | `stylized-car.regen.three.png` | `stylized-car.regen.aura.png` | ids 24 kept, 0 added, 0 removed |

Same geometry, layout, colours, camera and background in every pair. Visible differences (engine-side, not the bridge):
Aura3D shadows are softer and blockier at the edges; the car's chrome bumper and hubs read near-black (metal with
`environments.neutral` versus three's RoomEnvironment PMREM, recorded as approximated in the report); a faint
dither pattern on the car body's shadowed side. The city sign is absent on the Aura3D side on purpose: its
ShaderMaterial is unsupported, so the bridge hides that node instead of showing a substitute.

Regeneration without losing native edits: `stylized-car.scene.ts` was edited by hand (bumper hidden by stable id
`car__bumper`, a native `primitives.cone`, the exported `wheel_spin` clip on loop). Re-running the import with a new
paint parameter rewrote the GLB (sha256 af711baf… to ea5fb0ac…) and `stylized-car.bridge.ts`, kept
`stylized-car.scene.ts` byte-identical, and kept all 24 ids. The regenerated Aura3D frame shows the new blue paint
plus all three edits; `stylized-car.regen.animation-diag.json` shows `activeClip: "mixer:wheel_spin"` on the bridged
actor. Re-running any recipe with unchanged inputs reproduces the same GLB hash (determinism; also asserted in the
unit test).

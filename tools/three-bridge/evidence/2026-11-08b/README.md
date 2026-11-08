# B1 bridge evidence, 2026-11-08 (5.4.0 lane bridge2)

Real GPU: headless Chrome, ANGLE Metal, Apple M4 Max, 960x540, `capture.mjs` with `PAIR_TIME=1` (`capture.json` holds
GPU strings, console output, and the clock and per-clip times per frame). Left = three.js original (`three.html`,
WebGLRenderer, same factory/seed/params), right = bridged Aura3D scene (`aura.html`, the emitted `<name>.scene.ts`).
Branch exp/54b-bridge2 on release/5.3.0 (f89233d2e).

Animated pairs are time-matched. The Aura3D page runs `settle` frames, pauses, and publishes the clock and each
active clip's time. The three.js page then poses every clip at those times (`AnimationMixer`, `?clips=`) and
drives the recipe's shader clock (`?t=`).

| set | recipe | three.js | Aura3D | what it shows |
|---|---|---|---|---|
| first import | windmill (rotor_spin + breeze clips, plain node hierarchy) | `windmill.three.png` | `windmill.aura.png` | rotor at clip time 2.128 s: same blade angle on both sides; report 14 supported, 0 approximated, 0 unsupported |
| first import | shader kiosk (ShaderMaterial orb, RawShaderMaterial backdrop, refused chunk sign) | `shader-kiosk.three.png` | `shader-kiosk.aura.png` | orb fresnel rim, bands at the same clock phase, uv-gradient backdrop with grid; the `#include <common>` sign is hidden on purpose (unsupported row) |
| first import | city block (its neon sign ShaderMaterial was hidden in the prototype) | `city-block.three.png` | `city-block.aura.png` | the sign now renders through `material.custom` with the same pink-to-cyan gradient |
| regen | windmill `--params '{"sail":"#3c6fb0","roof":"#2f4a3a","tower":"#d8d2c4","height":4.8}'` after native edits | `windmill.regen.three.png` | `windmill.regen.aura.png` | new colours and a taller tower from the regenerated GLB, plus the edits in `windmill.scene.ts`: added lantern light, barrel and crate moved by stable id (`nodeTransforms`), flag hidden by id |
| regen-t2 | same, later instant | `windmill.regen-t2.three.png` | `windmill.regen-t2.aura.png` | rotor at clip time 3.980 s against 2.065 s in `regen`: the blades moved, and they match three.js at both instants |

Regeneration: the GLB went from sha256 21f8f937… to 9cd94f64… and `windmill.bridge.ts` was rewritten.
`windmill.scene.ts` stayed byte-identical (`kept: native edits preserved`). All 28 ids were kept (0 added, 0
removed). The three.js side of the regen pairs is the unedited original with the new params, so the lantern,
moved props and missing flag on the right are the native edits, not a bridge difference.

Visible differences (engine-side, not the bridge):
- Aura3D directional shadows are blocky with self-shadow acne on the tower and sails (also seen on the car in
  `../2026-11-08/`).
- The shader kiosk renders with `toneMapping: "none"`, and Aura3D quantises the darkest backdrop values into steps.
  Below about 14/255 the gradient bands, where three.js stays smooth.
- On the city block (ACES output), the sign shader is tone-mapped by Aura3D and not by three.js. The sRGB decode
  keeps the colours close, but the cyan end reads slightly lighter.

# Lane 514: metals and glass visibility (benchmark fix 4)

Branch `lane/514-materials-env`, base `origin/main` e5387f3b0. Real GPU (headless Chrome, Metal, loopback CDP), virtual-clock shim
(`tools/shim.js` from origin/lane/504-bellkeeper), captured by `tools/cap.mjs` under the shared `/tmp/a3d-rea.lock`.

## Diagnosis (from real frames)

1. materials-1: chrome reflected a near-uniform probe (vertical stripes at best), so the sphere had nothing to mirror.
2. Clear glass drew as an opaque white ball: `A3D_QR_MATERIALS_TRANSMISSION` is not on unless a source sets it, so the forward pass logs
   `TRANSMISSION_DEGRADED` and draws without transmission. That, not the probe, is why raising `envMapIntensity` to 2.6 did nothing.
3. Not a tone-mapping or specular-occlusion problem in these frames.

## Change (additive)

- `environments.studio({ preset: "softbox" })`: structured procedural probe, baked deterministically (`tools/environments/bake-softbox.ts`),
  embedded in the package (lazy chunk, no fetch) and shipped as `public/aura-environments/softbox.*` (0.5 MiB). Plain `environments.studio()` and
  `environments.neutral()` untouched.
- `material.studioMetal({ color, roughness })`, `material.studioGlass({ tint, ior, thickness })`: wrap `material.metal` / `material.glass`.
- A scene using a studio material and authoring no `environments.*` node or look binds softbox itself; `createAuraApp` turns transmission on for
  studio glass unless a source set the flag.

## Before/after (frames/)

materials-1 benchmark source (aura r1), only the environment line and two material calls swapped (`m1/before.ts` vs `m1/after.ts`):
`m1-before.png`, `m1-after.png`; helpers with no `environments.*` node: `m1-auto.png` (mean abs diff 0.32 vs `m1-after.png`).
Glass/steel sphere contrast to surrounding backdrop (luma): glass 16.7 -> 26.1, steel 0.3 -> 52.1; steel luma std dev 33.8 -> 67.6 (`tools/roi.mjs`).
materials-3 (`m3/`): gold materials only plus preset swapped. Frame mean abs diff 7.3 vs before.

## Blind judge (`judge/`, tools/agent-eval/judge-visual.mjs rubric, 3 calls per pair, pair = our frame vs the three.js frame of runs r1, r2, r3)

| frame | aura wins | aura mean /25 | three.js mean /25 |
|---|---|---|---|
| materials-1 before | 0/3 | 13.7 | 19.0 |
| materials-1 after | 0/3 | 14.3 | 18.7 |
| materials-3 before | 1/3 | 16.0 | 17.7 |
| materials-3 after | 1/3 and 2/3 (two runs; one call in the first run failed to parse) | 16.5 / 16.7 | 17.5 / 17.7 |

The judge did not flip materials-1: it still prefers the three.js frames (larger, better-framed spheres, stronger floor shading), and the judge
scored "before" materials-1 as having a tinted glass sphere, which the frame does not show; treat the judge as noisy. Gain on the judged score is
about +0.6 on materials-1 and about +0.6 on materials-3, inside the noise.

## Pixel neutrality (`games/`)

Same shim, same frame count, origin/main served on :18515 and this branch on :18514; `baseA` vs `baseB` is the noise floor.
Valid game frames (non-black, real 3D scene): 3 of the attempted 12 games.

| game | base A vs base B | base A vs branch |
|---|---|---|
| top-tennis | 5.54 (animated, unfrozen) | 0 |
| roadster-rush | 0 | 0 |
| slingshot-siege | 0 | 0.0055 (max 44, a handful of pixels) |

The other nine (heatsink, iron-crown, aura-hoops-3d, pips-big-leap, aura-diamond-3d, aura-links-3d, aura-fc-3d, cross-hop, dot-dash-3d, bunker-zero)
rendered only the HUD over a black canvas on this loaded machine (3D assets never finished loading), so their 0 diffs are not evidence and
are NOT counted (`games/invalid-black/` shows three). The 5-game requirement is NOT met by pixels.
Code-level argument: no live game calls `studioMetal`, `studioGlass` or `preset: "softbox"` (new APIs); the only edits on shared paths are
a scene-scan that returns the same node list when no studio material is present, `qrFlagsWithStudioGlass(flags, false)` which returns the same
object, and an `EnvironmentCache` branch for the new `softbox` key.

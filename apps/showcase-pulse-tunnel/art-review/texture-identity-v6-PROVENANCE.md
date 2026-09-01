# Pulse Tunnel texture/identity V6 candidate provenance

Status: **isolated and rejected before shared registration/live-route integration**.

## Authorship and license

- Builder: `apps/showcase-pulse-tunnel/scripts/build-texture-identity-v6.py`
- Builder SHA-256: `e9bcee25f2c079f27dc809f44df351431f2986f81774649e18304909f1906c0d`
- Author: Aura3D route-local synthesis
- License: CC0-1.0
- Source inputs: fixed numeric geometry, fixed material parameters, and three
  stdlib-generated procedural RGBA PNGs. There are no downloaded, cross-game,
  or third-party model inputs.
- Shared catalog/public blobs: untouched. These bytes remain under
  `apps/showcase-pulse-tunnel/art-review/assets/texture-identity-v6/`.

## Exact candidate artifacts

| Artifact | SHA-256 | Bytes | Bounds | Contents |
| --- | --- | ---: | --- | --- |
| `pulsePhaseMantaV6.candidate.glb` | `df01caa46aec41c038ab5371e4a15139a82c3b6c478329ff0afe180a9544de25` | 1,239,812 | 3.890×0.950×3.700 | 26 meshes, five materials, embedded deterministic runner panel texture |
| `pulseCathedralSentinelV6.candidate.glb` | `4fbbaa37232414a29475b22fe5e3cd222ae398bd4990575e56e96fca5628b4ba` | 1,806,088 | 5.142×2.561×2.785 | 41 meshes, five materials, embedded deterministic threat-chevron texture |
| `pulseBraidedReactorWorldV6.candidate.glb` | `eaab715521053a6977a0285d307e63a0205f47d29aa3408bec08c4bb4148a140` | 2,283,816 | 9.398×4.730×15.580 | 62 meshes, six materials, embedded deterministic reactor-deck texture |

Procedural texture SHA-256 values:

- `runner-panel.png`: `be6260540bf4e6d5ac73f1434302ec0c4f7e1e83e8a7d90b3d5a6a6e0a0c193d`
- `sentinel-chevron.png`: `7174de3e326bd2c9b44685b0df337b8b8ce744f520dd02bfdaa8ee9d0b86240e`
- `reactor-deck.png`: `01517aec9b188a0c36c5f750450024654737335a0b76039b20ffbd278ee777db`

## Reproducibility and focused gates

Blender's stock exporter was explicitly rejected after it changed accessor
counts and GLB bytes between identical V6 runs. The retained builder instead
uses a canonical route-local GLB writer: object/material sorting, fixed
triangulation traversal, 1e-3 display-subpixel attribute quantization,
canonical JSON serialization, fixed embedded PNG streams, and deterministic
primitive joints. Two clean independent Blender 5.2.1 processes produced
byte-identical hashes for all three GLBs and all three PNGs.

- App TypeScript: pass (`pnpm exec tsc -p apps/showcase-pulse-tunnel/tsconfig.json --noEmit`).
- Focused unit suite: pass, 22/22 (`tests/unit/apps/pulse-tunnel-clock.test.ts`).
- App build: pass (`pnpm --dir apps/showcase-pulse-tunnel build`).
- Isolated review page: `art-review/pulse-texture-identity-v6.html`.
- Final audition PNG: `art-review/output/pulse-texture-identity-v6-staging.png`,
  SHA-256 `2753119d07661a316c64416d5879ad5b86e44f1a785137135b3f617c0b3696e2`.

## Honest visual verdict

V6 fixes the provenance/rebuild problem, removes cross-game identities, gives
the runner a distinct black-ceramic/cyan phase-manta silhouette, makes the
sentinel an original many-limbed threat family, and enlarges the causal cyan
bolt/red cutting-pulse exchange. It still does **not** clear the visual gate.
In the safe-basic exact, the procedural textures are too subtle, the broad
world surfaces still read as flat purple/blue fields, the runner is dark and
weakly grounded, and the sentinel's authored geometry collapses into an
abstract horizontal silhouette at encounter distance. The scene remains well
behind the Furi comparator's immediately legible hero/boss opposition,
lighting, impact hierarchy, and production material finish.

Therefore V6 must not be registered, promoted, or used to replace the current
typed route. Pulse Tunnel remains **`reference`**. The canonical route and all
gameplay/sync evidence remain untouched.

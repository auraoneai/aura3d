# Pixel receipt: crowd-kit (GU47 E-H, PRD WP-8)

The crowd kit (`packages/engine/src/instances-model/CrowdKit.ts`) bakes a skinned GLB clip into a few static pose meshes
on the CPU and draws a crowd as one instanced node per pose, with per-spectator colour, clip phase and held pose index.
Acceptance (PRD WP-8): 480 instanced spectators in at most 4 draws with per-instance colour and clip phase.

Written by `tests/browser/gu47/crowd-kit.spec.ts` (harness `tests/browser/gu47/crowd-kit-harness.ts`, page
`tests/browser/gu47/crowd-kit.html`) on the remote runner (software WebGL2, SwiftShader, 640x360,
`qualityProfile: "production"`) in GU47 phase 2. Not run in phase 1; the draw plan, the skinning math and the phase
stepping are unit-tested in `tests/unit/gu47/eh/crowd-kit.test.ts`.

Scene: a 12-row x 40-seat stepped stand (480 seats), ground plane, hemisphere plus a shadowed sun. The spectator is the
Khronos CesiumMan sample (skinned, one walk clip) baked into 4 poses at 1.7 m.

Checks (all must pass before `<version>.json` and the frames are written):

| check | threshold |
| --- | --- |
| clean runtime, every frame drew | no `diagnostics().errors`, `drawCalls > 0` |
| kit plan | 480 spectators, `drawPlan().draws <= 4` |
| draw-call delta, crowd (castShadow off) over the empty stand | 1..4 |
| crowd visible: changed pixels in the stand crop | >= 2% |
| per-instance colour: palette hues present in the stand crop (>= 0.2% of crop pixels each) | >= 3 of 4 |
| clip-phase motion: changed stand pixels one loop frame later | >= 0.3% |
| one `crowd.update` call | <= 1 ms |

Logged, not gated: the shadowed crowd's draw-call delta (each pose node also draws once per shadow cascade) and
triangles per spectator.

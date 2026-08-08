# ADR 0009: Runtime descriptors cannot claim capabilities

- **Date:** 2026-08-08
- **Status:** accepted
- **Workstream:** WS-2.6

## Decision

Public runtime packages may contain implemented runtime behavior, public data
contracts consumed by implemented behavior, or typed evidence derived from
mounted behavior. Deterministic sample objects whose boolean fields merely say
a capability exists are test fixtures, not runtime features. They must move to
tests or be deleted after R8 proof. If a `*Fixtures` module contains a useful
algorithm, extract only that algorithm under an honest runtime name.

The first applied case removes `InputActionBindingFixtures`: the real
`processInputValue` algorithm moves to `InputValueProcessors`, while the sample
object that asserted action/rebinding parity is deleted.

The asset batch removes `AssetBundleCacheFixtures` and `SceneAnalysisFixtures`.
The asset viewer now reports only behavior it actually mounts: glTF loading,
dependency resolution, inspection, render-resource creation, texture decoding,
material variants, morph targets, animation controls, and captured WebGL pixels.
It no longer turns deterministic metadata into cache, computer-vision,
segmentation, detection, tracking, or pose capability claims.

The audio batch removes three deterministic descriptor generators for adaptive
music, spatial-environment calculations, and mastering-analysis telemetry. The
selected direct Web Audio owner, its real node graph, lifecycle, source/bus
state, spatial panner, codec selection, browser unlock, and Chrome/WebKit
evidence remain. The game slice no longer publishes synthetic mixer, reverb,
occlusion, Doppler, or spectrum metrics as mounted behavior.

The scripting batch removes eight deterministic descriptor generators for
difficulty, replication, cultural behavior, learning agents, player analytics,
procedural adaptation, cloud services, and analytics privacy. Aura3D continues
to ship executable behavior trees, state machines, GOAP, HTN, utility AI,
perception, and lifecycle hooks as an optional compatibility package. The game
slice no longer advertises simulated SaaS, networking, ML, or analytics objects
as runtime integrations.

The physics batch removes seven deterministic descriptor generators for a
platformer controller, sandbox catalog, cloth, soft-body, fracture, fluid, and
volumetric fire/smoke simulations. Those modules calculated plausible-looking
counts and set capability booleans, but they did not step or render the solvers
they named. Aura3D retains its executable first-party rigid-body world, contacts,
constraints, queries, scene bridges, debug rendering, browser-tested physics
sandbox, and the optional Rapier adapter. Cloth, soft-body, fracture, fluid, and
volumetric fire/smoke remain unclaimed until executable runtime and browser
evidence exists.

The input/animation batch removes synthetic gesture/haptics, XR, and
motion-matching descriptors. The gesture object never received browser pointer
events or drove an actuator; the XR object never requested a session or consumed
an XR frame; and the motion-matching object generated its own miniature pose
database without applying the selected pose to a skeleton. Aura3D retains its
real gesture recognizer, touch joystick, recording/playback, WebXR session
controller, animation mixer, skinning, IK, and their direct tests. Claims for
haptic delivery, headset behavior, hand/eye tracking, foveation, and
motion-matching remain unavailable until mounted evidence proves them.

The editor/rendering batch removes the hard-coded localization/accessibility
audit object and simulated BVH/Hi-Z culling telemetry. Neither changed the
mounted editor or the renderer's submitted draw list. Architectural lighting,
architectural measurement, space-environment, voxel-world, and weather
generators are retained because their outputs are consumed by mounted examples;
they move to honest runtime filenames and symbols, and historical-source,
blocked-claim, and self-certifying metadata is removed. The large-world route
now reports its real CPU distance visibility/LOD decisions and rendered
weather/voxel accents, without claiming a BVH or GPU occlusion pipeline.

## Evidence

`tests/reports/public-runtime-descriptor-inventory/report.json` is the complete
classification and migration queue. Per-file deletion reports are retained for
each cleared batch.

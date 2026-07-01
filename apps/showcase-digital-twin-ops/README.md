# Digital Twin Operations

Digital Twin Operations is a standalone Aura3D enterprise factory/control-room
showcase. It uses a typed robotic welding workcell asset inside a grounded
inspection cell with a bounded HMI wall, sensor posts, workpieces,
deterministic telemetry, and control-room UI.

## Remediation Status

- Classification: release-ready candidate; the typed robotic welding workcell
  passes live route-primary and deploy proof.
- Route health: `apps/showcase-digital-twin-ops/route-health.json`.
- Asset status: `assets.showcaseRoboticWeldingWorkcell` is the typed primary
  industrial visual asset. The original 34 MB Objaverse GLB was optimized to a
  20 MB release-safe GLB while preserving the enclosed workcell composition,
  and the optimized hash is bound to retained release-probe evidence.
- Rejected asset: `assets.showcaseOrangeIndustrialRobot` was removed from the
  live primary path after visual review rejected the two-robots-on-slab
  composition as not credible for a public digital-twin demo.
- Rejected asset: `assets.showcaseAssemblyLine` was removed from the live
  primary path after retained route-primary evidence marked it clipped.
- Primitive status: lightweight floor, route markers, selected-zone ring, and
  workpiece cues are supporting set dressing around the typed workcell. They do
  not replace the primary industrial asset.
- Claim status: bounded to deterministic sample telemetry and visual operations
  dashboard behavior. It must not claim real facility data, PLC integration,
  validated safety logic, or production digital-twin integration.

## Controls

- Mode buttons: Normal, Maintenance, Incident.
- Zone buttons: Assembly, Packaging, Energy, Dock.
- Actions: Inject Alert, Clear Alerts, Focus Zone.
- Orbit interaction inspects the Aura3D factory layout.

## Evidence

The route publishes `window.__AURA3D_SHOWCASE_DIGITAL_TWIN_OPS__`.

The evidence object includes route status, `appId`, simulation state, controls,
systems, procedural status, deterministic telemetry, motion proof, event log,
runtime node IDs, and claim boundary. The live route uses public
`createAuraApp(...)`, `game.runtimeNode(...)`, runtime node mutation, typed
`model(assets.showcaseRoboticWeldingWorkcell)`, labels, lights, effects, and
camera presets from `@aura3d/engine`.

The visible robotic welding workcell is a typed GLB asset. The selected zone,
small workpiece cues, and motion indicators are Aura3D scene/runtime nodes.
CSS is limited to telemetry, console layout, buttons, and panels; it is not
used for fake factory geometry, movement, scanlines, or scene overlays.

## Claim Boundary

This is a bounded showcase candidate. It demonstrates deterministic
browser-side operations dashboard behavior and procedural factory staging with
current route-primary and deploy evidence; it does not claim PLC integration,
real plant connectivity, validated safety logic, or production digital-twin
integration.

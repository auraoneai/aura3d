# Aura3D Showcase - Smart City Control

Standalone showcase app for a city-scale command center. The route is built
with public `@aura3d/engine` APIs and combines a procedural city scene kit with
one release-validated typed command vehicle primary asset.

## Remediation Status

- Classification: bounded release-ready candidate.
- Route health: `apps/showcase-smart-city-control/route-health.json`.
- Asset status: `assets.showcaseCityVehicle` passes retained route-primary
  evidence and release/deploy validation as the primary command vehicle.
  The city itself remains procedural.
- Primitive status: district masts, overlays, city blocks, telemetry cues, and
  command visuals are procedural supporting context.
- Claim status: bounded to sample city-control telemetry and typed vehicle
  presentation. It must not claim GIS data, traffic simulation fidelity,
  production digital-twin/control behavior, or an asset-backed city-scale
  flagship.

## Source Anchors

- `sceneKits.cityBlock(...)` for the city base, streets, buildings, windows, props, and day/night state.
- `city.visualQA(...)` and `city.instancing(...)` for city-specific QA and repeated-family evidence.
- `primitives.*`, `labels.*`, `lights.*`, `effects.*`, `interactions.*`, `camera.*`, and `timeline.*` for district overlays, traffic/data pulses, telemetry labels, day/night controls, and flythrough modes.

## Controls

- District: All, Core, North, Harbor, Industrial.
- Camera: Command, Overview, Street, Flythrough.
- Day/Night: toggles operations lighting and scene-kit day/night state.
- Traffic: toggles live or throttled traffic pulse state.
- Alert Level: updates telemetry, district mast height, and evidence state.

## Evidence

The route publishes `window.__AURA3D_SHOWCASE_SMART_CITY_CONTROL__` with:

- `status`
- `appId`
- `frameCount`
- `interactionState`
- `controls`
- `systems`
- `claimBoundary`
- `telemetry`
- `diagnostics`

Claim boundary: this is a procedural Aura3D public API showcase using city scene kits, visual QA, instancing evidence, procedural overlays, labels, controls, and runtime telemetry. It does not claim real GIS data, external assets, or traffic simulation fidelity.

## Asset Strategy

The route uses one typed `model(assets.showcaseCityVehicle)` command vehicle as
the route-primary hero. The city, overlays, traffic pulses, labels, and
telemetry cues are procedural Aura3D scene nodes.

## Release Evidence

- Route-primary probe: `tests/reports/showcase-route-primary-probes/showcase-smart-city-control.json`.
- Route-primary screenshot: `tests/reports/showcase-route-primary-probes/showcase-smart-city-control.png`.
- Release asset probe: `tests/reports/showcase-release-asset-probes/showcaseCityVehicle.json`.
- Release asset screenshot: `tests/reports/showcase-release-asset-probes/showcaseCityVehicle.png`.
- Deploy/release check: `checkDeploy` with `--release --source apps/showcase-smart-city-control/src --asset showcaseCityVehicle` passes with no failures or warnings.

## Local Route

Run the root Vite dev server and open:

```bash
pnpm exec vite --host 127.0.0.1
```

```text
http://127.0.0.1:5173/apps/showcase-smart-city-control/
```

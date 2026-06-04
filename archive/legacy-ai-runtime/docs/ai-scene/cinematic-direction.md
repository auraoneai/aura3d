# Cinematic Direction

Version: 0.1.0

The cinematic director turns creative language into camera, lighting, timeline, VFX, and look plans.

## Current Surface

- `createCinematicDirector()`
- `planCameraFromLanguage()`
- `planLightingFromMood()`
- `planShotTimeline()`
- `planVFXFromMood()`

The planner is deterministic and suitable for CI. It does not replace a film director or offline renderer; it creates realtime previs intent that Aura3D routes can render and inspect.

## Verification

```sh
pnpm ai-scene:cinematic
```

The report is written to `tests/reports/ai-scene/cinematic-scene-report.json`.

# Aura Scene IR

Version: 0.1.0

`AuraSceneIR` is the structured scene format that turns model output into something Aura3D can validate, compile, render, inspect, patch, and export.

## Required Shape

The current schema version is `aura-scene-ir/1.0`. The core fields are:

- `sceneId`, `title`, `brief`, and `mood`
- `environment`
- `objects` and `characters`
- `materials`
- `lighting`
- `cameras`, `shots`, and `timeline`
- `vfx`, `physics`, and `audio`
- `assetRequirements`
- `backendPreference`
- `qualityTarget`
- `unresolved`
- `provenance`

## Validation

Use `validateAuraSceneIR(input)` before compiling generated model output. Validation errors are structured diagnostics with a path, code, severity, message, and fix suggestion.

## Quality Targets

`qualityTarget` uses the ladder from `L0` to `L5`. The first product target is `L3-cinematic-realtime`: a visible realtime scene with camera, lighting, materials, timeline, diagnostics, and screenshots.

## Evidence

Run:

```sh
pnpm ai-scene:schema-audit
```

The report is written to `tests/reports/ai-scene/scene-ir-schema-audit.json`.

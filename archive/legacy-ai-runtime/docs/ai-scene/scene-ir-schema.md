# Scene IR Schema

Version: 0.1.0

`AuraSceneIR` is the contract between AI language understanding and the Aura3D runtime. Models may propose it, but Aura3D owns the schema, validation, migration, and diagnostics.

## Required Top-Level Shape

An `AuraSceneIR` document should include:

- `schemaVersion`: stable version such as `0.1.0`.
- `sceneId`: stable scene identifier.
- `title`: short human-readable scene name.
- `intent`: source prompt summary and creative goal.
- `qualityTarget`: `L0`, `L1`, `L2`, `L3`, `L4`, or `L5`.
- `environment`: world setting, mood, time of day, atmosphere, ground, and background.
- `objects`: props, products, set pieces, draft artifacts, and semantic tags.
- `characters`: character or creature requests, including draft artifact status.
- `materials`: material intents, textures, approximations, and unsupported properties.
- `lights`: light rigs, environment lighting, color, intensity, and cinematic role.
- `cameras`: camera definitions, lenses, framing, movement, and controls.
- `shots`: shot timeline with start/end time, camera, subject, and movement.
- `timeline`: animation, VFX, audio, and physics cues.
- `vfx`: particles, fog, glow, weather, sprites, and postprocess intent.
- `physics`: supported primitives or diagnostics for unsupported physics requests.
- `assetRequirements`: requested assets, semantic tags, and resolution priority.
- `backendPreference`: `webgl2`, `webgpu`, or `auto`.
- `unresolved`: missing or unsupported items.
- `provenance`: provider, model, prompt hash, generated time, and patch history.

## Stable IDs

Objects, characters, cameras, lights, shots, materials, and timeline cues need stable IDs. Patches should target IDs, not array positions or display names.

Recommended prefixes:

- `scene_`
- `object_`
- `character_`
- `material_`
- `light_`
- `camera_`
- `shot_`
- `cue_`
- `asset_`

## Validation Errors

Validation should report:

- `path`: JSON path to the invalid field.
- `code`: machine-readable error code.
- `severity`: `error`, `warning`, or `info`.
- `message`: concise human-readable issue.
- `suggestion`: concrete fix when possible.

Example:

```json
{
  "path": "$.shots[0].cameraId",
  "code": "CAMERA_NOT_FOUND",
  "severity": "error",
  "message": "Shot references camera_hero, but that camera does not exist.",
  "suggestion": "Create camera_hero or update the shot cameraId."
}
```

## Schema Migration

Every schema version should be migratable forward. Migration may add defaults, normalize old fields, or move deprecated fields into `provenance.migrations`. It must not silently drop creative intent.

## Example Quality Target

```json
{
  "schemaVersion": "0.1.0",
  "sceneId": "scene_greenhouse_robot",
  "title": "Greenhouse Discovery",
  "qualityTarget": "L3",
  "backendPreference": "auto",
  "intent": {
    "prompt": "A tiny robot discovers a glowing flower inside an abandoned greenhouse at sunrise.",
    "mood": ["emotional", "hopeful", "cinematic"]
  }
}
```

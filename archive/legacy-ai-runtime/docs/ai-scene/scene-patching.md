# Scene Patching

Version: 0.1.0

Scene patching enables conversational edits after the first scene is generated. A patch modifies validated `AuraSceneIR` by stable IDs and produces a new validated scene state.

## Patch Flow

```text
edit prompt -> provider adapter -> AuraScenePatch -> validate -> apply -> validate IR -> compile -> render
```

The provider may propose a patch, but Aura3D owns patch validation and application.

## Supported Patch Areas

Initial AI scene patches should support:

- object transforms: position, rotation, scale;
- material changes: color, roughness, metallic, emissive, transparency intent;
- light changes: intensity, color, position, role;
- camera changes: position, target, lens, height, movement;
- VFX changes: fog density, particle count, glow strength, weather intent;
- timeline changes: shot duration, camera movement, cue timing;
- asset replacements: requested asset ID or semantic requirement.

## Example

```json
{
  "patchId": "patch_more_fog_lower_camera",
  "targetSceneId": "scene_greenhouse_robot",
  "operations": [
    { "op": "set", "path": "$.vfx.fog.density", "value": 0.45 },
    { "op": "set", "path": "$.cameras.camera_hero.height", "value": 0.8 },
    { "op": "scale", "path": "$.objects.robot_01.scale", "value": [0.65, 0.65, 0.65] }
  ]
}
```

## Validation Rules

- Patches must target existing stable IDs unless creating a new object explicitly.
- Patches must declare the originating prompt or patch provenance.
- Invalid paths should produce structured errors.
- Unsupported edits should produce diagnostics rather than hidden no-ops.
- Applied patches should be appended to scene provenance.

## Diff Output

After applying a patch, Aura3D should be able to report:

- changed fields;
- added/removed nodes;
- new draft artifacts;
- changed backend requirements;
- changed export readiness;
- warnings and blocked edits.

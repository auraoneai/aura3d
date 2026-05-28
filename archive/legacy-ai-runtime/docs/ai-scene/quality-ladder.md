# Quality Ladder

Version: 0.1.0

The AI scene runtime should describe quality levels explicitly. This prevents overclaiming and gives users a concrete path from schema proof to production handoff.

| Level | Name | Meaning |
|---|---|---|
| L0 | Schema proof | Prompt becomes valid `AuraSceneIR`; rendering is not required. |
| L1 | Primitive previs | Scene compiles into primitives, layout, lights, cameras, and timeline. |
| L2 | Asset-backed previs | Scene resolves local GLB assets and uses visible placeholders for missing assets. |
| L3 | Cinematic realtime | Camera, lighting, materials, VFX, timeline, screenshots, and route gates pass. |
| L4 | Production handoff | Scene exports IR, screenshots, diagnostics, asset provenance, and patch history. |
| L5 | Studio-grade extension | External asset generation, DCC handoff, advanced rigs, and offline render bridges exist. |

## First Release Target

The first serious AI scene release should target L3.

Minimum L3 evidence:

- nonblank rendered route;
- valid scene IR;
- deterministic mock provider path;
- asset resolver report;
- placeholders clearly labeled;
- camera and lighting plan;
- timeline duration;
- screenshot/export artifact;
- diagnostics for unsupported or approximated requests.

## Promotion Rules

A scene can move up the ladder only when evidence exists for that level. A single nice screenshot does not promote the whole AI scene system.

## Quality Diagnostics

Every scene report should include:

- requested quality level;
- achieved quality level;
- blockers to next level;
- unresolved assets;
- approximated materials/VFX/physics;
- backend capability notes;
- route and screenshot evidence when applicable.

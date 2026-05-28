# Scene Compiler

Version: 0.1.0

The scene compiler turns `AuraSceneIR` into an executable Aura3D runtime scene. It should not call an LLM. It consumes already-structured scene intent and emits runtime objects, diagnostics, and export metadata.

## Inputs

- Valid or validate-ready `AuraSceneIR`.
- Asset resolver.
- Material, environment, camera, lighting, timeline, VFX, and physics planners.
- Backend policy: `webgl2`, `webgpu`, or `auto`.
- Quality target.

## Outputs

- Aura3D render source or scene graph.
- Resolved assets and placeholder assets.
- Runtime cameras, lights, materials, and animation cues.
- Diagnostics for approximations, unsupported items, and unresolved requests.
- Export bundle metadata.

## Compile Stages

1. Validate the IR.
2. Resolve assets and placeholders.
3. Build environment and world scale.
4. Place objects and characters.
5. Compile materials or approximations.
6. Build lighting and environment settings.
7. Build camera plan and controls.
8. Build shot timeline.
9. Compile VFX cues into supported runtime effects or explicit diagnostics.
10. Compile physics cues into supported primitives or explicit diagnostics.
11. Select backend and emit backend reason.
12. Emit runtime scene, diagnostics, and export metadata.

## Compiler Diagnostics

Compiler diagnostics should include:

- `selectedBackend`;
- `backendReason`;
- `objectsCompiled`;
- `assetsResolved`;
- `placeholdersUsed`;
- `materialsApproximated`;
- `vfxApproximated`;
- `physicsApproximated`;
- `unsupportedFeatures`;
- `warnings`;
- `errors`;
- `exportReady`;

## Render Independence

Compiled scenes must render without a live model connection. The provider can be offline after the IR is produced. This keeps CI, route health, replay, and export deterministic.

## Failure Boundary

If the compiler cannot produce a renderable scene, it should return a structured failure with diagnostics. It should not produce a blank canvas or silently hide unresolved assets.

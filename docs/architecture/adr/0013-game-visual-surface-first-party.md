# ADR 0013: Game-library visual surface ships as first-party subsystems owned by existing packages

- **Date:** 2026-09-05
- **Status:** accepted
- **Workstream:** muse3jsparity (PRD parts A–V)

Records the decision already landed in `c150a391` ("new package sources for games
pass"): the three.js-parity game surface — camera rigs, game feel, decals, SDF
text, volumetric fog, native bloom, spot shadows, water/sky/terrain, particle
modules, animation builders, audio game layer, input processors, compat ledger —
is implemented as first-party source owned by the existing packages
(`@aura3d/rendering`, `@aura3d/engine` agent-api, `@aura3d/audio`,
`@aura3d/controls`, `@aura3d/input`, `@aura3d/materials`,
`@aura3d/editor-runtime`, `@aura3d/scripting`, `@aura3d/three-compat`) rather
than delegated to external libraries or vendored `three/examples` code.
Acceptance checkpoint is the 3.0.0 release gate (K2) plus human release review;
a reviewer who disagrees supersedes this record per the naming rule.

## The four R11 questions

1. **Does Three.js already solve this?** The underlying techniques, yes; the
   product, no. Three ships bloom/CSM/planar reflection/SDF-adjacent text only
   as `three/examples` starting points with no ownership, no typed assets, and
   no evidence chain. The parity program's claim is an agent-authorable game
   API (`effects.*`, `game.*`, `decals`, `labels`) where every visual has a
   typed asset and a browser receipt — examples code cannot provide that
   contract, and the repo bans raw `three/examples` imports in public routes.
2. **Does another mature ecosystem library solve this?** Only in pieces, each
   of which would add a second owner: postprocessing libs own their own
   pass graph, troika owns its own text pipeline, Howler would duplicate the
   audio context ADR 0006 already rejected. Each piece would break the
   single-owner-plus-evidence contract the release gates enforce.
3. **Does this create lasting differentiation for Aura3D?** The algorithms do
   not; the integrated surface does. Nobody else offers prompt-to-game routes
   where camera rigs, game feel, particles, decals, and crowds compose through
   one typed API with per-route browser proof.
4. **Does this belong above or below the public API?** Both, split by package:
   agent-authorable builders live above it in `engine/src/agent-api/`
   (`GameCameraRigs`, `GameFeel`, `Decals`, `NavigationCrowds`, `Scatter`,
   animation builders); runtime capability lives below it in the owning
   package (`rendering` owns all passes/materials/geometry, `audio` owns
   mixing, `controls`/`input` own their layers). No package reaches into
   another's runtime; the agent-api composes owners, consistent with ADR 0010.

## Decision

Keep the 45 sources listed below as first-party subsystems in their owning
packages. Do not replace them with `three/examples` vendoring or new external
dependencies. New game-surface subsystems follow the same split: builders in
the agent-api, runtime in the owner package, receipts in `tests/browser`.

Covered sources: `audio/{Footsteps,GameMixer,PositionalEmitter}`,
`controls/{ArcballControls,FocusFrame,HoverOutline}`,
`editor-runtime/RootEditorSurface`,
`engine/agent-api/{AnimationDebugOverlay,AnimationMixerBuilders,AssetDecoders,Decals,FootPlanting,GameCameraRigs,GameFeel,LabelTelemetry,NavigationCrowds,Scatter}`,
`engine/{instances-model/InstancedModel,material-physical/PhysicalMaterialSpec}`,
`input/{ComboDetector,Haptics,TouchLayouts}`,
`materials/GameReadyMaterialLibrary`,
`rendering/{AtmosphereWetness,DayNightSky,EnvironmentPresetPack,InstancingDiagnostics,OceanSurface,PlanarReflection,SdfText,SpriteFlipbook,TerrainTiles,VolumetricFog,WaterSurface}`,
`rendering/effects/{HeightfieldModule,LightingModule,SubEmitterModule,TurbulenceModule}`,
`rendering/{postprocess/NativeBloomPyramid,production-runtime/passes/FramegraphTopology,shadows/CascadeHysteresis,shadows/SpotShadowMaps,webgpu/WebGPUPostShaders}`,
`scripting/VisualScriptingRoot`,
`three-compat/{ApproximationLedger,migration/R3fMigration}`.

## Consequences

- These paths are permanently maintained first-party surface; removal must go
  through superseding ADR, not silent deletion.
- No new runtime dependency was introduced by this decision (Rapier/Recast
  remain optional peers under ADRs 0004/0005).
- The R11 gate passes these paths by registry mapping; any *further* source
  addition still fails until its own record lands.

## Evidence

- `git show --stat c150a391` (56 files, 9526 insertions, zero new dependencies).
- K2 readiness `tests/reports/muse3jsparity/readiness.json` (overall `supersede`
  on the release commit) plus per-part browser receipts in `tests/reports/`.
- Ownership single-selected per capability in
  `tools/final-subsystem-ownership/index.mjs` output.

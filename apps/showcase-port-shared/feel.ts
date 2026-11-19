/**
 * Shared 120/144 Hz feel, real-time hit-stop, camera trauma/FOV kick, and procedural WebAudio SFX kit. Since 5.7.0 it
 * lives in `@aura3d/engine/game` (`createImpactRig`, `createProceduralSfx`); this module re-exports it under the names
 * the games already import.
 */
export { createImpactRig, createProceduralSfx } from "@aura3d/engine/game";
export type { ImpactRig, ImpactRigOptions, ImpactRigTrigger, ImpactRigFrame, ProceduralSfx, ProceduralSfxCue as ProceduralCue } from "@aura3d/engine/game";

/** 5.7.0 feel kit: hit-stop rig, procedural SFX, screen fx, score popups, seeded RNG and procedural VFX sheets. */
export { createImpactRig } from "./impactRig";
export type { ImpactRig, ImpactRigOptions, ImpactRigTrigger, ImpactRigFrame } from "./impactRig";
export { createProceduralSfx } from "./proceduralSfx";
export type { ProceduralSfx, ProceduralSfxCue } from "./proceduralSfx";
export { ScreenFx, flashStrength, vignetteOpacity, REDUCED_FLASH_CAP } from "./screenFx";
export { drainPopups, POPUP_LIMIT } from "./popups";
export type { ScorePopup } from "./popups";
export { GameRng } from "./rng";
export { createFlipbookAtlas, createGradingLut } from "./vfxSheets";
export type { FlipbookKind, FlipbookAtlasSpec, GradingLutPreset, GradingLut } from "./vfxSheets";

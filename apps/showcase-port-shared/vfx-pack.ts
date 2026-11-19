/**
 * Procedural RGBA8 `texture.data` VFX sprite-sheet flipbooks (8x4 = 32 frames, 384x192) and strip grading LUTs. Since
 * 5.7.0 they live in `@aura3d/engine/game` (`createFlipbookAtlas`, `createGradingLut`); this module re-exports them
 * under the names the games already import.
 */
export { createFlipbookAtlas, createGradingLut } from "@aura3d/engine/game";
export type { FlipbookKind, FlipbookAtlasSpec, GradingLutPreset, GradingLut } from "@aura3d/engine/game";

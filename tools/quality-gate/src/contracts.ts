/**
 * C-32 — VisualReview rubric and judgement schema (CONTRACTS.md). Provider: PRD 12.
 * Re-exported from tools/quality-gate/src/types.ts.
 */

export const GAME_VISUAL_CATEGORIES: readonly string[] = [
  "environment_world",
  "modeling_assets",
  "texture_quality",
  "material_quality",
  "pbr_credibility",
  "lighting",
  "shadows",
  "ambient_lighting",
  "ibl_reflections",
  "tone_mapping",
  "color_management",
  "anti_aliasing",
  "postprocessing",
  "vfx",
  "particles",
  "animation_quality",
  "character_presentation",
  "camera",
  "composition",
  "scale_depth_perception",
  "atmospheric_effects",
  "gameplay_readability",
  "ui_hud",
  "typography",
  "polish_juice",
  "mobile_presentation",
  "overall_visual_quality"
];
export const GAME_NONVISUAL_CATEGORIES: readonly ["sound_audio", "controls", "physics_feel", "game_feel", "loading_transitions", "performance"] = ["sound_audio", "controls", "physics_feel", "game_feel", "loading_transitions", "performance"];
export type GameVisualCategory = (typeof GAME_VISUAL_CATEGORIES)[number];
export interface JudgeIdentity { readonly kind: "human" | "vision-model"; readonly id: string; readonly model?: string; }
export interface BenchmarkJudgement { readonly sceneId: string; readonly round: string; readonly judge: JudgeIdentity; readonly aura: number; readonly three: number; readonly categories: Readonly<Record<string, number>>; readonly observations: readonly string[]; readonly rubricPromptVersion: string; }
export interface GameJudgement { readonly gameId: string; readonly round: string; readonly judge: JudgeIdentity; readonly scores: Readonly<Record<GameVisualCategory, number>>; readonly observations: readonly { readonly category: GameVisualCategory; readonly seen: string }[]; readonly captureRunId: string; readonly rubricPromptVersion: string; }
export interface PanelRoundRecord { readonly round: string; readonly date: string; readonly commit: string; readonly captureRunId: string; readonly qrFlags: readonly string[]; readonly judges: readonly JudgeIdentity[]; readonly benchmark: readonly BenchmarkJudgement[]; readonly games: readonly GameJudgement[]; }
export type GateVerdict = "pass" | "regression" | "reference-gap" | "admitted-loss" | "calibration-broken" | "non-discriminating" | "mask-misaligned" | "forbidden-capture-flag" | "blocked-runner" | "capture-failed";
export const RUBRIC_PROMPT_VERSION: string = "rubric-v1-qr0";

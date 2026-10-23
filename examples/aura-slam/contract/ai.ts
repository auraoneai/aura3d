import type { ActorState, BallState, Difficulty, MatchState, ShotPreset, StrokeKind } from "./sim";

/** Per-difficulty CPU tuning, verbatim from match-engine.js `levels`. */
export interface DifficultyLevel {
  readonly speed: number; readonly delay: number; readonly error: number; readonly miscue: number;
  readonly reach: number; readonly maxHitZ: number; readonly humanReach: number; readonly paceRelief: number;
}
export const DIFFICULTY_LEVELS: Readonly<Record<Difficulty, DifficultyLevel>> = {
  beginner: { speed: 0.95, delay: 0.22, error: 0.2, miscue: 0.13, reach: 0.215, maxHitZ: 0.68, humanReach: 0.28, paceRelief: 0.23 },
  club: { speed: 1.04, delay: 0.2, error: 0.12, miscue: 0.085, reach: 0.22, maxHitZ: 0.72, humanReach: 0.255, paceRelief: 0.1 },
  ace: { speed: 1.18, delay: 0.14, error: 0.065, miscue: 0.055, reach: 0.22, maxHitZ: 0.76, humanReach: 0.255, paceRelief: -0.035 },
  pro: { speed: 1.26, delay: 0.14, error: 0.065, miscue: 0.055, reach: 0.22, maxHitZ: 0.76, humanReach: 0.255, paceRelief: -0.035 },
  legend: { speed: 1.28, delay: 0.11, error: 0.04, miscue: 0.025, reach: 0.22, maxHitZ: 0.76, humanReach: 0.255, paceRelief: -0.045 },
};

/** What the CPU decides at each rally contact (chooseAIShot / aiShotPlan / proShotPlan / legendShotPlan in the source). */
export interface AiShotPlan { readonly name: string; readonly shot: ShotPreset; readonly targetX: number; readonly pace: number; readonly net: boolean }
export interface AiReadContext { readonly state: Readonly<MatchState>; readonly actor: Readonly<ActorState>; readonly ball: Readonly<BallState>; readonly stroke: StrokeKind }

/** AI is a pure function of the sim snapshot plus the deterministic `seeded` draw stream: no hidden clocks or Math.random. */
export interface AiController {
  /** Movement target for this step (moveAI / scheduleAIRead / aiRecoveryTarget). */
  steer(ctx: AiReadContext, dt: number): { targetX: number; targetY: number };
  /** Shot plan at contact (basic, pro and legend tactics; net tactics only offline). */
  planShot(ctx: AiReadContext): AiShotPlan;
  /** Serve plan and return plan (planCPUServe / aiServeReturnPlan). */
  planServe(ctx: AiReadContext): { aim: { x: number; y: number }; power: boolean };
}
/** Seeded draw used by the source (`seeded(index)`), kept bit-identical so replays match the reference. */
export const seeded = (index: number): number => { const x = Math.sin(index * 9283.17 + 78.31) * 43758.5453; return x - Math.floor(x); };

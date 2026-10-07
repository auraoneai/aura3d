export type FighterSide = "player" | "opponent";

export type CombatAction =
  | "idle"
  | "move"
  | "jump"
  | "dash"
  | "guard"
  | "light"
  | "heavy"
  | "special"
  | "hitstun"
  | "knockdown"
  | "victory"
  | "defeat";

export interface Vec2 {
  x: number;
  y: number;
}

export interface FighterRuntimeStats {
  health: number;
  guard: number;
  aura: number;
  combo: number;
}

export interface FighterRuntimeState {
  side: FighterSide;
  fighterId: string;
  position: Vec2;
  velocity: Vec2;
  facing: -1 | 1;
  action: CombatAction;
  stats: FighterRuntimeStats;
  invulnerableUntilMs: number;
  actionLockedUntilMs: number;
}

export interface RoundRuntimeState {
  roundId: string;
  timerSeconds: number;
  paused: boolean;
  winner: FighterSide | null;
  reason: string | null;
  player: FighterRuntimeState;
  opponent: FighterRuntimeState;
}

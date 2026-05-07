import { type World } from "./World.js";

export type SystemPhase = "fixed" | "update" | "late";

export interface SystemContext {
  readonly deltaTime: number;
  readonly elapsedTime: number;
  readonly frame: number;
}

export interface System {
  readonly name: string;
  readonly phase?: SystemPhase;
  readonly priority?: number;
  readonly before?: readonly string[];
  readonly after?: readonly string[];
  onAdd?(world: World): void;
  onRemove?(world: World): void;
  update(world: World, context: SystemContext): void;
}

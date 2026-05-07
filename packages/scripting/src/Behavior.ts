import type { ScriptContext } from "./ScriptContext";

export interface Behavior {
  enabled?: boolean;
  onStart?(context: ScriptContext): void | Promise<void>;
  onFixedUpdate?(context: ScriptContext): void | Promise<void>;
  onUpdate?(context: ScriptContext): void | Promise<void>;
  onDestroy?(context: ScriptContext): void | Promise<void>;
}

export type BehaviorPhase = "start" | "fixed" | "update" | "destroy";

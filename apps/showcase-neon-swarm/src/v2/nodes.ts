// World nodes + handle cache — extracted from boot.ts for 14-LOC.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
import type { createSwarmSimulation } from "../gameplay/swarm";
import type { createCombatFeel } from "../legacy/combat-feel";
import { swarmWorldNodes } from "./scene/world";

export type NodeHandle = AuraRuntimeNodeHandle | null;

export function createSwarmWorld(deps: {
  swarm: ReturnType<typeof createSwarmSimulation>;
  combatFeel: ReturnType<typeof createCombatFeel>;
}) {
  return swarmWorldNodes(deps.swarm, deps.combatFeel);
}

export function createSwarmHandle(game: Game) {
  const handles = new Map<string, NodeHandle>();
  return function handle(name: string): NodeHandle {
    if (!handles.has(name)) handles.set(name, game.app.nodes.get(name) ?? null);
    return handles.get(name) ?? null;
  };
}

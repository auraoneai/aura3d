export interface AuraClashFighterControllerBoundary {
  readonly id: "aura-clash-fighter-controller-boundary";
  readonly combatSource: "engine.combatWorld";
  readonly routeMayQueueMoves: true;
  readonly routeMayMirrorEngineState: true;
  readonly routeMayCalculateHits: false;
  readonly routeMayCalculateDamage: false;
  readonly allowedRouteGlue: readonly string[];
}

export const auraClashFighterControllerBoundary: AuraClashFighterControllerBoundary = {
  id: "aura-clash-fighter-controller-boundary",
  combatSource: "engine.combatWorld",
  routeMayQueueMoves: true,
  routeMayMirrorEngineState: true,
  routeMayCalculateHits: false,
  routeMayCalculateDamage: false,
  allowedRouteGlue: [
    "translate input into move requests",
    "begin engine combat-world attacks",
    "mirror engine health and meter snapshots into route HUD state",
    "translate engine hit and block events into VFX, audio, HUD, and animation reactions"
  ]
};

export function assertAuraClashFighterControllerBoundary(): AuraClashFighterControllerBoundary {
  return auraClashFighterControllerBoundary;
}

export type FighterFacing = 1 | -1;

export function lightMove(id: string, facing: FighterFacing) {
  return {
    id,
    name: "Template Light Strike",
    damage: 7,
    guardDamage: 3,
    hitStop: 0.08,
    hitStun: 0.22,
    blockStun: 0.12,
    recovery: 0.18,
    activeFrames: [2, 8] as const,
    durationFrames: 18,
    knockback: [facing * 1.8, 0.5, 0] as const,
    hitboxes: [
      {
        id: "jab",
        offset: [facing * 0.68, 0.82, 0] as const,
        size: [0.86, 0.45, 0.45] as const
      }
    ]
  };
}

export function heavyMove(id: string, facing: FighterFacing) {
  return {
    id,
    name: "Template Heavy Breaker",
    damage: 13,
    guardDamage: 8,
    hitStop: 0.12,
    hitStun: 0.34,
    blockStun: 0.18,
    recovery: 0.32,
    activeFrames: [4, 12] as const,
    durationFrames: 28,
    knockback: [facing * 2.5, 0.8, 0] as const,
    hitboxes: [
      {
        id: "heavy",
        offset: [facing * 0.78, 0.92, 0] as const,
        size: [1.08, 0.6, 0.52] as const
      }
    ]
  };
}

export function specialMove(id: string, facing: FighterFacing) {
  return {
    id,
    name: "Template Aura Burst",
    damage: 18,
    guardDamage: 12,
    hitStop: 0.16,
    hitStun: 0.42,
    blockStun: 0.24,
    recovery: 0.46,
    activeFrames: [3, 18] as const,
    durationFrames: 42,
    knockback: [facing * 3.2, 1.1, 0] as const,
    hitboxes: [
      {
        id: "aura-burst",
        offset: [facing * 0.86, 0.95, 0] as const,
        size: [1.8, 0.85, 0.65] as const
      }
    ]
  };
}

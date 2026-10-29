// Pip's Big Leap — Sun-Gate rules (pure, unit-tested).
//
// The gate opens once Pip carries `gateSeeds` sun-seeds and, in the boss
// world, Brambleback is down. The lock icon shows exactly while the gate is
// still locked.

export interface GateInput {
  readonly seeds: number;
  readonly gateSeeds: number;
  readonly boss: boolean;
  readonly bossHp: number;
}

export interface GateState {
  readonly unlocked: boolean;
  /** Seeds are enough, but the boss still bars the way. */
  readonly bossBarring: boolean;
  readonly lockVisible: boolean;
}

export function gateState(g: GateInput): GateState {
  const enoughSeeds = g.seeds >= g.gateSeeds;
  const bossAlive = g.boss && g.bossHp > 0;
  const unlocked = enoughSeeds && !bossAlive;
  return { unlocked, bossBarring: enoughSeeds && bossAlive, lockVisible: !unlocked };
}

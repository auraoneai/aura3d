import {
  aabbPenetration,
  guardbox,
  hitbox,
  hurtbox,
  overlapsVolume,
  pushbox,
  resolveCollisionVolume,
  withVolumeOwner,
  type CombatFacing,
  type CollisionOwnerId,
  type CollisionVolume,
  type ResolvedCollisionVolume
} from "./CollisionVolumes.js";
import { cloneVec3, validateFiniteVec3, type Vec3 } from "./Shape.js";

export type CombatantId = CollisionOwnerId;
export type CombatTeam = string | number;

export type CombatantDescriptor = {
  readonly id: CombatantId;
  readonly team?: CombatTeam;
  readonly position?: Vec3;
  readonly facing?: CombatFacing;
  readonly hurtboxes?: readonly CollisionVolume[];
  readonly guardBoxes?: readonly CollisionVolume[];
  readonly pushbox?: CollisionVolume | null;
  readonly health?: number;
  readonly maxHealth?: number;
  readonly guard?: number;
  readonly maxGuard?: number;
  readonly meter?: number;
  readonly blocking?: boolean;
  readonly invulnerableFrames?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type CombatantPose = {
  readonly position?: Vec3;
  readonly facing?: CombatFacing;
};

export type ActiveFrameWindow = {
  readonly start: number;
  readonly end: number;
};

export type HitboxDescriptor = {
  readonly id?: string;
  readonly ownerId: CombatantId;
  readonly team?: CombatTeam;
  readonly moveId: string;
  readonly boxes: readonly CollisionVolume[];
  readonly activeFrames?: ActiveFrameWindow;
  readonly recoveryFrames?: number;
  readonly damage?: number;
  readonly guardDamage?: number;
  readonly hitstunFrames?: number;
  readonly blockstunFrames?: number;
  readonly hitStopFrames?: number;
  readonly selfHitStopFrames?: number;
  readonly knockback?: Vec3;
  readonly blockKnockback?: Vec3;
  readonly priority?: number;
  readonly canHitOwner?: boolean;
  readonly canHitSameTeam?: boolean;
  readonly hitOnce?: boolean;
  readonly maxHits?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type ActiveHitboxSnapshot = {
  readonly id: string;
  readonly ownerId: CombatantId;
  readonly moveId: string;
  readonly ageFrames: number;
  readonly activeFrames: ActiveFrameWindow;
  readonly recoveryFrames: number;
  readonly hitCount: number;
  readonly expired: boolean;
};

export type CombatantSnapshot = {
  readonly id: CombatantId;
  readonly team?: CombatTeam;
  readonly position: Vec3;
  readonly facing: CombatFacing;
  readonly health: number;
  readonly maxHealth: number;
  readonly guard: number;
  readonly maxGuard: number;
  readonly meter: number;
  readonly blocking: boolean;
  readonly invulnerableFrames: number;
  readonly hitStopFrames: number;
  readonly hitstunFrames: number;
  readonly blockstunFrames: number;
  readonly recoveryFrames: number;
};

export type HitboxWorldSnapshot = {
  readonly frame: number;
  readonly combatants: readonly CombatantSnapshot[];
  readonly hitboxes: readonly ActiveHitboxSnapshot[];
  readonly events: readonly CombatEvent[];
};

export type CombatHitEvent = {
  readonly type: "hit";
  readonly frame: number;
  readonly attackerId: CombatantId;
  readonly defenderId: CombatantId;
  readonly hitboxId: string;
  readonly moveId: string;
  readonly hitboxVolumeId: string;
  readonly hurtboxId: string;
  readonly damage: number;
  readonly defenderHealth: number;
  readonly hitstunFrames: number;
  readonly hitStopFrames: number;
  readonly knockback: Vec3;
  readonly point: Vec3;
  readonly normal: Vec3;
};

export type CombatBlockEvent = {
  readonly type: "blocked";
  readonly frame: number;
  readonly attackerId: CombatantId;
  readonly defenderId: CombatantId;
  readonly hitboxId: string;
  readonly moveId: string;
  readonly hitboxVolumeId: string;
  readonly guardboxId: string;
  readonly guardDamage: number;
  readonly defenderGuard: number;
  readonly blockstunFrames: number;
  readonly hitStopFrames: number;
  readonly knockback: Vec3;
  readonly point: Vec3;
  readonly normal: Vec3;
};

export type CombatHitboxLifecycleEvent =
  | {
      readonly type: "hitbox-spawned";
      readonly frame: number;
      readonly hitboxId: string;
      readonly ownerId: CombatantId;
      readonly moveId: string;
      readonly activeFrames: ActiveFrameWindow;
    }
  | {
      readonly type: "hitbox-expired";
      readonly frame: number;
      readonly hitboxId: string;
      readonly ownerId: CombatantId;
      readonly moveId: string;
      readonly hitCount: number;
    }
  | {
      readonly type: "whiff";
      readonly frame: number;
      readonly hitboxId: string;
      readonly ownerId: CombatantId;
      readonly moveId: string;
    };

export type CombatTimerEvent =
  | {
      readonly type: "hitstop-start";
      readonly frame: number;
      readonly combatantId: CombatantId;
      readonly frames: number;
    }
  | {
      readonly type: "hitstop-end";
      readonly frame: number;
      readonly combatantId: CombatantId;
    }
  | {
      readonly type: "hitstun-start";
      readonly frame: number;
      readonly combatantId: CombatantId;
      readonly frames: number;
    }
  | {
      readonly type: "hitstun-end";
      readonly frame: number;
      readonly combatantId: CombatantId;
    }
  | {
      readonly type: "blockstun-start";
      readonly frame: number;
      readonly combatantId: CombatantId;
      readonly frames: number;
    }
  | {
      readonly type: "blockstun-end";
      readonly frame: number;
      readonly combatantId: CombatantId;
    }
  | {
      readonly type: "recovery-start";
      readonly frame: number;
      readonly combatantId: CombatantId;
      readonly frames: number;
    }
  | {
      readonly type: "recovery-end";
      readonly frame: number;
      readonly combatantId: CombatantId;
    };

export type CombatPushboxEvent = {
  readonly type: "pushbox-overlap";
  readonly frame: number;
  readonly combatantA: CombatantId;
  readonly combatantB: CombatantId;
  readonly normal: Vec3;
  readonly penetration: number;
};

export type CombatEvent = CombatHitEvent | CombatBlockEvent | CombatHitboxLifecycleEvent | CombatTimerEvent | CombatPushboxEvent;

export type HitboxWorldDescriptor = {
  readonly detectPushboxOverlaps?: boolean;
};

type CombatantRecord = {
  id: CombatantId;
  team: CombatTeam | undefined;
  position: [number, number, number];
  facing: CombatFacing;
  hurtboxes: CollisionVolume[];
  guardBoxes: CollisionVolume[];
  pushbox: CollisionVolume | null;
  health: number;
  maxHealth: number;
  guard: number;
  maxGuard: number;
  meter: number;
  blocking: boolean;
  invulnerableFrames: number;
  hitStopFrames: number;
  hitstunFrames: number;
  blockstunFrames: number;
  recoveryFrames: number;
  metadata: Readonly<Record<string, unknown>> | undefined;
};

type ActiveHitboxRecord = {
  id: string;
  ownerId: CombatantId;
  team: CombatTeam | undefined;
  moveId: string;
  boxes: CollisionVolume[];
  activeFrames: ActiveFrameWindow;
  recoveryFrames: number;
  damage: number;
  guardDamage: number;
  hitstunFrames: number;
  blockstunFrames: number;
  hitStopFrames: number;
  selfHitStopFrames: number;
  knockback: Vec3;
  blockKnockback: Vec3;
  priority: number;
  canHitOwner: boolean;
  canHitSameTeam: boolean;
  hitOnce: boolean;
  maxHits: number;
  metadata: Readonly<Record<string, unknown>> | undefined;
  ageFrames: number;
  hitCount: number;
  expired: boolean;
  hitTargets: Set<CombatantId>;
  recoveryStarted: boolean;
};

export class HitboxWorld {
  readonly detectPushboxOverlaps: boolean;
  private readonly combatantsById = new Map<CombatantId, CombatantRecord>();
  private readonly hitboxesById = new Map<string, ActiveHitboxRecord>();
  private nextHitboxId = 1;
  private frame = 0;
  private lastEvents: readonly CombatEvent[] = [];
  private readonly pendingEvents: CombatEvent[] = [];

  constructor(descriptor: HitboxWorldDescriptor = {}) {
    this.detectPushboxOverlaps = descriptor.detectPushboxOverlaps ?? true;
  }

  registerCombatant(descriptor: CombatantDescriptor): CombatantSnapshot {
    if (this.combatantsById.has(descriptor.id)) {
      throw new Error(`Combatant ${String(descriptor.id)} already exists.`);
    }
    const combatant = createCombatantRecord(descriptor);
    this.combatantsById.set(combatant.id, combatant);
    return snapshotCombatant(combatant);
  }

  upsertCombatant(descriptor: CombatantDescriptor): CombatantSnapshot {
    const existing = this.combatantsById.get(descriptor.id);
    if (!existing) {
      return this.registerCombatant(descriptor);
    }
    applyCombatantDescriptor(existing, descriptor);
    return snapshotCombatant(existing);
  }

  removeCombatant(id: CombatantId): void {
    this.combatantsById.delete(id);
    for (const hitboxRecord of this.hitboxesById.values()) {
      if (hitboxRecord.ownerId === id) {
        hitboxRecord.expired = true;
      }
    }
  }

  getCombatant(id: CombatantId): CombatantSnapshot | undefined {
    const combatant = this.combatantsById.get(id);
    return combatant ? snapshotCombatant(combatant) : undefined;
  }

  setPose(id: CombatantId, pose: CombatantPose): void {
    const combatant = this.requireCombatant(id);
    if (pose.position) {
      validateFiniteVec3(pose.position, "combatant pose position");
      combatant.position = cloneVec3(pose.position);
    }
    if (pose.facing) {
      combatant.facing = pose.facing < 0 ? -1 : 1;
    }
  }

  setGuarding(id: CombatantId, blocking: boolean): void {
    this.requireCombatant(id).blocking = blocking;
  }

  setHurtboxes(id: CombatantId, volumes: readonly CollisionVolume[]): void {
    this.requireCombatant(id).hurtboxes = volumes.map((volume) => requireVolumeKind(volume, "hurtbox"));
  }

  setGuardBoxes(id: CombatantId, volumes: readonly CollisionVolume[]): void {
    this.requireCombatant(id).guardBoxes = volumes.map((volume) => requireVolumeKind(volume, "guardbox"));
  }

  setPushbox(id: CombatantId, volume: CollisionVolume | null): void {
    this.requireCombatant(id).pushbox = volume === null ? null : requireVolumeKind(volume, "pushbox");
  }

  spawnHitbox(descriptor: HitboxDescriptor): ActiveHitboxSnapshot {
    const owner = this.requireCombatant(descriptor.ownerId);
    const id = descriptor.id ?? `${String(descriptor.ownerId)}:${descriptor.moveId}:${this.nextHitboxId}`;
    this.nextHitboxId += 1;
    if (this.hitboxesById.has(id)) {
      throw new Error(`Hitbox ${id} already exists.`);
    }
    const activeFrames = normalizeActiveFrames(descriptor.activeFrames ?? { start: 0, end: 2 });
    const record: ActiveHitboxRecord = {
      id,
      ownerId: descriptor.ownerId,
      team: descriptor.team ?? owner.team,
      moveId: descriptor.moveId,
      boxes: descriptor.boxes.map((volume) => requireVolumeKind(volume, "hitbox")),
      activeFrames,
      recoveryFrames: nonNegativeInteger(descriptor.recoveryFrames ?? 0, "hitbox recoveryFrames"),
      damage: nonNegativeFinite(descriptor.damage ?? 10, "hitbox damage"),
      guardDamage: nonNegativeFinite(descriptor.guardDamage ?? Math.ceil((descriptor.damage ?? 10) * 0.35), "hitbox guardDamage"),
      hitstunFrames: nonNegativeInteger(descriptor.hitstunFrames ?? 14, "hitbox hitstunFrames"),
      blockstunFrames: nonNegativeInteger(descriptor.blockstunFrames ?? 8, "hitbox blockstunFrames"),
      hitStopFrames: nonNegativeInteger(descriptor.hitStopFrames ?? 6, "hitbox hitStopFrames"),
      selfHitStopFrames: nonNegativeInteger(descriptor.selfHitStopFrames ?? descriptor.hitStopFrames ?? 6, "hitbox selfHitStopFrames"),
      knockback: cloneVec3(descriptor.knockback ?? [2.4, 0.8, 0]),
      blockKnockback: cloneVec3(descriptor.blockKnockback ?? [1.1, 0, 0]),
      priority: finite(descriptor.priority ?? 0, "hitbox priority"),
      canHitOwner: descriptor.canHitOwner ?? false,
      canHitSameTeam: descriptor.canHitSameTeam ?? false,
      hitOnce: descriptor.hitOnce ?? true,
      maxHits: positiveInteger(descriptor.maxHits ?? Number.MAX_SAFE_INTEGER, "hitbox maxHits"),
      metadata: descriptor.metadata,
      ageFrames: 0,
      hitCount: 0,
      expired: false,
      hitTargets: new Set(),
      recoveryStarted: false
    };
    validateFiniteVec3(record.knockback, "hitbox knockback");
    validateFiniteVec3(record.blockKnockback, "hitbox blockKnockback");
    this.hitboxesById.set(record.id, record);
    this.pendingEvents.push({
      type: "hitbox-spawned",
      frame: this.frame,
      hitboxId: record.id,
      ownerId: record.ownerId,
      moveId: record.moveId,
      activeFrames: record.activeFrames
    });
    return snapshotHitbox(record);
  }

  clearHitboxes(ownerId?: CombatantId): void {
    for (const [id, record] of this.hitboxesById) {
      if (ownerId === undefined || record.ownerId === ownerId) {
        this.hitboxesById.delete(id);
      }
    }
  }

  step(frames = 1): readonly CombatEvent[] {
    const frameCount = positiveInteger(frames, "HitboxWorld.step frames");
    const events: CombatEvent[] = [];
    events.push(...this.drainPendingEvents());
    for (let index = 0; index < frameCount; index += 1) {
      events.push(...this.stepOneFrame());
    }
    this.lastEvents = events;
    return events;
  }

  drainEvents(): readonly CombatEvent[] {
    const events = [...this.pendingEvents, ...this.lastEvents];
    this.pendingEvents.length = 0;
    this.lastEvents = [];
    return events;
  }

  snapshot(): HitboxWorldSnapshot {
    return {
      frame: this.frame,
      combatants: this.combatants(),
      hitboxes: this.hitboxes(),
      events: this.lastEvents.map(cloneCombatEvent)
    };
  }

  combatants(): readonly CombatantSnapshot[] {
    return Array.from(this.combatantsById.values()).sort(compareCombatants).map(snapshotCombatant);
  }

  hitboxes(): readonly ActiveHitboxSnapshot[] {
    return Array.from(this.hitboxesById.values()).sort(compareHitboxes).map(snapshotHitbox);
  }

  private stepOneFrame(): CombatEvent[] {
    const events: CombatEvent[] = [];
    if (this.detectPushboxOverlaps) {
      events.push(...this.collectPushboxEvents());
    }
    for (const record of this.sortedHitboxRecords()) {
      if (record.expired || record.hitCount >= record.maxHits) {
        record.expired = true;
        continue;
      }
      const owner = this.combatantsById.get(record.ownerId);
      if (!owner) {
        record.expired = true;
        continue;
      }
      if (isHitboxActive(record)) {
        events.push(...this.resolveHitbox(record, owner));
      }
      if (!record.recoveryStarted && record.ageFrames > record.activeFrames.end && record.recoveryFrames > 0) {
        record.recoveryStarted = true;
        owner.recoveryFrames = Math.max(owner.recoveryFrames, record.recoveryFrames);
        events.push({
          type: "recovery-start",
          frame: this.frame,
          combatantId: owner.id,
          frames: record.recoveryFrames
        });
      }
    }
    events.push(...this.tickTimers());
    for (const record of this.sortedHitboxRecords()) {
      const owner = this.combatantsById.get(record.ownerId);
      if (owner && owner.hitStopFrames <= 0) {
        record.ageFrames += 1;
      }
      if (record.ageFrames > record.activeFrames.end + record.recoveryFrames || record.hitCount >= record.maxHits || record.expired) {
        this.expireHitbox(record, events);
      }
    }
    this.frame += 1;
    return events;
  }

  private resolveHitbox(record: ActiveHitboxRecord, owner: CombatantRecord): CombatEvent[] {
    const events: CombatEvent[] = [];
    const hitVolumes = record.boxes.map((volume) => resolveCollisionVolume(withVolumeOwner(volume, owner.id), owner.position, owner.facing));
    for (const defender of this.sortedCombatantRecords()) {
      if (!canHitCombatant(record, owner, defender)) {
        continue;
      }
      if (defender.invulnerableFrames > 0) {
        continue;
      }
      if (record.hitOnce && record.hitTargets.has(defender.id)) {
        continue;
      }
      const blockEvent = defender.blocking ? this.tryResolveBlock(record, owner, defender, hitVolumes) : null;
      if (blockEvent) {
        record.hitTargets.add(defender.id);
        record.hitCount += 1;
        events.push(blockEvent);
        events.push(...this.applyBlockTimers(record, owner, defender));
        continue;
      }
      const hitEvent = this.tryResolveHit(record, owner, defender, hitVolumes);
      if (hitEvent) {
        record.hitTargets.add(defender.id);
        record.hitCount += 1;
        events.push(hitEvent);
        events.push(...this.applyHitTimers(record, owner, defender));
      }
    }
    return events;
  }

  private tryResolveBlock(
    record: ActiveHitboxRecord,
    owner: CombatantRecord,
    defender: CombatantRecord,
    hitVolumes: readonly ResolvedCollisionVolume[]
  ): CombatBlockEvent | null {
    const guardVolumes = (defender.guardBoxes.length > 0 ? defender.guardBoxes : defender.hurtboxes).map((volume) =>
      resolveCollisionVolume(withVolumeOwner(volume, defender.id), defender.position, defender.facing)
    );
    const pair = firstOverlappingPair(hitVolumes, guardVolumes);
    if (!pair) {
      return null;
    }
    defender.guard = Math.max(0, defender.guard - record.guardDamage);
    return {
      type: "blocked",
      frame: this.frame,
      attackerId: owner.id,
      defenderId: defender.id,
      hitboxId: record.id,
      moveId: record.moveId,
      hitboxVolumeId: pair.attack.id,
      guardboxId: pair.defense.id,
      guardDamage: record.guardDamage,
      defenderGuard: defender.guard,
      blockstunFrames: record.blockstunFrames,
      hitStopFrames: record.hitStopFrames,
      knockback: orientVec3(record.blockKnockback, owner.facing),
      point: contactPoint(pair.attack, pair.defense),
      normal: combatNormal(owner, defender)
    };
  }

  private tryResolveHit(
    record: ActiveHitboxRecord,
    owner: CombatantRecord,
    defender: CombatantRecord,
    hitVolumes: readonly ResolvedCollisionVolume[]
  ): CombatHitEvent | null {
    const hurtVolumes = defender.hurtboxes.map((volume) => resolveCollisionVolume(withVolumeOwner(volume, defender.id), defender.position, defender.facing));
    const pair = firstOverlappingPair(hitVolumes, hurtVolumes);
    if (!pair) {
      return null;
    }
    defender.health = Math.max(0, defender.health - record.damage);
    return {
      type: "hit",
      frame: this.frame,
      attackerId: owner.id,
      defenderId: defender.id,
      hitboxId: record.id,
      moveId: record.moveId,
      hitboxVolumeId: pair.attack.id,
      hurtboxId: pair.defense.id,
      damage: record.damage,
      defenderHealth: defender.health,
      hitstunFrames: record.hitstunFrames,
      hitStopFrames: record.hitStopFrames,
      knockback: orientVec3(record.knockback, owner.facing),
      point: contactPoint(pair.attack, pair.defense),
      normal: combatNormal(owner, defender)
    };
  }

  private applyHitTimers(record: ActiveHitboxRecord, owner: CombatantRecord, defender: CombatantRecord): CombatTimerEvent[] {
    const events: CombatTimerEvent[] = [];
    events.push(...setTimer(defender, "hitstunFrames", record.hitstunFrames, "hitstun-start", this.frame));
    events.push(...setTimer(defender, "hitStopFrames", record.hitStopFrames, "hitstop-start", this.frame));
    events.push(...setTimer(owner, "hitStopFrames", record.selfHitStopFrames, "hitstop-start", this.frame));
    return events;
  }

  private applyBlockTimers(record: ActiveHitboxRecord, owner: CombatantRecord, defender: CombatantRecord): CombatTimerEvent[] {
    const events: CombatTimerEvent[] = [];
    events.push(...setTimer(defender, "blockstunFrames", record.blockstunFrames, "blockstun-start", this.frame));
    events.push(...setTimer(defender, "hitStopFrames", record.hitStopFrames, "hitstop-start", this.frame));
    events.push(...setTimer(owner, "hitStopFrames", record.selfHitStopFrames, "hitstop-start", this.frame));
    return events;
  }

  private tickTimers(): CombatTimerEvent[] {
    const events: CombatTimerEvent[] = [];
    for (const combatant of this.sortedCombatantRecords()) {
      events.push(...tickTimer(combatant, "hitStopFrames", "hitstop-end", this.frame));
      events.push(...tickTimer(combatant, "hitstunFrames", "hitstun-end", this.frame));
      events.push(...tickTimer(combatant, "blockstunFrames", "blockstun-end", this.frame));
      events.push(...tickTimer(combatant, "recoveryFrames", "recovery-end", this.frame));
      if (combatant.invulnerableFrames > 0) {
        combatant.invulnerableFrames -= 1;
      }
    }
    return events;
  }

  private collectPushboxEvents(): CombatPushboxEvent[] {
    const events: CombatPushboxEvent[] = [];
    const combatants = this.sortedCombatantRecords().filter((combatant) => combatant.pushbox !== null);
    for (let aIndex = 0; aIndex < combatants.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < combatants.length; bIndex += 1) {
        const combatantA = combatants[aIndex]!;
        const combatantB = combatants[bIndex]!;
        const pushA = resolveCollisionVolume(withVolumeOwner(combatantA.pushbox!, combatantA.id), combatantA.position, combatantA.facing);
        const pushB = resolveCollisionVolume(withVolumeOwner(combatantB.pushbox!, combatantB.id), combatantB.position, combatantB.facing);
        if (!overlapsVolume(pushA, pushB)) {
          continue;
        }
        const penetration = aabbPenetration(pushA.bounds, pushB.bounds);
        if (!penetration) {
          continue;
        }
        events.push({
          type: "pushbox-overlap",
          frame: this.frame,
          combatantA: combatantA.id,
          combatantB: combatantB.id,
          normal: penetration.normal,
          penetration: penetration.depth
        });
      }
    }
    return events;
  }

  private expireHitbox(record: ActiveHitboxRecord, events: CombatEvent[]): void {
    if (!this.hitboxesById.has(record.id)) {
      return;
    }
    if (record.hitCount === 0) {
      events.push({
        type: "whiff",
        frame: this.frame,
        hitboxId: record.id,
        ownerId: record.ownerId,
        moveId: record.moveId
      });
    }
    events.push({
      type: "hitbox-expired",
      frame: this.frame,
      hitboxId: record.id,
      ownerId: record.ownerId,
      moveId: record.moveId,
      hitCount: record.hitCount
    });
    this.hitboxesById.delete(record.id);
  }

  private requireCombatant(id: CombatantId): CombatantRecord {
    const combatant = this.combatantsById.get(id);
    if (!combatant) {
      throw new Error(`Combatant ${String(id)} does not exist.`);
    }
    return combatant;
  }

  private sortedCombatantRecords(): CombatantRecord[] {
    return Array.from(this.combatantsById.values()).sort(compareCombatants);
  }

  private sortedHitboxRecords(): ActiveHitboxRecord[] {
    return Array.from(this.hitboxesById.values()).sort(compareHitboxes);
  }

  private drainPendingEvents(): CombatEvent[] {
    const events = [...this.pendingEvents];
    this.pendingEvents.length = 0;
    return events;
  }
}

function createCombatantRecord(descriptor: CombatantDescriptor): CombatantRecord {
  const maxHealth = positiveFinite(descriptor.maxHealth ?? descriptor.health ?? 100, "combatant maxHealth");
  const maxGuard = positiveFinite(descriptor.maxGuard ?? descriptor.guard ?? 100, "combatant maxGuard");
  const position = cloneVec3(descriptor.position ?? [0, 0.9, 0]);
  validateFiniteVec3(position, "combatant position");
  return {
    id: descriptor.id,
    team: descriptor.team,
    position,
    facing: descriptor.facing && descriptor.facing < 0 ? -1 : 1,
    hurtboxes: (descriptor.hurtboxes ?? [hurtbox({ id: "body", halfExtents: [0.36, 0.86, 0.28] })]).map((volume) => requireVolumeKind(volume, "hurtbox")),
    guardBoxes: (descriptor.guardBoxes ?? [guardbox({ id: "guard", offset: [0.18, 0, 0], halfExtents: [0.28, 0.82, 0.3] })]).map((volume) =>
      requireVolumeKind(volume, "guardbox")
    ),
    pushbox: descriptor.pushbox === null ? null : requireVolumeKind(descriptor.pushbox ?? pushbox({ id: "push", halfExtents: [0.32, 0.84, 0.26] }), "pushbox"),
    health: clampNonNegative(descriptor.health ?? maxHealth, maxHealth),
    maxHealth,
    guard: clampNonNegative(descriptor.guard ?? maxGuard, maxGuard),
    maxGuard,
    meter: nonNegativeFinite(descriptor.meter ?? 0, "combatant meter"),
    blocking: descriptor.blocking ?? false,
    invulnerableFrames: nonNegativeInteger(descriptor.invulnerableFrames ?? 0, "combatant invulnerableFrames"),
    hitStopFrames: 0,
    hitstunFrames: 0,
    blockstunFrames: 0,
    recoveryFrames: 0,
    metadata: descriptor.metadata
  };
}

function applyCombatantDescriptor(record: CombatantRecord, descriptor: CombatantDescriptor): void {
  if (descriptor.team !== undefined) {
    record.team = descriptor.team;
  }
  if (descriptor.position) {
    validateFiniteVec3(descriptor.position, "combatant position");
    record.position = cloneVec3(descriptor.position);
  }
  if (descriptor.facing) {
    record.facing = descriptor.facing < 0 ? -1 : 1;
  }
  if (descriptor.hurtboxes) {
    record.hurtboxes = descriptor.hurtboxes.map((volume) => requireVolumeKind(volume, "hurtbox"));
  }
  if (descriptor.guardBoxes) {
    record.guardBoxes = descriptor.guardBoxes.map((volume) => requireVolumeKind(volume, "guardbox"));
  }
  if (descriptor.pushbox !== undefined) {
    record.pushbox = descriptor.pushbox === null ? null : requireVolumeKind(descriptor.pushbox, "pushbox");
  }
  if (descriptor.maxHealth !== undefined) {
    record.maxHealth = positiveFinite(descriptor.maxHealth, "combatant maxHealth");
  }
  if (descriptor.health !== undefined) {
    record.health = clampNonNegative(descriptor.health, record.maxHealth);
  }
  if (descriptor.maxGuard !== undefined) {
    record.maxGuard = positiveFinite(descriptor.maxGuard, "combatant maxGuard");
  }
  if (descriptor.guard !== undefined) {
    record.guard = clampNonNegative(descriptor.guard, record.maxGuard);
  }
  if (descriptor.meter !== undefined) {
    record.meter = nonNegativeFinite(descriptor.meter, "combatant meter");
  }
  if (descriptor.blocking !== undefined) {
    record.blocking = descriptor.blocking;
  }
  if (descriptor.invulnerableFrames !== undefined) {
    record.invulnerableFrames = nonNegativeInteger(descriptor.invulnerableFrames, "combatant invulnerableFrames");
  }
  if (descriptor.metadata !== undefined) {
    record.metadata = descriptor.metadata;
  }
}

function canHitCombatant(record: ActiveHitboxRecord, owner: CombatantRecord, defender: CombatantRecord): boolean {
  if (owner.id === defender.id && !record.canHitOwner) {
    return false;
  }
  if (!record.canHitSameTeam && record.team !== undefined && defender.team !== undefined && record.team === defender.team) {
    return false;
  }
  return true;
}

function firstOverlappingPair(
  attackVolumes: readonly ResolvedCollisionVolume[],
  defenseVolumes: readonly ResolvedCollisionVolume[]
): { readonly attack: ResolvedCollisionVolume; readonly defense: ResolvedCollisionVolume } | null {
  const attacks = [...attackVolumes].sort(compareResolvedVolumes);
  const defenses = [...defenseVolumes].sort(compareResolvedVolumes);
  for (const attack of attacks) {
    for (const defense of defenses) {
      if (overlapsVolume(attack, defense)) {
        return { attack, defense };
      }
    }
  }
  return null;
}

function setTimer(
  combatant: CombatantRecord,
  key: "hitStopFrames" | "hitstunFrames" | "blockstunFrames" | "recoveryFrames",
  frames: number,
  eventType: "hitstop-start" | "hitstun-start" | "blockstun-start" | "recovery-start",
  frame: number
): CombatTimerEvent[] {
  if (frames <= 0 || combatant[key] >= frames) {
    return [];
  }
  combatant[key] = frames;
  return [
    {
      type: eventType,
      frame,
      combatantId: combatant.id,
      frames
    } as CombatTimerEvent
  ];
}

function tickTimer(
  combatant: CombatantRecord,
  key: "hitStopFrames" | "hitstunFrames" | "blockstunFrames" | "recoveryFrames",
  eventType: "hitstop-end" | "hitstun-end" | "blockstun-end" | "recovery-end",
  frame: number
): CombatTimerEvent[] {
  if (combatant[key] <= 0) {
    return [];
  }
  combatant[key] -= 1;
  if (combatant[key] > 0) {
    return [];
  }
  return [
    {
      type: eventType,
      frame,
      combatantId: combatant.id
    } as CombatTimerEvent
  ];
}

function isHitboxActive(record: ActiveHitboxRecord): boolean {
  return record.ageFrames >= record.activeFrames.start && record.ageFrames <= record.activeFrames.end;
}

function normalizeActiveFrames(value: ActiveFrameWindow): ActiveFrameWindow {
  const start = nonNegativeInteger(value.start, "hitbox activeFrames.start");
  const end = nonNegativeInteger(value.end, "hitbox activeFrames.end");
  if (end < start) {
    throw new Error("hitbox activeFrames.end must be greater than or equal to activeFrames.start.");
  }
  return { start, end };
}

function requireVolumeKind(volume: CollisionVolume, kind: CollisionVolume["kind"]): CollisionVolume {
  if (volume.kind !== kind) {
    throw new Error(`Expected ${kind} volume but received ${volume.kind}.`);
  }
  return volume;
}

function contactPoint(attack: ResolvedCollisionVolume, defense: ResolvedCollisionVolume): Vec3 {
  return [
    (Math.max(attack.bounds.min[0], defense.bounds.min[0]) + Math.min(attack.bounds.max[0], defense.bounds.max[0])) * 0.5,
    (Math.max(attack.bounds.min[1], defense.bounds.min[1]) + Math.min(attack.bounds.max[1], defense.bounds.max[1])) * 0.5,
    (Math.max(attack.bounds.min[2], defense.bounds.min[2]) + Math.min(attack.bounds.max[2], defense.bounds.max[2])) * 0.5
  ];
}

function combatNormal(owner: CombatantRecord, defender: CombatantRecord): Vec3 {
  if (owner.position[0] === defender.position[0]) {
    return [owner.facing, 0, 0];
  }
  return [owner.position[0] < defender.position[0] ? 1 : -1, 0, 0];
}

function orientVec3(value: Vec3, facing: CombatFacing): Vec3 {
  return [value[0] * facing, value[1], value[2]];
}

function snapshotCombatant(record: CombatantRecord): CombatantSnapshot {
  return {
    id: record.id,
    ...(record.team === undefined ? {} : { team: record.team }),
    position: cloneVec3(record.position),
    facing: record.facing,
    health: record.health,
    maxHealth: record.maxHealth,
    guard: record.guard,
    maxGuard: record.maxGuard,
    meter: record.meter,
    blocking: record.blocking,
    invulnerableFrames: record.invulnerableFrames,
    hitStopFrames: record.hitStopFrames,
    hitstunFrames: record.hitstunFrames,
    blockstunFrames: record.blockstunFrames,
    recoveryFrames: record.recoveryFrames
  };
}

function snapshotHitbox(record: ActiveHitboxRecord): ActiveHitboxSnapshot {
  return {
    id: record.id,
    ownerId: record.ownerId,
    moveId: record.moveId,
    ageFrames: record.ageFrames,
    activeFrames: record.activeFrames,
    recoveryFrames: record.recoveryFrames,
    hitCount: record.hitCount,
    expired: record.expired
  };
}

function cloneCombatEvent(event: CombatEvent): CombatEvent {
  switch (event.type) {
    case "hit":
      return {
        ...event,
        knockback: cloneVec3(event.knockback),
        point: cloneVec3(event.point),
        normal: cloneVec3(event.normal)
      };
    case "blocked":
      return {
        ...event,
        knockback: cloneVec3(event.knockback),
        point: cloneVec3(event.point),
        normal: cloneVec3(event.normal)
      };
    case "pushbox-overlap":
      return {
        ...event,
        normal: cloneVec3(event.normal)
      };
    default:
      return { ...event };
  }
}

function compareCombatants(a: CombatantRecord, b: CombatantRecord): number {
  return compareIds(a.id, b.id);
}

function compareHitboxes(a: ActiveHitboxRecord, b: ActiveHitboxRecord): number {
  if (a.priority !== b.priority) {
    return b.priority - a.priority;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareResolvedVolumes(a: ResolvedCollisionVolume, b: ResolvedCollisionVolume): number {
  const left = `${a.kind}:${a.id}`;
  const right = `${b.kind}:${b.id}`;
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareIds(a: CombatantId, b: CombatantId): number {
  const left = String(a);
  const right = String(b);
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite.`);
  }
  return value;
}

function nonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative.`);
  }
  return value;
}

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be finite and positive.`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function clampNonNegative(value: number, max: number): number {
  return Math.max(0, Math.min(max, nonNegativeFinite(value, "combatant value")));
}

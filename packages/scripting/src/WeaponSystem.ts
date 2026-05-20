export type WeaponKind = "laser" | "missile" | "plasma";
export type FpsWeaponType = "pistol" | "rifle" | "shotgun";
export type FpsFiringMode = "single" | "auto" | "burst";
export type FpsEnemyTacticalState = "idle" | "patrol" | "chase" | "attack" | "flee" | "take_cover" | "investigate" | "dead";
export type FpsPickupType = "health" | "ammo";
export type SpaceShooterEnemyType = "fighter" | "bomber" | "turret" | "carrier" | "boss";
export type SpaceShooterFormation = "line" | "v-formation" | "surround" | "random" | "sides";
export type SpaceShooterPowerUpType = "health" | "shield" | "weapon" | "speed" | "life" | "multiplier";

export interface WeaponBurstInput {
  readonly kind: WeaponKind;
  readonly level?: number;
  readonly x?: number;
  readonly y?: number;
  readonly angle?: number;
  readonly secondary?: boolean;
  readonly ammo?: number;
}

export interface WeaponProjectile {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  readonly lifetime: number;
}

export interface WeaponBurst {
  readonly kind: WeaponKind;
  readonly level: number;
  readonly secondary: boolean;
  readonly projectileCount: number;
  readonly ammoSpent: number;
  readonly totalDamage: number;
  readonly spreadRadians: number;
  readonly projectiles: readonly WeaponProjectile[];
  readonly source: "origin-master-space-shooter-weapons-adapted";
  readonly claimBoundary: string;
}

export interface FpsWeaponCycleInput {
  readonly weapon: FpsWeaponType;
  readonly elapsedSeconds?: number;
  readonly triggerHeld?: boolean;
  readonly reloadRequested?: boolean;
  readonly currentAmmo?: number;
  readonly reserveAmmo?: number;
  readonly fireTimer?: number;
  readonly seed?: number;
}

export interface FpsWeaponCycleSample {
  readonly weapon: FpsWeaponType;
  readonly name: string;
  readonly firingMode: FpsFiringMode;
  readonly fired: boolean;
  readonly emptyClick: boolean;
  readonly reloading: boolean;
  readonly reloadComplete: boolean;
  readonly currentAmmo: number;
  readonly reserveAmmo: number;
  readonly ammoSpent: number;
  readonly bulletsPerShot: number;
  readonly totalDamage: number;
  readonly range: number;
  readonly spreadDegrees: number;
  readonly recoilX: number;
  readonly recoilY: number;
  readonly fireCooldown: number;
  readonly muzzleFlashSeconds: number;
  readonly shellEjectionSeconds: number;
  readonly source: "origin-master-fps-weapon-adapted";
  readonly claimBoundary: string;
}

export interface FpsEnemyTacticsInput {
  readonly currentState?: FpsEnemyTacticalState;
  readonly playerAlive?: boolean;
  readonly distanceToPlayer: number;
  readonly angleToPlayerDegrees?: number;
  readonly health?: number;
  readonly maxHealth?: number;
  readonly attackTimer?: number;
  readonly stateTimer?: number;
  readonly hasCover?: boolean;
  readonly distanceToCover?: number;
  readonly hasLastKnownPlayerPosition?: boolean;
  readonly distanceToLastKnownPlayerPosition?: number;
}

export interface FpsEnemyTacticsSample {
  readonly state: FpsEnemyTacticalState;
  readonly canSeePlayer: boolean;
  readonly canHearPlayer: boolean;
  readonly targetAcquired: boolean;
  readonly movementSpeed: number;
  readonly attackReady: boolean;
  readonly pathRefreshRequested: boolean;
  readonly coverRequested: boolean;
  readonly inCover: boolean;
  readonly nextAction: "wait" | "patrol" | "chase" | "attack" | "flee" | "move_to_cover" | "investigate" | "die";
  readonly source: "origin-master-fps-enemy-ai-adapted";
  readonly claimBoundary: string;
}

export interface FpsLevelLayoutInput {
  readonly seed?: number;
  readonly roomCount?: number;
  readonly gridSize?: number;
}

export interface FpsLevelRoom {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

export interface FpsLevelCorridor {
  readonly from: string;
  readonly to: string;
  readonly length: number;
  readonly width: number;
}

export interface FpsLevelPoint {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

export interface FpsLevelPickup extends FpsLevelPoint {
  readonly type: FpsPickupType;
}

export interface FpsLevelLayoutSample {
  readonly rooms: readonly FpsLevelRoom[];
  readonly corridors: readonly FpsLevelCorridor[];
  readonly coverPoints: readonly FpsLevelPoint[];
  readonly patrolPoints: readonly FpsLevelPoint[];
  readonly enemySpawnPoints: readonly FpsLevelPoint[];
  readonly pickupSpawnPoints: readonly FpsLevelPickup[];
  readonly playerSpawnPoint: FpsLevelPoint;
  readonly navMeshPointCount: number;
  readonly averageRoomArea: number;
  readonly totalCorridorLength: number;
  readonly source: "origin-master-fps-level-adapted";
  readonly claimBoundary: string;
}

export interface FpsHudOverlayInput {
  readonly health: number;
  readonly maxHealth?: number;
  readonly ammo: number;
  readonly reserveAmmo: number;
  readonly score?: number;
  readonly wave?: number;
  readonly enemiesRemaining?: number;
  readonly recentDamage?: number;
  readonly hitMarker?: boolean;
  readonly damageAngleDegrees?: number;
  readonly minimapFriendlyCount?: number;
  readonly minimapEnemyCount?: number;
  readonly killFeedCount?: number;
}

export interface FpsHudOverlaySample {
  readonly healthPercent: number;
  readonly healthBarPixels: number;
  readonly lowHealth: boolean;
  readonly damageFlashAlpha: number;
  readonly ammoText: string;
  readonly ammoWarning: boolean;
  readonly crosshairSpreadPixels: number;
  readonly hitMarkerVisible: boolean;
  readonly damageIndicatorAngleDegrees: number;
  readonly minimapBlips: number;
  readonly killFeedVisible: boolean;
  readonly waveText: string;
  readonly source: "origin-master-fps-hud-adapted";
  readonly claimBoundary: string;
}

export interface SpaceShooterWaveInput {
  readonly wave: number;
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
}

export interface SpaceShooterSpawn {
  readonly enemyType: SpaceShooterEnemyType;
  readonly x: number;
  readonly y: number;
  readonly health: number;
  readonly radius: number;
  readonly scoreValue: number;
}

export interface SpaceShooterWaveSample {
  readonly wave: number;
  readonly enemyType: SpaceShooterEnemyType;
  readonly formation: SpaceShooterFormation;
  readonly count: number;
  readonly delay: number;
  readonly bossWave: boolean;
  readonly difficultyScale: number;
  readonly totalScoreValue: number;
  readonly spawns: readonly SpaceShooterSpawn[];
  readonly powerUpType: SpaceShooterPowerUpType;
  readonly powerUpWeight: number;
  readonly source: "origin-master-space-shooter-wave-powerup-adapted";
  readonly claimBoundary: string;
}

export interface PowerUpEffectInput {
  readonly type: SpaceShooterPowerUpType;
  readonly health?: number;
  readonly maxHealth?: number;
  readonly shield?: number;
  readonly maxShield?: number;
  readonly weaponLevel?: number;
  readonly speed?: number;
  readonly lives?: number;
  readonly multiplier?: number;
}

export interface PowerUpEffectSample {
  readonly type: SpaceShooterPowerUpType;
  readonly health: number;
  readonly shield: number;
  readonly weaponLevel: number;
  readonly speed: number;
  readonly lives: number;
  readonly multiplier: number;
  readonly changedFields: readonly string[];
  readonly source: "origin-master-space-shooter-powerup-effects-adapted";
}

export function sampleWeaponBurst(input: WeaponBurstInput): WeaponBurst {
  const level = Math.max(1, Math.min(5, Math.floor(input.level ?? 1)));
  const x = finite(input.x ?? 0, "x");
  const y = finite(input.y ?? 0, "y");
  const angle = finite(input.angle ?? 0, "angle");
  const secondary = input.secondary === true;
  const ammo = input.ammo ?? Number.POSITIVE_INFINITY;
  if (ammo < 0) throw new RangeError("Weapon burst ammo must be non-negative.");
  const projectiles = input.kind === "laser"
    ? laserBurst(x, y, angle, level, secondary)
    : input.kind === "missile"
      ? missileBurst(x, y, angle, level, secondary, ammo)
      : plasmaBurst(x, y, angle, level, secondary);
  const totalDamage = projectiles.reduce((sum, projectile) => sum + projectile.damage, 0);
  return {
    kind: input.kind,
    level,
    secondary,
    projectileCount: projectiles.length,
    ammoSpent: input.kind === "missile" ? (secondary ? Math.min(5, ammo) : Math.min(1, ammo)) : 0,
    totalDamage: Number(totalDamage.toFixed(3)),
    spreadRadians: Number(spreadFor(projectiles).toFixed(5)),
    projectiles,
    source: "origin-master-space-shooter-weapons-adapted",
    claimBoundary: "Deterministic weapon burst sampling adapted from the old space-shooter weapon concepts; this is gameplay telemetry, not a full projectile-pooling or collision system claim."
  };
}

export function sampleFpsWeaponCycle(input: FpsWeaponCycleInput): FpsWeaponCycleSample {
  const config = fpsWeaponConfig(input.weapon);
  const elapsedSeconds = Math.max(0, finite(input.elapsedSeconds ?? 0, "elapsedSeconds"));
  const currentAmmo = Math.max(0, Math.floor(input.currentAmmo ?? config.magazineSize));
  const reserveAmmo = Math.max(0, Math.floor(input.reserveAmmo ?? config.reserveAmmo));
  const fireTimer = Math.max(0, finite(input.fireTimer ?? 0, "fireTimer") - elapsedSeconds);
  const canFire = input.triggerHeld === true && input.reloadRequested !== true && fireTimer <= 0;
  const reloadRequested = input.reloadRequested === true || (currentAmmo === 0 && reserveAmmo > 0 && canFire);
  if (reloadRequested) {
    const reloadComplete = elapsedSeconds >= config.reloadTime && reserveAmmo > 0 && currentAmmo < config.magazineSize;
    const loaded = reloadComplete ? Math.min(config.magazineSize - currentAmmo, reserveAmmo) : 0;
    return {
      weapon: input.weapon,
      name: config.name,
      firingMode: config.firingMode,
      fired: false,
      emptyClick: currentAmmo === 0 && reserveAmmo === 0,
      reloading: !reloadComplete,
      reloadComplete,
      currentAmmo: currentAmmo + loaded,
      reserveAmmo: reserveAmmo - loaded,
      ammoSpent: 0,
      bulletsPerShot: 0,
      totalDamage: 0,
      range: config.range,
      spreadDegrees: config.spread,
      recoilX: 0,
      recoilY: 0,
      fireCooldown: reloadComplete ? 0 : Math.max(0, config.reloadTime - elapsedSeconds),
      muzzleFlashSeconds: 0,
      shellEjectionSeconds: 0,
      source: "origin-master-fps-weapon-adapted",
      claimBoundary: fpsWeaponClaimBoundary
    };
  }
  if (!canFire || currentAmmo <= 0) {
    return {
      weapon: input.weapon,
      name: config.name,
      firingMode: config.firingMode,
      fired: false,
      emptyClick: input.triggerHeld === true && currentAmmo <= 0,
      reloading: false,
      reloadComplete: false,
      currentAmmo,
      reserveAmmo,
      ammoSpent: 0,
      bulletsPerShot: 0,
      totalDamage: 0,
      range: config.range,
      spreadDegrees: config.spread,
      recoilX: 0,
      recoilY: 0,
      fireCooldown: fireTimer,
      muzzleFlashSeconds: 0,
      shellEjectionSeconds: 0,
      source: "origin-master-fps-weapon-adapted",
      claimBoundary: fpsWeaponClaimBoundary
    };
  }
  const seed = Math.floor(input.seed ?? currentAmmo * 31 + reserveAmmo * 17 + config.damage * 13);
  const spent = Math.min(1, currentAmmo);
  const recoil = fpsRecoil(config.recoilAmount, seed);
  return {
    weapon: input.weapon,
    name: config.name,
    firingMode: config.firingMode,
    fired: true,
    emptyClick: false,
    reloading: false,
    reloadComplete: false,
    currentAmmo: currentAmmo - spent,
    reserveAmmo,
    ammoSpent: spent,
    bulletsPerShot: config.bulletsPerShot,
    totalDamage: Number((config.damage * config.bulletsPerShot).toFixed(3)),
    range: config.range,
    spreadDegrees: config.spread,
    recoilX: recoil.x,
    recoilY: recoil.y,
    fireCooldown: Number((60 / config.fireRate).toFixed(4)),
    muzzleFlashSeconds: 0.05,
    shellEjectionSeconds: 0.2,
    source: "origin-master-fps-weapon-adapted",
    claimBoundary: fpsWeaponClaimBoundary
  };
}

export function sampleFpsEnemyTactics(input: FpsEnemyTacticsInput): FpsEnemyTacticsSample {
  const currentState = input.currentState ?? "patrol";
  const playerAlive = input.playerAlive !== false;
  const distanceToPlayer = finiteNonNegative(input.distanceToPlayer, "distanceToPlayer");
  const angleToPlayerDegrees = Math.abs(finite(input.angleToPlayerDegrees ?? 0, "angleToPlayerDegrees"));
  const maxHealth = positive(input.maxHealth ?? 100, "maxHealth");
  const health = clamp(input.health ?? maxHealth, 0, maxHealth);
  const attackTimer = finite(input.attackTimer ?? 0, "attackTimer");
  const stateTimer = Math.max(0, finite(input.stateTimer ?? 0, "stateTimer"));
  const hasCover = input.hasCover === true;
  const distanceToCover = finiteNonNegative(input.distanceToCover ?? 1_000_000, "distanceToCover");
  const hasLastKnown = input.hasLastKnownPlayerPosition === true;
  const distanceToLastKnown = finiteNonNegative(input.distanceToLastKnownPlayerPosition ?? 1_000_000, "distanceToLastKnownPlayerPosition");
  const canSeePlayer = playerAlive && distanceToPlayer <= 20 && angleToPlayerDegrees <= 60;
  const canHearPlayer = playerAlive && distanceToPlayer <= 15;
  const targetAcquired = canSeePlayer || (currentState !== "patrol" && currentState !== "idle" && currentState !== "investigate" && playerAlive);
  const lowHealth = health < maxHealth * 0.3;
  let state: FpsEnemyTacticalState;
  let nextAction: FpsEnemyTacticsSample["nextAction"];
  if (health <= 0 || currentState === "dead") {
    state = "dead";
    nextAction = "die";
  } else if (!playerAlive) {
    state = "patrol";
    nextAction = "patrol";
  } else if (canSeePlayer && lowHealth && hasCover) {
    state = "take_cover";
    nextAction = distanceToCover > 2 ? "move_to_cover" : "wait";
  } else if (canSeePlayer && lowHealth) {
    state = "flee";
    nextAction = "flee";
  } else if (canSeePlayer && distanceToPlayer <= 2) {
    state = "attack";
    nextAction = attackTimer <= 0 ? "attack" : "wait";
  } else if (canSeePlayer || targetAcquired) {
    state = "chase";
    nextAction = "chase";
  } else if (canHearPlayer || hasLastKnown) {
    state = "investigate";
    nextAction = distanceToLastKnown <= 2 && stateTimer > 3 ? "patrol" : "investigate";
  } else {
    state = stateTimer > 2 || currentState === "patrol" ? "patrol" : "idle";
    nextAction = state === "patrol" ? "patrol" : "wait";
  }
  const movementSpeed = state === "chase" || state === "flee" || state === "take_cover"
    ? 5
    : state === "patrol" || state === "investigate"
      ? 2.5
      : 0;
  return {
    state,
    canSeePlayer,
    canHearPlayer,
    targetAcquired,
    movementSpeed,
    attackReady: state === "attack" && attackTimer <= 0,
    pathRefreshRequested: state === "chase" && targetAcquired,
    coverRequested: state === "take_cover",
    inCover: state === "take_cover" && distanceToCover <= 2,
    nextAction,
    source: "origin-master-fps-enemy-ai-adapted",
    claimBoundary: "Deterministic patrol/chase/attack/flee/cover/investigate state sampling adapted from the old FPS enemy example; this is tactical runtime telemetry, not a full navmesh, ragdoll, audio, or networked FPS AI claim."
  };
}

export function sampleFpsLevelLayout(input: FpsLevelLayoutInput = {}): FpsLevelLayoutSample {
  const roomCount = Math.max(3, Math.min(12, Math.floor(input.roomCount ?? 8)));
  const gridSize = positive(input.gridSize ?? 25, "gridSize");
  const seed = Math.floor(input.seed ?? 0x1e7e1);
  const rooms = Array.from({ length: roomCount }, (_, index): FpsLevelRoom => {
    const angle = (index / roomCount) * Math.PI * 2 + seeded01(seed + index * 13) * 0.34;
    const radius = gridSize * (0.24 + seeded01(seed + index * 19) * 0.5);
    const width = 6 + Math.floor(seeded01(seed + index * 29) * 7);
    const depth = 6 + Math.floor(seeded01(seed + index * 31) * 7);
    return {
      id: `room-${index}`,
      x: Number((Math.cos(angle) * radius).toFixed(3)),
      z: Number((Math.sin(angle) * radius).toFixed(3)),
      width,
      depth
    };
  });
  const corridors = rooms.slice(1).map((room, index): FpsLevelCorridor => {
    const previous = rooms[index] ?? rooms[0]!;
    return {
      from: previous.id,
      to: room.id,
      length: Number(Math.hypot(room.x - previous.x, room.z - previous.z).toFixed(3)),
      width: 3
    };
  });
  const coverPoints = rooms.flatMap((room, roomIndex) => [0, 1].map((slot): FpsLevelPoint => ({
    id: `cover-${roomIndex}-${slot}`,
    x: Number((room.x + (slot === 0 ? -0.28 : 0.28) * room.width).toFixed(3)),
    z: Number((room.z + (slot === 0 ? 0.2 : -0.22) * room.depth).toFixed(3))
  })));
  const patrolPoints = rooms.map((room, index): FpsLevelPoint => ({
    id: `patrol-${index}`,
    x: Number(room.x.toFixed(3)),
    z: Number(room.z.toFixed(3))
  }));
  const enemySpawnPoints = rooms.slice(1, Math.min(rooms.length, 6)).map((room, index): FpsLevelPoint => ({
    id: `enemy-spawn-${index}`,
    x: Number((room.x + room.width * 0.18).toFixed(3)),
    z: Number((room.z - room.depth * 0.18).toFixed(3))
  }));
  const pickupSpawnPoints = rooms.slice(0, Math.min(rooms.length, 6)).map((room, index): FpsLevelPickup => ({
    id: `pickup-${index}`,
    type: index % 2 === 0 ? "health" : "ammo",
    x: Number((room.x - room.width * 0.18).toFixed(3)),
    z: Number((room.z + room.depth * 0.18).toFixed(3))
  }));
  const totalRoomArea = rooms.reduce((sum, room) => sum + room.width * room.depth, 0);
  const totalCorridorLength = corridors.reduce((sum, corridor) => sum + corridor.length, 0);
  return {
    rooms,
    corridors,
    coverPoints,
    patrolPoints,
    enemySpawnPoints,
    pickupSpawnPoints,
    playerSpawnPoint: { id: "player-spawn", x: rooms[0]!.x, z: rooms[0]!.z },
    navMeshPointCount: rooms.length + coverPoints.length + patrolPoints.length + enemySpawnPoints.length + pickupSpawnPoints.length,
    averageRoomArea: Number((totalRoomArea / rooms.length).toFixed(3)),
    totalCorridorLength: Number(totalCorridorLength.toFixed(3)),
    source: "origin-master-fps-level-adapted",
    claimBoundary: "Deterministic room, corridor, spawn, pickup, patrol, cover, and nav-point telemetry adapted from the old FPS level example; this is layout/runtime evidence, not a full procedural level renderer, collision mesh, or navmesh bake claim."
  };
}

export function sampleFpsHudOverlay(input: FpsHudOverlayInput): FpsHudOverlaySample {
  const maxHealth = positive(input.maxHealth ?? 100, "maxHealth");
  const health = clamp(input.health, 0, maxHealth);
  const ammo = Math.max(0, Math.floor(finite(input.ammo, "ammo")));
  const reserveAmmo = Math.max(0, Math.floor(finite(input.reserveAmmo, "reserveAmmo")));
  const healthPercent = health / maxHealth;
  const recentDamage = Math.max(0, finite(input.recentDamage ?? 0, "recentDamage"));
  const enemiesRemaining = Math.max(0, Math.floor(input.enemiesRemaining ?? 0));
  const minimapBlips = Math.max(0, Math.floor(input.minimapFriendlyCount ?? 1)) + Math.max(0, Math.floor(input.minimapEnemyCount ?? enemiesRemaining));
  return {
    healthPercent: Number(healthPercent.toFixed(4)),
    healthBarPixels: Math.round(200 * healthPercent),
    lowHealth: healthPercent <= 0.3,
    damageFlashAlpha: Number(Math.min(0.55, recentDamage / maxHealth).toFixed(4)),
    ammoText: `${ammo} / ${reserveAmmo}`,
    ammoWarning: ammo <= 5,
    crosshairSpreadPixels: Number((10 + (input.hitMarker === true ? 2 : 0) + (ammo <= 5 ? 3 : 0)).toFixed(3)),
    hitMarkerVisible: input.hitMarker === true,
    damageIndicatorAngleDegrees: Number(finite(input.damageAngleDegrees ?? 0, "damageAngleDegrees").toFixed(3)),
    minimapBlips,
    killFeedVisible: Math.max(0, Math.floor(input.killFeedCount ?? 0)) > 0,
    waveText: `WAVE: ${Math.max(1, Math.floor(input.wave ?? 1))} | ENEMIES: ${enemiesRemaining}`,
    source: "origin-master-fps-hud-adapted",
    claimBoundary: "Deterministic health, ammo, crosshair, damage, kill-feed, wave, and minimap HUD telemetry adapted from the old FPS HUD example; this is runtime UI evidence, not a complete first-person UI framework claim."
  };
}

export function sampleSpaceShooterWave(input: SpaceShooterWaveInput): SpaceShooterWaveSample {
  const wave = Math.max(1, Math.floor(positive(input.wave, "wave")));
  const width = positive(input.width ?? 1280, "width");
  const height = positive(input.height ?? 720, "height");
  const seed = Math.floor(input.seed ?? 0x5150 + wave * 97);
  const base = wave % 10 === 0 ? { enemyType: "boss" as const, count: 1, formation: "random" as const, delay: 0 } : waveDefinition(wave);
  const difficultyScale = 1 + Math.floor((wave - 1) / 10) * 0.5;
  const count = base.enemyType === "boss" ? 1 : Math.max(1, Math.floor(base.count * difficultyScale));
  const spawns = Array.from({ length: count }, (_, index) => {
    const position = formationPosition(base.formation, index, count, width, height, seed);
    const stats = enemyStats(base.enemyType);
    return {
      enemyType: base.enemyType,
      x: Number(position.x.toFixed(3)),
      y: Number(position.y.toFixed(3)),
      ...stats
    };
  });
  const powerUp = weightedPowerUp(seed ^ wave);
  return {
    wave,
    enemyType: base.enemyType,
    formation: base.formation,
    count,
    delay: base.delay,
    bossWave: base.enemyType === "boss",
    difficultyScale,
    totalScoreValue: spawns.reduce((sum, spawn) => sum + spawn.scoreValue, 0),
    spawns,
    powerUpType: powerUp.type,
    powerUpWeight: powerUp.weight,
    source: "origin-master-space-shooter-wave-powerup-adapted",
    claimBoundary: "Deterministic wave, formation, enemy-stat, and weighted power-up sampling adapted from the old space-shooter systems; this is runtime evidence, not a full shooter game loop claim."
  };
}

export function samplePowerUpEffect(input: PowerUpEffectInput): PowerUpEffectSample {
  const maxHealth = positive(input.maxHealth ?? 100, "maxHealth");
  const maxShield = positive(input.maxShield ?? 100, "maxShield");
  const before = {
    health: clamp(input.health ?? 50, 0, maxHealth),
    shield: clamp(input.shield ?? 40, 0, maxShield),
    weaponLevel: Math.max(1, Math.min(5, Math.floor(input.weaponLevel ?? 1))),
    speed: positive(input.speed ?? 320, "speed"),
    lives: Math.max(0, Math.floor(input.lives ?? 3)),
    multiplier: Math.max(1, input.multiplier ?? 1)
  };
  const after = { ...before };
  switch (input.type) {
    case "health":
      after.health = Math.min(maxHealth, after.health + 50);
      break;
    case "shield":
      after.shield = Math.min(maxShield, after.shield + 50);
      break;
    case "weapon":
      after.weaponLevel = Math.min(5, after.weaponLevel + 1);
      break;
    case "speed":
      after.speed += 100;
      break;
    case "life":
      after.lives += 1;
      break;
    case "multiplier":
      after.multiplier *= 2;
      break;
  }
  const changedFields = (Object.keys(after) as (keyof typeof after)[]).filter((key) => after[key] !== before[key]);
  return {
    type: input.type,
    ...after,
    changedFields,
    source: "origin-master-space-shooter-powerup-effects-adapted"
  };
}

function laserBurst(x: number, y: number, angle: number, level: number, secondary: boolean): readonly WeaponProjectile[] {
  if (secondary) {
    return radialBurst(x, y, 8, 1000, 7.5, 0.5);
  }
  const spread = Math.min(level - 1, 2);
  const projectiles: WeaponProjectile[] = [];
  for (let index = -spread; index <= spread; index += 1) {
    projectiles.push(projectile(x, y, angle + index * 0.1, 800, 15 * Math.pow(1.2, level - 1), 2));
  }
  return projectiles;
}

const fpsWeaponClaimBoundary = "Deterministic magazine, reload, recoil, spread, muzzle-flash, and shell-ejection sampling adapted from the old FPS weapon example; this is runtime telemetry, not a full hitscan, projectile-pooling, audio, or networked FPS weapon claim.";

function fpsWeaponConfig(weapon: FpsWeaponType): {
  readonly name: string;
  readonly damage: number;
  readonly fireRate: number;
  readonly magazineSize: number;
  readonly reserveAmmo: number;
  readonly reloadTime: number;
  readonly range: number;
  readonly spread: number;
  readonly recoilAmount: number;
  readonly firingMode: FpsFiringMode;
  readonly bulletsPerShot: number;
} {
  switch (weapon) {
    case "pistol":
      return { name: "M1911 Pistol", damage: 25, fireRate: 300, magazineSize: 12, reserveAmmo: 60, reloadTime: 1.5, range: 50, spread: 2, recoilAmount: 0.3, firingMode: "single", bulletsPerShot: 1 };
    case "rifle":
      return { name: "M4A1 Rifle", damage: 30, fireRate: 700, magazineSize: 30, reserveAmmo: 120, reloadTime: 2, range: 100, spread: 1, recoilAmount: 0.2, firingMode: "auto", bulletsPerShot: 1 };
    case "shotgun":
      return { name: "Pump Shotgun", damage: 15, fireRate: 80, magazineSize: 8, reserveAmmo: 32, reloadTime: 3, range: 30, spread: 10, recoilAmount: 1, firingMode: "single", bulletsPerShot: 8 };
  }
}

function fpsRecoil(amount: number, seed: number): { readonly x: number; readonly y: number } {
  const horizontal = seededUnit(seed) * 2 - 1;
  const vertical = 0.72 + seededUnit(seed ^ 0x9e3779b9) * 0.28;
  return {
    x: Number((horizontal * amount * 0.35).toFixed(4)),
    y: Number((vertical * amount).toFixed(4))
  };
}

function seededUnit(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 10_000) / 10_000;
}

function missileBurst(x: number, y: number, angle: number, level: number, secondary: boolean, ammo: number): readonly WeaponProjectile[] {
  if (ammo < (secondary ? 5 : 1)) return [];
  const projectiles: WeaponProjectile[] = [];
  if (secondary) {
    for (let index = 0; index < 12; index += 1) {
      projectiles.push(projectile(x, y, angle + (index - 6) * 0.15, 500, 75 * Math.pow(1.2, level - 1), 4));
    }
    return projectiles;
  }
  const count = Math.min(Math.floor(level / 2) + 1, 3);
  for (let index = 0; index < count; index += 1) {
    const offset = index - (count - 1) / 2;
    const px = x - Math.sin(angle) * offset * 20;
    const py = y + Math.cos(angle) * offset * 20;
    projectiles.push(projectile(px, py, angle, 400, 50 * Math.pow(1.2, level - 1), 3));
  }
  return projectiles;
}

function plasmaBurst(x: number, y: number, angle: number, level: number, secondary: boolean): readonly WeaponProjectile[] {
  if (secondary) {
    return [0, 1, 2].flatMap((wave) => radialBurst(x, y, 16, 700 + wave * 100, 20 * Math.pow(1.2, level - 1), 1));
  }
  const shots = 3 + level;
  const spreadAngle = 0.3 + level * 0.1;
  const projectiles: WeaponProjectile[] = [];
  for (let index = 0; index < shots; index += 1) {
    projectiles.push(projectile(x, y, angle + (index - (shots - 1) / 2) * (spreadAngle / shots), 600, 25 * Math.pow(1.2, level - 1), 1.5));
  }
  return projectiles;
}

function radialBurst(x: number, y: number, count: number, speed: number, damage: number, lifetime: number): readonly WeaponProjectile[] {
  return Array.from({ length: count }, (_, index) => projectile(x, y, (index / count) * Math.PI * 2, speed, damage, lifetime));
}

function projectile(x: number, y: number, angle: number, speed: number, damage: number, lifetime: number): WeaponProjectile {
  return {
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3)),
    vx: Number((Math.cos(angle) * speed).toFixed(3)),
    vy: Number((Math.sin(angle) * speed).toFixed(3)),
    damage: Number(damage.toFixed(3)),
    lifetime
  };
}

function waveDefinition(wave: number): { readonly enemyType: SpaceShooterEnemyType; readonly count: number; readonly formation: SpaceShooterFormation; readonly delay: number } {
  const waves = [
    { enemyType: "fighter", count: 5, formation: "line", delay: 0.5 },
    { enemyType: "fighter", count: 8, formation: "v-formation", delay: 0.4 },
    { enemyType: "bomber", count: 4, formation: "line", delay: 0.8 },
    { enemyType: "fighter", count: 10, formation: "surround", delay: 0.3 },
    { enemyType: "turret", count: 6, formation: "random", delay: 0.6 },
    { enemyType: "bomber", count: 6, formation: "sides", delay: 0.5 },
    { enemyType: "fighter", count: 12, formation: "v-formation", delay: 0.3 },
    { enemyType: "carrier", count: 2, formation: "line", delay: 2 },
    { enemyType: "turret", count: 8, formation: "surround", delay: 0.5 }
  ] as const;
  return waves[(wave - 1) % waves.length] ?? waves[0];
}

function formationPosition(formation: SpaceShooterFormation, index: number, total: number, width: number, height: number, seed: number): { readonly x: number; readonly y: number } {
  const padding = 100;
  const usableWidth = Math.max(1, width - padding * 2);
  switch (formation) {
    case "line":
      return { x: padding + (index / Math.max(1, total - 1)) * usableWidth, y: -50 };
    case "v-formation": {
      const centerIndex = (total - 1) / 2;
      return { x: padding + (index / Math.max(1, total - 1)) * usableWidth, y: -50 - Math.abs(index - centerIndex) * 40 };
    }
    case "surround": {
      const angle = (index / total) * Math.PI;
      return { x: width / 2 + Math.cos(angle - Math.PI / 2) * 300, y: -100 + Math.sin(angle - Math.PI / 2) * 300 };
    }
    case "sides": {
      const side = index % 2;
      const groupIndex = Math.floor(index / 2);
      return { x: side === 0 ? padding : width - padding, y: -50 - groupIndex * 80 };
    }
    case "random":
      return { x: padding + seeded01(seed + index * 17) * usableWidth, y: -50 - seeded01(seed + index * 31) * Math.max(80, height * 0.28) };
  }
}

function enemyStats(enemyType: SpaceShooterEnemyType): Omit<SpaceShooterSpawn, "enemyType" | "x" | "y"> {
  switch (enemyType) {
    case "fighter":
      return { health: 30, radius: 15, scoreValue: 100 };
    case "bomber":
      return { health: 80, radius: 25, scoreValue: 250 };
    case "turret":
      return { health: 100, radius: 20, scoreValue: 300 };
    case "carrier":
      return { health: 200, radius: 35, scoreValue: 600 };
    case "boss":
      return { health: 1000, radius: 80, scoreValue: 5000 };
  }
}

function weightedPowerUp(seed: number): { readonly type: SpaceShooterPowerUpType; readonly weight: number } {
  const entries = [
    ["health", 30],
    ["shield", 30],
    ["weapon", 25],
    ["speed", 10],
    ["life", 3],
    ["multiplier", 2]
  ] as const;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = seeded01(seed) * total;
  for (const [type, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return { type, weight };
  }
  return { type: "health", weight: 30 };
}

function seeded01(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function spreadFor(projectiles: readonly WeaponProjectile[]): number {
  if (projectiles.length <= 1) return 0;
  const angles = projectiles.map((entry) => Math.atan2(entry.vy, entry.vx)).sort((left, right) => left - right);
  return (angles[angles.length - 1] ?? 0) - (angles[0] ?? 0);
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`Weapon burst ${label} must be finite.`);
  return value;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Weapon burst ${label} must be finite and positive.`);
  return value;
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Weapon burst ${label} must be finite and non-negative.`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

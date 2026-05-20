import assert from "node:assert/strict";
import { test } from "vitest";
import { sampleAdaptiveDifficultyFixture, sampleFpsEnemyTactics, sampleFpsHudOverlay, sampleFpsLevelLayout, sampleFpsWeaponCycle, sampleNetworkReplicationFixture, samplePowerUpEffect, sampleSpaceShooterWave, sampleWeaponBurst } from "../../../packages/scripting/src/index.js";

test("weapon burst sampler adapts old laser spread and radial secondary patterns", () => {
  const primary = sampleWeaponBurst({ kind: "laser", level: 3, angle: 0.25 });
  const secondary = sampleWeaponBurst({ kind: "laser", level: 3, secondary: true });

  assert.equal(primary.source, "origin-master-space-shooter-weapons-adapted");
  assert.equal(primary.projectileCount, 5);
  assert.equal(primary.ammoSpent, 0);
  assert.ok(primary.totalDamage > 70);
  assert.ok(primary.spreadRadians > 0);
  assert.equal(secondary.projectileCount, 8);
  assert.ok(secondary.spreadRadians > 5);
});

test("weapon burst sampler handles missile ammo and plasma waves deterministically", () => {
  const missile = sampleWeaponBurst({ kind: "missile", level: 5, ammo: 20 });
  const emptyMissile = sampleWeaponBurst({ kind: "missile", level: 5, ammo: 0 });
  const plasmaSecondary = sampleWeaponBurst({ kind: "plasma", level: 4, secondary: true });

  assert.equal(missile.projectileCount, 3);
  assert.equal(missile.ammoSpent, 1);
  assert.equal(emptyMissile.projectileCount, 0);
  assert.equal(plasmaSecondary.projectileCount, 48);
  assert.ok(plasmaSecondary.totalDamage > missile.totalDamage);
  assert.throws(() => sampleWeaponBurst({ kind: "laser", ammo: -1 }), /ammo/);
});

test("fps weapon cycle sampler adapts magazine, reload, recoil, and effect timing", () => {
  const rifle = sampleFpsWeaponCycle({
    weapon: "rifle",
    triggerHeld: true,
    currentAmmo: 30,
    reserveAmmo: 120,
    seed: 42
  });
  const shotgun = sampleFpsWeaponCycle({
    weapon: "shotgun",
    triggerHeld: true,
    currentAmmo: 8,
    reserveAmmo: 32,
    seed: 17
  });
  const reloaded = sampleFpsWeaponCycle({
    weapon: "pistol",
    reloadRequested: true,
    elapsedSeconds: 1.6,
    currentAmmo: 3,
    reserveAmmo: 20
  });
  const empty = sampleFpsWeaponCycle({
    weapon: "pistol",
    triggerHeld: true,
    currentAmmo: 0,
    reserveAmmo: 0
  });

  assert.equal(rifle.source, "origin-master-fps-weapon-adapted");
  assert.equal(rifle.fired, true);
  assert.equal(rifle.name, "M4A1 Rifle");
  assert.equal(rifle.firingMode, "auto");
  assert.equal(rifle.currentAmmo, 29);
  assert.equal(rifle.ammoSpent, 1);
  assert.ok(rifle.fireCooldown > 0);
  assert.ok(rifle.muzzleFlashSeconds > 0);
  assert.ok(rifle.shellEjectionSeconds > 0);
  assert.notEqual(rifle.recoilY, 0);
  assert.equal(shotgun.bulletsPerShot, 8);
  assert.equal(shotgun.totalDamage, 120);
  assert.equal(shotgun.spreadDegrees, 10);
  assert.equal(reloaded.reloadComplete, true);
  assert.equal(reloaded.currentAmmo, 12);
  assert.equal(reloaded.reserveAmmo, 11);
  assert.equal(empty.emptyClick, true);
  assert.equal(empty.fired, false);
});

test("fps enemy tactics sampler adapts patrol, chase, attack, cover, and investigate state choices", () => {
  const attack = sampleFpsEnemyTactics({
    currentState: "chase",
    distanceToPlayer: 1.5,
    angleToPlayerDegrees: 10,
    health: 100,
    attackTimer: 0
  });
  const cover = sampleFpsEnemyTactics({
    currentState: "chase",
    distanceToPlayer: 8,
    angleToPlayerDegrees: 18,
    health: 22,
    hasCover: true,
    distanceToCover: 1.2
  });
  const investigate = sampleFpsEnemyTactics({
    currentState: "patrol",
    distanceToPlayer: 12,
    angleToPlayerDegrees: 120,
    hasLastKnownPlayerPosition: true,
    distanceToLastKnownPlayerPosition: 5
  });
  const dead = sampleFpsEnemyTactics({
    distanceToPlayer: 4,
    health: 0
  });

  assert.equal(attack.source, "origin-master-fps-enemy-ai-adapted");
  assert.equal(attack.state, "attack");
  assert.equal(attack.nextAction, "attack");
  assert.equal(attack.attackReady, true);
  assert.equal(cover.state, "take_cover");
  assert.equal(cover.coverRequested, true);
  assert.equal(cover.inCover, true);
  assert.equal(investigate.state, "investigate");
  assert.equal(investigate.canHearPlayer, true);
  assert.equal(investigate.nextAction, "investigate");
  assert.equal(dead.state, "dead");
  assert.equal(dead.nextAction, "die");
  assert.throws(() => sampleFpsEnemyTactics({ distanceToPlayer: -1 }), /distanceToPlayer/);
});

test("fps level layout sampler adapts rooms, corridors, cover, spawns, pickups, and nav points", () => {
  const level = sampleFpsLevelLayout({ seed: 1234, roomCount: 8, gridSize: 25 });
  const repeat = sampleFpsLevelLayout({ seed: 1234, roomCount: 8, gridSize: 25 });

  assert.equal(level.source, "origin-master-fps-level-adapted");
  assert.deepEqual(level, repeat);
  assert.equal(level.rooms.length, 8);
  assert.equal(level.corridors.length, 7);
  assert.equal(level.coverPoints.length, 16);
  assert.equal(level.patrolPoints.length, 8);
  assert.ok(level.enemySpawnPoints.length >= 4);
  assert.ok(level.pickupSpawnPoints.some((point) => point.type === "health"));
  assert.ok(level.pickupSpawnPoints.some((point) => point.type === "ammo"));
  assert.ok(level.navMeshPointCount > level.rooms.length);
  assert.ok(level.averageRoomArea >= 36);
  assert.ok(level.totalCorridorLength > 0);
  assert.equal(level.playerSpawnPoint.id, "player-spawn");
  assert.throws(() => sampleFpsLevelLayout({ gridSize: 0 }), /gridSize/);
});

test("fps hud overlay sampler adapts health, ammo, crosshair, damage, kill feed, and minimap telemetry", () => {
  const hud = sampleFpsHudOverlay({
    health: 24,
    maxHealth: 100,
    ammo: 4,
    reserveAmmo: 36,
    score: 1200,
    wave: 3,
    enemiesRemaining: 7,
    recentDamage: 35,
    hitMarker: true,
    damageAngleDegrees: 92,
    minimapFriendlyCount: 2,
    minimapEnemyCount: 7,
    killFeedCount: 2
  });

  assert.equal(hud.source, "origin-master-fps-hud-adapted");
  assert.equal(hud.healthPercent, 0.24);
  assert.equal(hud.healthBarPixels, 48);
  assert.equal(hud.lowHealth, true);
  assert.equal(hud.ammoText, "4 / 36");
  assert.equal(hud.ammoWarning, true);
  assert.equal(hud.hitMarkerVisible, true);
  assert.equal(hud.damageIndicatorAngleDegrees, 92);
  assert.equal(hud.minimapBlips, 9);
  assert.equal(hud.killFeedVisible, true);
  assert.equal(hud.waveText, "WAVE: 3 | ENEMIES: 7");
  assert.ok(hud.damageFlashAlpha > 0);
  assert.ok(hud.crosshairSpreadPixels > 10);
  assert.throws(() => sampleFpsHudOverlay({ health: 10, maxHealth: 0, ammo: 1, reserveAmmo: 1 }), /maxHealth/);
});

test("space shooter wave sampler adapts formations, boss waves, and weighted powerups", () => {
  const vFormation = sampleSpaceShooterWave({ wave: 2, width: 1280, height: 720, seed: 7 });
  const boss = sampleSpaceShooterWave({ wave: 10, width: 1280, height: 720, seed: 7 });
  const scaled = sampleSpaceShooterWave({ wave: 12, width: 1280, height: 720, seed: 7 });

  assert.equal(vFormation.source, "origin-master-space-shooter-wave-powerup-adapted");
  assert.equal(vFormation.enemyType, "fighter");
  assert.equal(vFormation.formation, "v-formation");
  assert.equal(vFormation.count, 8);
  assert.ok(vFormation.spawns.some((spawn) => spawn.y < -50));
  assert.equal(boss.bossWave, true);
  assert.equal(boss.spawns[0]?.health, 1000);
  assert.equal(boss.totalScoreValue, 5000);
  assert.ok(["health", "shield", "weapon", "speed", "life", "multiplier"].includes(vFormation.powerUpType));
  assert.ok(vFormation.powerUpWeight > 0);
  assert.ok(scaled.difficultyScale > 1);
  assert.ok(scaled.count > vFormation.count || scaled.enemyType !== vFormation.enemyType);
  assert.throws(() => sampleSpaceShooterWave({ wave: 0 }), /wave/);
});

test("power-up effect sampler adapts old ship effect semantics", () => {
  const health = samplePowerUpEffect({ type: "health", health: 70, maxHealth: 100 });
  const shield = samplePowerUpEffect({ type: "shield", shield: 65, maxShield: 100 });
  const weapon = samplePowerUpEffect({ type: "weapon", weaponLevel: 3 });
  const speed = samplePowerUpEffect({ type: "speed", speed: 320 });
  const life = samplePowerUpEffect({ type: "life", lives: 2 });
  const multiplier = samplePowerUpEffect({ type: "multiplier", multiplier: 2 });

  assert.equal(health.health, 100);
  assert.deepEqual(health.changedFields, ["health"]);
  assert.equal(shield.shield, 100);
  assert.equal(weapon.weaponLevel, 4);
  assert.equal(speed.speed, 420);
  assert.equal(life.lives, 3);
  assert.equal(multiplier.multiplier, 4);
  assert.equal(multiplier.source, "origin-master-space-shooter-powerup-effects-adapted");
});

test("adaptive difficulty fixture adapts old balancing metrics, rules, and blocked claims", () => {
  const fixture = sampleAdaptiveDifficultyFixture({
    strategy: "gradual",
    recentDeaths: 4,
    completionTimeSeconds: 118,
    accuracy: 0.38,
    resourceEfficiency: 0.76,
    progressionRate: 0.48,
    playerSkill: 0.45,
    seed: 2025
  });
  const repeat = sampleAdaptiveDifficultyFixture({
    strategy: "gradual",
    recentDeaths: 4,
    completionTimeSeconds: 118,
    accuracy: 0.38,
    resourceEfficiency: 0.76,
    progressionRate: 0.48,
    playerSkill: 0.45,
    seed: 2025
  });

  assert.equal(fixture.source, "origin-master-ai-balancing-smart-difficulty-adapted");
  assert.deepEqual(fixture, repeat);
  assert.equal(fixture.metrics.length, 9);
  assert.ok(fixture.metrics.every((metric) => metric.count === 9));
  assert.ok(fixture.triggeredRules.some((rule) => rule.id === "death-rate-relief"));
  assert.ok(fixture.triggeredRules.some((rule) => rule.id === "slow-completion-timer"));
  assert.ok(fixture.triggeredRules.some((rule) => rule.id === "low-accuracy-resource-support"));
  assert.ok(fixture.triggeredRules.some((rule) => rule.id === "retry-checkpoint-support"));
  assert.ok(fixture.adjustment.enemyDamage < 1);
  assert.ok(fixture.adjustment.timerMultiplier > 1);
  assert.ok(fixture.adjustment.resourceDropRate > 1);
  assert.ok(fixture.adjustment.checkpointMultiplier > 1);
  assert.equal(fixture.appliedChangeCount, fixture.triggeredRules.length);
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.ok(fixture.blockedClaims.includes("Unity/Unreal AI middleware parity"));
  assert.match(fixture.claimBoundary, /not production DDA/);
  assert.throws(() => sampleAdaptiveDifficultyFixture({ seed: 1.5 }), /seed/);
});

test("network replication fixture adapts old prediction, reconciliation, delta, and interest concepts", () => {
  const fixture = sampleNetworkReplicationFixture({
    seed: 4096,
    latencyMs: 72,
    jitterMs: 9,
    interestRadius: 18
  });
  const repeat = sampleNetworkReplicationFixture({
    seed: 4096,
    latencyMs: 72,
    jitterMs: 9,
    interestRadius: 18
  });

  assert.equal(fixture.source, "origin-master-net-prediction-replication-adapted");
  assert.deepEqual(fixture, repeat);
  assert.equal(fixture.tickRate, 60);
  assert.equal(fixture.inputFrames.length, 6);
  assert.equal(fixture.prediction.inputCount, 6);
  assert.equal(fixture.prediction.acknowledgedSequence, 102);
  assert.equal(fixture.prediction.pendingInputs, 3);
  assert.ok(fixture.prediction.predictionError > 0);
  assert.equal(fixture.prediction.reconciliationAccepted, true);
  assert.ok(fixture.delta.changedFields.includes("health"));
  assert.ok(fixture.delta.changedFields.includes("ammo"));
  assert.ok(fixture.delta.changedFields.includes("animation"));
  assert.equal(fixture.delta.reconstructedMatches, true);
  assert.ok(fixture.delta.compressionRatio < 1);
  assert.ok(fixture.delta.bytesSaved > 0);
  assert.ok(fixture.interest.relevant.includes("net-enemy-alpha"));
  assert.ok(fixture.interest.relevant.includes("net-loot-health"));
  assert.ok(fixture.interest.culled.includes("net-distant-prop"));
  assert.ok(fixture.interest.culled.includes("net-owner-secret"));
  assert.ok(fixture.interest.added.length > 0);
  assert.ok(fixture.interest.removed.includes("net-distant-prop"));
  assert.deepEqual(fixture.interpolation.interpolatedPosition, [4.5, 0, -3.25]);
  assert.ok(fixture.blockedClaims.includes("Unity Netcode parity"));
  assert.ok(fixture.blockedClaims.includes("Unreal replication parity"));
  assert.match(fixture.claimBoundary, /does not open sockets/);
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.throws(() => sampleNetworkReplicationFixture({ latencyMs: -1 }), /latencyMs/);
});

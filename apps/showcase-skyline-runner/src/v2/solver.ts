// Physical character solver + physics-proof counters — extracted from
// boot.ts for 14-LOC. Identical step ordering and accounting.
import type { GamePlatformerSnapshot } from "@aura3d/engine";
import { SKYLINE_CHARACTER_HEIGHT } from "../gameplay/level";
import { createSkylineCharacterWorld } from "../legacy/character-world";

export const SKYLINE_AUTHORITY_DESYNC_GAME_UNITS = SKYLINE_CHARACTER_HEIGHT * 2.5;

export function createSkylineSolver(characterWorld: ReturnType<typeof createSkylineCharacterWorld>, initialSupportedY: number) {
  const physicsProof = {
    solverSteps: 0,
    solverGroundedFrames: 0,
    solverAirborneFrames: 0,
    solverCollisionFrames: 0,
    respawnTeleportsApplied: 0,
    desyncRecoveries: 0,
    liftCarriedSteps: 0,
    airborneTransitions: 0,
    solverLandings: 0,
    maxJumpApexGameUnits: 0,
    maxDescentSpeedGameUnitsPerSecond: 0,
    lastAuthorityDriftGameUnits: 0,
    maxAuthorityDriftGameUnits: 0
  };
  let solverVelocity = { x: 0, y: 0 };
  let lastSupportedY = initialSupportedY;
  let solverWasAirborne = false;
  let currentArcApex = 0;

  function solverReset(x: number, y: number): void {
    solverVelocity = { x: 0, y: 0 };
    lastSupportedY = y;
    solverWasAirborne = false;
  }

  function advancePhysicalCharacter(frameSeconds: number, authored: GamePlatformerSnapshot): GamePlatformerSnapshot {
    const teleported = authored.events.some(
      (event: (typeof authored.events)[number]) => event.type === "respawn" || event.type === "reset"
    );
    const solverPosition = characterWorld.position();
    const driftFromRules = Math.hypot(authored.player.x - solverPosition.x, authored.player.y - solverPosition.y);
    const desynced = !teleported && (!Number.isFinite(driftFromRules) || driftFromRules > SKYLINE_AUTHORITY_DESYNC_GAME_UNITS);
    if (teleported || desynced) {
      if (desynced) physicsProof.desyncRecoveries += 1;
      if (teleported) physicsProof.respawnTeleportsApplied += 1;
      characterWorld.place({ x: authored.player.x, y: authored.player.y }, authored.time);
      solverVelocity = { x: 0, y: 0 };
      lastSupportedY = authored.player.y;
      solverWasAirborne = false;
    }
    const intent = authored.status === "completed" ? { vx: 0, vy: 0 } : { vx: authored.player.vx, vy: authored.player.vy };
    const steps = characterWorld.advance(frameSeconds, intent);
    const last = steps[steps.length - 1];
    physicsProof.solverSteps += steps.length;
    if (last) {
      const drift = Math.hypot(last.position.x - authored.player.x, last.position.y - authored.player.y);
      physicsProof.lastAuthorityDriftGameUnits = drift;
      physicsProof.maxAuthorityDriftGameUnits = Math.max(physicsProof.maxAuthorityDriftGameUnits, drift);
      solverVelocity = last.velocity;
      if (last.collisions > 0) physicsProof.solverCollisionFrames += 1;
      if (last.ridingLiftId) physicsProof.liftCarriedSteps += 1;
      physicsProof.maxDescentSpeedGameUnitsPerSecond = Math.max(
        physicsProof.maxDescentSpeedGameUnitsPerSecond,
        Math.max(0, -last.velocity.y)
      );
    }
    const grounded = characterWorld.grounded();
    const pose = characterWorld.position();
    if (grounded) {
      physicsProof.solverGroundedFrames += 1;
      if (solverWasAirborne) {
        physicsProof.solverLandings += 1;
        physicsProof.maxJumpApexGameUnits = Math.max(physicsProof.maxJumpApexGameUnits, currentArcApex);
        currentArcApex = 0;
        solverWasAirborne = false;
      }
      lastSupportedY = pose.y;
    } else {
      physicsProof.solverAirborneFrames += 1;
      if (!solverWasAirborne) physicsProof.airborneTransitions += 1;
      solverWasAirborne = true;
      currentArcApex = Math.max(currentArcApex, pose.y - lastSupportedY);
    }
    return {
      ...authored,
      player: { ...authored.player, x: pose.x, y: pose.y, vx: solverVelocity.x, vy: solverVelocity.y, grounded }
    };
  }

  return { physicsProof, advancePhysicalCharacter, solverReset };
}

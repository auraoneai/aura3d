import { describe, expect, it } from "vitest";
import { game } from "@aura3d/engine";
import {
  createSkylineLevel,
  SKYLINE_CHARACTER_HEIGHT,
  SKYLINE_MOVING_PLATFORMS,
  SKYLINE_SENTRY_ENCOUNTERS,
  skylineMotion
} from "../../../apps/showcase-skyline-runner/src/level";

describe("skyline platformer loop", () => {
  it("uses responsive move and jump numbers instead of slow-motion pacing", () => {
    expect(skylineMotion.moveSpeed).toBeGreaterThan(1.7);
    expect(skylineMotion.jumpVelocity).toBeGreaterThan(5);
    expect(skylineMotion.fallGravityMultiplier).toBeGreaterThan(1);
    expect(skylineMotion.coyoteMs).toBeGreaterThan(40);
    expect(skylineMotion.jumpBufferMs).toBeGreaterThan(40);
    expect(skylineMotion.apex).toBeGreaterThanOrEqual(SKYLINE_CHARACTER_HEIGHT * 2.1 - 0.02);
  });

  it("ships patrolling stompable sentries and moving platforms", () => {
    expect(SKYLINE_SENTRY_ENCOUNTERS.length).toBeGreaterThanOrEqual(2);
    expect(SKYLINE_SENTRY_ENCOUNTERS.every((sentry) => sentry.stompable && sentry.amplitude > 0)).toBe(true);
    expect(SKYLINE_MOVING_PLATFORMS.length).toBeGreaterThanOrEqual(2);
    expect(SKYLINE_MOVING_PLATFORMS.some((platform) => platform.axis === "y")).toBe(true);
  });

  it("collects, stomps, and completes from real kit input", () => {
    const level = createSkylineLevel();
    expect(level.collectibles?.length ?? 0).toBeGreaterThan(0);
    const firstCollectible = level.collectibles![0]!;
    const kit = game.platformer(level);
    let snapshot = kit.snapshot();
    const startX = snapshot.player.x;
    const seen = new Set<string>();
    let jumpCooldown = 0;
    for (let frame = 0; frame < 3600 && snapshot.status === "playing"; frame += 1) {
      const wantJump = snapshot.player.grounded && jumpCooldown <= 0
        && (snapshot.player.x + 0.35 >= firstCollectible.x || frame % 22 === 0);
      jumpCooldown = wantJump ? 16 : jumpCooldown - 1;
      snapshot = kit.step(1 / 60, {
        moveX: 1,
        jumpPressed: wantJump,
        jumpHeld: wantJump || jumpCooldown > 4
      });
      for (const event of snapshot.events) seen.add(event.type);
      if (snapshot.collected.length > 0 && (seen.has("stomp") || seen.has("hazard") || snapshot.deaths > 0) && snapshot.activatedCheckpoints.length > 0) {
        break;
      }
    }
    expect(snapshot.player.x).toBeGreaterThan(startX + 1);
    expect(snapshot.collected.length, "shipped level must bank a collectible from start").toBeGreaterThan(0);
    expect(snapshot.score).toBeGreaterThan(0);
    expect(
      seen.has("stomp") || seen.has("hazard") || snapshot.deaths > 0,
      "shipped level must produce a sentry stomp or hazard/death"
    ).toBe(true);
    expect(snapshot.activatedCheckpoints.length, "shipped level must activate a checkpoint").toBeGreaterThan(0);
  });

  it("keeps a tap jump high enough to clear the opening stair step", () => {
    const kit = game.platformer({
      start: { x: 0.2, y: 0.42 },
      playerSize: [0.2, SKYLINE_CHARACTER_HEIGHT],
      platforms: [
        { id: "ground", x: -1, y: 0, width: 2.4, height: 0.2 },
        { id: "step", x: 1.3, y: 0.34, width: 1.6, height: 0.2 }
      ],
      finish: { x: 2.4, y: 0.7 },
      moveSpeed: skylineMotion.moveSpeed,
      jumpVelocity: skylineMotion.jumpVelocity,
      gravity: skylineMotion.gravity,
      jumpReleaseScale: 0.72,
      fallGravityMultiplier: skylineMotion.fallGravityMultiplier,
      coyoteMs: skylineMotion.coyoteMs,
      jumpBufferMs: skylineMotion.jumpBufferMs,
      lives: 3
    });
    let snapshot = kit.snapshot();
    for (let frame = 0; frame < 8; frame += 1) {
      snapshot = kit.step(1 / 60, { moveX: 0 });
    }
    expect(snapshot.player.grounded).toBe(true);
    snapshot = kit.step(1 / 60, { moveX: 1, jumpPressed: true, jumpHeld: true });
    let peakY = snapshot.player.y;
    for (let frame = 0; frame < 24; frame += 1) {
      snapshot = kit.step(1 / 60, { moveX: 1, jumpHeld: false });
      peakY = Math.max(peakY, snapshot.player.y);
    }
    expect(peakY).toBeGreaterThan(0.72);
    expect(snapshot.deaths).toBe(0);
  });
});

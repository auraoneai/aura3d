// tests/qr/prd14/skyline-runner/v2-shell.test.ts — T2.x contracts for the
// skyline-runner v2 shell: direction conformance, follow2d rig behaviour,
// union-scene coverage, act visibility bookkeeping.
import { describe, expect, it } from "vitest";
import direction from "../../../../apps/showcase-skyline-runner/art/direction";
import {
  SKYLINE_CAMERA_FOV,
  skylinePoseFor
} from "../../../../apps/showcase-skyline-runner/src/v2/scene/camera";
import { skylineWorldNodes } from "../../../../apps/showcase-skyline-runner/src/v2/scene/world";
import {
  applySkylineScenario,
  parseSkylineScenario
} from "../../../../apps/showcase-skyline-runner/src/v2/scenarios";

describe("skyline-runner v2 direction contract", () => {
  it("uses follow2d within the declared fov band", () => {
    expect(direction.framing.rig).toBe("follow2d");
    expect(SKYLINE_CAMERA_FOV).toBeGreaterThanOrEqual(direction.framing.fovDeg[0]);
    expect(SKYLINE_CAMERA_FOV).toBeLessThanOrEqual(direction.framing.fovDeg[1]);
  });

  it("declares a 5500K shadowed key and two practicals", () => {
    expect(direction.lighting.key.type).toBe("directional");
    expect(direction.lighting.key.colorTemperatureK).toBe(5500);
    expect(direction.lighting.key.shadow).toBe(true);
    expect(direction.lighting.practicals).toBe(2);
    expect(direction.lighting.fill).toBe("ibl");
  });
});

describe("skyline-runner follow2d pose", () => {
  it("follows the player along the course axis and leads in the facing direction", () => {
    const atStart = skylinePoseFor({ playerX: 4, playerY: 0.4, facing: 1 });
    const ahead = skylinePoseFor({ playerX: 8, playerY: 0.4, facing: 1 });
    expect(ahead.position[0]).toBeGreaterThan(atStart.position[0]);
    expect(ahead.target[0]).toBeGreaterThan(atStart.target[0]);
    const leadRight = skylinePoseFor({ playerX: 4, playerY: 0.4, facing: 1 });
    const leadLeft = skylinePoseFor({ playerX: 4, playerY: 0.4, facing: -1 });
    expect(leadRight.target[0] - leadRight.position[0]).toBeGreaterThan(0);
    expect(leadLeft.target[0] - leadLeft.position[0]).toBeLessThan(0);
  });

  it("stays a side-scroller: eye and target share the play-plane depth line", () => {
    const pose = skylinePoseFor({ playerX: 10, playerY: 1.2, facing: 1 });
    expect(pose.position[2]).toBeGreaterThan(pose.target[2]);
    expect(Math.abs(pose.target[2] - 0.42)).toBeLessThan(0.2);
    // Camera height above the player keeps the course in the lower frame.
    expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
  });

  it("keeps the subject inside the declared height fraction band", () => {
    const pose = skylinePoseFor({ playerX: 6, playerY: 0.4, facing: 1 });
    const distance = Math.hypot(
      pose.position[0] - pose.target[0],
      pose.position[1] - pose.target[1],
      pose.position[2] - pose.target[2]
    );
    const visibleHeight = 2 * distance * Math.tan((pose.fov * Math.PI) / 360);
    const renderedHero = 0.44 * 1.22;
    const fraction = renderedHero / visibleHeight;
    expect(fraction).toBeGreaterThanOrEqual(direction.framing.subjectHeightFraction[0]);
    expect(fraction).toBeLessThanOrEqual(direction.framing.subjectHeightFraction[1]);
  });
});

describe("skyline-runner union scene", () => {
  const world = skylineWorldNodes();

  it("mounts the whole course once — world, ledges, hazards, gates, hero", () => {
    expect(world.nodes.length).toBeGreaterThan(80);
  });

  it("tracks act-local node ids for visibility swaps (zero scene swaps)", () => {
    const acts = Object.keys(world.actNodeIds).map(Number);
    expect(acts.length).toBeGreaterThanOrEqual(5);
    for (const ids of Object.values(world.actNodeIds)) {
      expect(ids.length).toBeGreaterThan(0);
    }
  });
});

describe("skyline-runner scenarios", () => {
  it("parses capture aliases", () => {
    expect(parseSkylineScenario("mid-run")).toBe("mid-run");
    expect(parseSkylineScenario("summit")).toBe("summit");
    expect(parseSkylineScenario("autorun")).toBe("autorun");
    expect(parseSkylineScenario("bogus")).toBeNull();
  });

  it("drives scenario hooks through real respawn paths", () => {
    const calls: string[] = [];
    const hooks = {
      respawnAt: (id: string) => calls.push(`respawn:${id}`),
      startAutorun: () => calls.push("autorun")
    };
    applySkylineScenario("mid-run", hooks);
    applySkylineScenario("summit", hooks);
    applySkylineScenario("autorun", hooks);
    expect(calls.filter((c) => c.startsWith("respawn:")).length).toBe(2);
    expect(calls).toContain("autorun");
    expect(calls[0]).toMatch(/^respawn:asset-checkpoint/);
  });
});

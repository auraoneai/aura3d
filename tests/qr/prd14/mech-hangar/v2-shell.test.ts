// tests/qr/prd14/mech-hangar/v2-shell.test.ts — v2 shell contract checks for
// Mech Hangar (wave-4, fighting rig).
import { describe, expect, it } from "vitest";
import direction from "../../../../apps/showcase-mech-hangar/art/direction";
import { mechPoseFor, MECH_CAMERA_FOV, MECH_CAMERA_DISTANCE } from "../../../../apps/showcase-mech-hangar/src/v2/scene/camera";
import { mechLighting } from "../../../../apps/showcase-mech-hangar/src/v2/scene/lighting";
import { mechWorldNodes, ARENA_CENTER_Z } from "../../../../apps/showcase-mech-hangar/src/v2/scene/world";
import { applyMechScenario, parseMechScenario } from "../../../../apps/showcase-mech-hangar/src/v2/scenarios";

describe("mech-hangar art direction contract", () => {
  it("declares the fighting rig with a 45-55° fov band", () => {
    expect(direction.framing.rig).toBe("fighting");
    expect(direction.framing.fovDeg[0]).toBeLessThanOrEqual(MECH_CAMERA_FOV);
    expect(direction.framing.fovDeg[1]).toBeGreaterThanOrEqual(MECH_CAMERA_FOV);
  });

  it("keeps a shadowed 6500K key, ibl fill and 3 practicals", () => {
    expect(direction.lighting.key).toEqual({ type: "directional", colorTemperatureK: 6500, shadow: true });
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.practicals).toBe(3);
    const specs = mechLighting() as unknown as readonly { kind: string; light?: string; shadow?: boolean }[];
    const key = specs.find((l) => l.light === "directional");
    expect(key?.shadow).toBe(true);
    expect(specs.filter((l) => l.light === "point")).toHaveLength(3);
    expect(specs.some((l) => l.light === "hdri" || l.kind === "environment")).toBe(true);
    expect(specs.some((l) => l.light === "ambient")).toBe(false);
  });
});

describe("mech-hangar fighting pose", () => {
  it("frames the bout midpoint from the declared offset", () => {
    const pose = mechPoseFor({ anchor: [0.4, 1.02, ARENA_CENTER_Z], anchorYaw: 0, mode: "arena" });
    expect(pose.position[0]).toBeCloseTo(0.4);
    expect(pose.position[1]).toBeCloseTo(1.02 + 1.66);
    expect(pose.position[2]).toBeCloseTo(ARENA_CENTER_Z + 5.28);
    expect(pose.target).toEqual([0.4, 1.02, ARENA_CENTER_Z]);
    expect(pose.fov).toBe(MECH_CAMERA_FOV);
  });

  it("orbits the hangar anchor around the turntable yaw", () => {
    const front = mechPoseFor({ anchor: [0, 0.95, 0], anchorYaw: 0, mode: "hangar" });
    const side = mechPoseFor({ anchor: [0, 0.95, 0], anchorYaw: Math.PI / 2, mode: "hangar" });
    expect(front.position[2]).toBeGreaterThan(0);
    expect(side.position[0]).toBeGreaterThan(0);
    // Orbiting stays at the same radius — distance to anchor is preserved.
    const r1 = Math.hypot(front.position[0], front.position[2]);
    const r2 = Math.hypot(side.position[0], side.position[2]);
    expect(r2).toBeCloseTo(r1);
  });

  it("keeps a 1.7m fighter inside the subject-height band", () => {
    // True eye→anchor distance is the offset magnitude (sqrt(1.66² + 5.28²) ≈ 5.55).
    const offsetLen = Math.hypot(1.66, 5.28);
    const visibleHeight = 2 * offsetLen * Math.tan((MECH_CAMERA_FOV * Math.PI) / 360);
    const fraction = 1.7 / visibleHeight;
    expect(fraction).toBeGreaterThanOrEqual(direction.framing.subjectHeightFraction[0]);
    expect(fraction).toBeLessThanOrEqual(direction.framing.subjectHeightFraction[1]);
    expect(offsetLen).toBeCloseTo(MECH_CAMERA_DISTANCE, 0);
  });
});

describe("mech-hangar union scene", () => {
  it("mounts both rooms and the full part catalog", () => {
    const world = mechWorldNodes();
    expect(world.hangarNodeIds.length).toBeGreaterThan(15);
    expect(world.pitNodeIds.length).toBeGreaterThan(25);
    expect(world.partNodeIds.player).toHaveLength(16);
    expect(world.partNodeIds.rival).toHaveLength(16);
    expect(world.partNodeIds.player.every((id) => id.startsWith("mech-player-mech"))).toBe(true);
    expect(world.heroNodeIds).toEqual(["mech-hero-player", "mech-hero-rival"]);
    expect(world.nodes.length).toBeGreaterThan(90);
  });
});

describe("mech-hangar scenarios", () => {
  it("parses arena/autorun/rematch aliases", () => {
    expect(parseMechScenario("pit")).toBe("arena");
    expect(parseMechScenario("autorun")).toBe("autorun");
    expect(parseMechScenario("rematch")).toBe("rematch");
    expect(parseMechScenario("nope")).toBeNull();
  });

  it("locks in through the real hangar path", () => {
    const calls: string[] = [];
    applyMechScenario("arena", {
      lockIn: () => calls.push("lock"),
      startAutorun: () => calls.push("autorun"),
      rematch: () => calls.push("rematch")
    });
    expect(calls).toEqual(["lock"]);
    calls.length = 0;
    applyMechScenario("rematch", {
      lockIn: () => calls.push("lock"),
      startAutorun: () => calls.push("autorun"),
      rematch: () => calls.push("rematch")
    });
    expect(calls).toEqual(["lock", "rematch"]);
  });
});

// tests/qr/prd14/gallery-shift/v2-shell.test.ts — v2 shell contract checks for
// Gallery Shift (wave-4, chase rig).
import { describe, expect, it } from "vitest";
import direction from "../../../../apps/showcase-gallery-shift/art/direction";
import {
  GALLERY_CAMERA_DISTANCE,
  GALLERY_CAMERA_FOV,
  galleryPoseFor
} from "../../../../apps/showcase-gallery-shift/src/v2/scene/camera";
import { galleryLighting } from "../../../../apps/showcase-gallery-shift/src/v2/scene/lighting";
import { galleryWorldNodes } from "../../../../apps/showcase-gallery-shift/src/v2/scene/world";
import { applyGalleryScenario, parseGalleryScenario } from "../../../../apps/showcase-gallery-shift/src/v2/scenarios";

describe("gallery-shift art direction contract", () => {
  it("declares the chase rig with a 50-62° fov band", () => {
    expect(direction.framing.rig).toBe("chase");
    expect(direction.framing.fovDeg[0]).toBeLessThanOrEqual(GALLERY_CAMERA_FOV);
    expect(direction.framing.fovDeg[1]).toBeGreaterThanOrEqual(GALLERY_CAMERA_FOV);
  });

  it("keeps a shadowed 3200K spot key, ibl fill and 6 practicals — no ambient", () => {
    expect(direction.lighting.key).toEqual({ type: "spot", colorTemperatureK: 3200, shadow: true });
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.practicals).toBe(6);
    const specs = galleryLighting() as unknown as readonly { kind: string; light?: string; shadow?: boolean }[];
    const key = specs.find((l) => l.light === "spot");
    expect(key?.shadow).toBe(true);
    expect(specs.filter((l) => l.light === "point")).toHaveLength(6);
    expect(specs.some((l) => l.light === "hdri" || l.kind === "environment")).toBe(true);
    expect(specs.some((l) => l.light === "ambient")).toBe(false);
  });
});

describe("gallery-shift chase pose", () => {
  it("trails the thief at the declared chase offset", () => {
    const pose = galleryPoseFor({ thiefX: 2, thiefZ: 3, facingYaw: 0, moving: true }, 0);
    expect(pose.position[0]).toBeCloseTo(2);
    expect(pose.position[1]).toBeCloseTo(9.5);
    expect(pose.position[2]).toBeCloseTo(3 + 6.8);
    expect(pose.fov).toBe(GALLERY_CAMERA_FOV);
    expect(pose.roll).toBe(0);
  });

  it("orbits the offset around the thief as the camera yaw eases", () => {
    const still = galleryPoseFor({ thiefX: 0, thiefZ: 4.55, facingYaw: 0, moving: true }, 0);
    const turned = galleryPoseFor({ thiefX: 0, thiefZ: 4.55, facingYaw: Math.PI / 2, moving: true }, Math.PI / 2);
    const distStill = Math.hypot(still.position[0], still.position[2] - 4.55);
    const distTurned = Math.hypot(turned.position[0], turned.position[2] - 4.55);
    expect(distStill).toBeCloseTo(distTurned, 5);
    expect(turned.position[0]).toBeGreaterThan(4);
  });

  it("keeps the 2.7m infiltrator inside the subject-height band", () => {
    const [bandLo, bandHi] = direction.framing.subjectHeightFraction;
    const fraction = 2.7 / (2 * GALLERY_CAMERA_DISTANCE * Math.tan((GALLERY_CAMERA_FOV / 2) * (Math.PI / 180)));
    expect(fraction).toBeGreaterThanOrEqual(bandLo);
    expect(fraction).toBeLessThanOrEqual(bandHi);
  });
});

describe("gallery-shift union scene", () => {
  const world = galleryWorldNodes();

  it("mounts floor 1 and floor 2 sets plus the shared mission slots once", () => {
    expect(world.floor1NodeIds.length).toBeGreaterThan(20);
    expect(world.floor2NodeIds.length).toBeGreaterThan(15);
    expect(world.floor1NodeIds).toContain("museum-interior");
    expect(world.nodes.length).toBeGreaterThan(80);
  });

  it("registers the renderer-owned vision cones", () => {
    expect(world.coneNodeIds.length).toBeGreaterThanOrEqual(4);
    expect(world.coneNodeIds).toContain("guard-1 sightline preview");
    expect(world.coneNodeIds).toContain("guard-2 sightline preview");
    expect(world.coneNodeIds).toContain("camera-1 sweep cone");
    expect(world.coneNodeIds).toContain("camera-2 sweep cone");
  });
});

describe("gallery-shift scenarios", () => {
  it("parses the real-path scenario aliases", () => {
    expect(parseGalleryScenario("floor-2")).toBe("floor-2");
    expect(parseGalleryScenario("skyline")).toBe("floor-2");
    expect(parseGalleryScenario("alert")).toBe("alert");
    expect(parseGalleryScenario("autorun")).toBe("autorun");
    expect(parseGalleryScenario("nope")).toBeNull();
  });

  it("calls the floor-2 hook through the real advance path", () => {
    const calls: string[] = [];
    applyGalleryScenario("floor-2", {
      advanceToFloor2: () => calls.push("floor-2"),
      stageAlert: () => calls.push("alert"),
      startAutorun: () => calls.push("autorun")
    });
    expect(calls).toEqual(["floor-2"]);
  });
});

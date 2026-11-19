/**
 * F3 real-GPU QA: at the default follow camera the keeper read as a small figure in the meadow. The drawn follow camera
 * now sits FOLLOW_ZOOM of the sim's offset from its look target (same direction: the sim's input axes are unchanged),
 * so the standing keeper (soles to crown, measured on the Idol rig) fills at least ~15% of a 16:9 frame's height.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOLLOW_ZOOM, followPoseAtStart } from "../../../examples/where-the-wind-wanders-port/camera-seq";
import { START } from "../../../examples/where-the-wind-wanders-port/sim";
import { terrainHeight } from "../../../examples/where-the-wind-wanders-port/terrain";
import { createIdolRigDriver } from "../../../examples/where-the-wind-wanders-port/art/idolRig";
import { IDOL_RIGS } from "../../../examples/where-the-wind-wanders-port/art/idolRigData";

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

/** Vertical screen fraction between two world points for a perspective camera (vertical fov in degrees). */
function screenSpan(pos: V, target: V, fovDeg: number, a: V, b: V): number {
  const f = norm(sub(target, pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const ndcY = (p: V): number => { const d = sub(p, pos); return dot(d, u) / dot(d, f) / Math.tan((fovDeg * Math.PI) / 360); };
  return Math.abs(ndcY(a) - ndcY(b)) / 2;
}

describe("Bellkeeper default framing", () => {
  it("the standing keeper fills >= 15% of the frame height at the default follow camera", () => {
    const rig = (IDOL_RIGS as Record<string, unknown>).bkHero as Parameters<typeof createIdolRigDriver>[0];
    const d = createIdolRigDriver(rig);
    const crown = d.jointPosition(rig.map.head)[1] + 0.15;
    const ground = terrainHeight(START.x, START.z);
    for (const fov of [43, 40]) {
      const cam = followPoseAtStart(fov);
      const span = screenSpan(cam.position as V, cam.target as V, fov, [START.x, ground, START.z], [START.x, ground + crown, START.z]);
      expect(span).toBeGreaterThanOrEqual(0.15);
      expect(span).toBeLessThanOrEqual(0.4); // still a meadow shot, not a close-up
    }
  });

  it("world.ts draws the follow camera at FOLLOW_ZOOM of the offset", () => {
    expect(FOLLOW_ZOOM).toBeLessThan(0.9);
    expect(readFileSync("examples/where-the-wind-wanders-port/world.ts", "utf8")).toContain("look.x + off.x * FOLLOW_ZOOM, look.y + off.y * FOLLOW_ZOOM_Y");
  });
});

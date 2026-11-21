import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton } from "@aura3d/engine/animation";
import { HERO_BIKES, RIVAL_BIKES, bikeRiderFrame, riderKeyFor, riderScale } from "../../../examples/strange-orbit-port/art/idolModels";
import { HIP_ABOVE_SADDLE, riderNodePosition } from "../../../examples/strange-orbit-port/art/idolRider";
import { applyMat3, axisRotation, basisMatrix, multiplyMat3, type Mat3 } from "../../../examples/strange-orbit-port/orient";
import { Vec3 } from "../../../examples/strange-orbit-port/vec3";
import { computeRiderPartWorldOffset, riderRig } from "../../../examples/strange-orbit-port/world";

const DIR = "apps/showcase-strange-orbit-port/assets/idol";
const dot = (a: readonly number[], b: Vec3) => a[0]! * b.x + a[1]! * b.y + a[2]! * b.z;

/**
 * The rigged racers are TOP-LEVEL runtime nodes (world.ts adds them with builder.add, never inside a moving group: a skinned
 * Idol node nested in a moving group renders in world space). Every frame world.ts sets each one's world transform =
 * bike root + bike basis (heading, lean, pitch) x seat offset x rig scale, scaled by the rig scale x rider scale. This
 * replays that math over a few frames of a leaning, pitching, turning ride and checks the hips land on the saddle.
 */
describe("Craterline GP riders are placed in world space on their bikes", () => {
  it("adds every rider and the ghost racer as top-level nodes", () => {
    const src = readFileSync("examples/strange-orbit-port/world.ts", "utf8");
    expect(src).toMatch(/else if \(sub\.kind === "rider"\) builder\.add\(createIdolRiderNode\(/);
    expect(src).toMatch(/builder\.add\(createIdolRiderNode\("ghost-rider-rider"/);
    expect(src).not.toMatch(/group\([^)]*createIdolRiderNode/);
  });

  for (const bike of new Set([...HERO_BIKES, ...RIVAL_BIKES])) {
    it(`${bike}: hips sit on the saddle inside the bike footprint over a leaning, turning ride`, () => {
      const key = riderKeyFor(bike);
      const driver = createHumanoidDriver(readIdolSkeleton(parseGlbJson(readFileSync(`${DIR}/${key}.glb`))));
      const frame = bikeRiderFrame(bike);
      const rs = riderScale(key);
      const rig = riderRig(0, "bike", "gouache");
      const riderPart = rig.parts.find((p) => p.kind === "rider")!;
      const node = riderNodePosition(driver.map.hipHeight, rs, frame);
      const scale = 1.1;
      for (let f = 0; f < 5; f++) {
        const heading = 0.4 * f, lean = 0.35 * Math.sin(f), pitch = 0.08 * f;
        const fwd = new Vec3(Math.cos(heading), 0, Math.sin(heading));
        const side0 = new Vec3().crossVectors(fwd, new Vec3(0, 1, 0)).normalize();
        const up0 = new Vec3().crossVectors(side0, fwd).normalize();
        let base: Mat3 = basisMatrix(fwd, up0, side0);
        base = multiplyMat3(base, axisRotation("z", pitch));
        base = multiplyMat3(base, axisRotation("x", lean));
        const root = new Vec3(10 * f, 2, -5 * f);
        // world.ts placeRider: node at root + base * offset * scale, rotation base * riderPart.local, scale = scale * rs
        const [ox, oy, oz] = computeRiderPartWorldOffset(base, node, scale);
        const nodeWorld = new Vec3(root.x + ox, root.y + oy, root.z + oz);
        const rot = multiplyMat3(base, riderPart.local);
        const hipLocal = applyMat3(rot, [0, driver.map.hipHeight * rs * scale, 0]);
        const hips = new Vec3(nodeWorld.x + hipLocal[0], nodeWorld.y + hipLocal[1], nodeWorld.z + hipLocal[2]);
        const rel = new Vec3(hips.x - root.x, hips.y - root.y, hips.z - root.z);
        const bx = applyMat3(base, [1, 0, 0]), by = applyMat3(base, [0, 1, 0]), bz = applyMat3(base, [0, 0, 1]);
        // inside the bike footprint (1.9 m long, rig units x scale), centred laterally, at saddle height
        expect(Math.abs(dot(bx, rel))).toBeLessThan(0.95 * scale);
        expect(dot(bx, rel)).toBeCloseTo(frame.saddle[0] * scale, 6);
        expect(Math.abs(dot(bz, rel))).toBeLessThan(0.05 * scale);
        expect(dot(by, rel)).toBeCloseTo((frame.saddle[1] + HIP_ABOVE_SADDLE) * scale, 6);
      }
    });
  }
});

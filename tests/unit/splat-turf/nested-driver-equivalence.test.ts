/**
 * Aura3D 5.7.0 made nested model handles parent-local (lessons-learned M18). Splat Turf keeps its hero driver as a
 * TOP-LEVEL rig and writes kart pose x HERO_BODY_LOCAL x T(seat - hs * hips) x S(hs) every frame (world.ts). This
 * proves the alternative, the driver nested in the `ink-rover-body` group with one constant parent-local transform,
 * draws at the same world transform within 1e-6 over a recorded drive. The workaround itself is left in place (a game
 * change needs a real-GPU check); this test is the evidence for dropping it.
 */
import { describe, expect, it } from "vitest";
import { group, model, scene } from "../../../packages/engine/src/public/index";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { flattenAuraSceneSnapshot } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { decompose, multiply, trs } from "../../../apps/showcase-splat-turf/src/art/kartRig";
import { DRIVER_RIG_SCALE, HERO_BODY_LOCAL, HERO_DRIVER_ID, HERO_SEAT, TURF_IDOL_ASSETS } from "../../../apps/showcase-splat-turf/src/art/idol";
import { BALL_RADIUS } from "../../../apps/showcase-splat-turf/src/meshes";

const flags = resolveQrFlags({ options: ["core"], env: {} });

describe("Splat Turf hero driver: top-level workaround vs nested rig (5.7.0)", () => {
  it("nested in ink-rover-body with a constant local transform, the driver's world transform equals the workaround's within 1e-6", () => {
    const hs = DRIVER_RIG_SCALE.turfHeroDriverRig;
    const heroHips: [number, number, number] = [0.004, 0.512, -0.021]; // measured once after load in world.ts; any value
    const seatLocal = multiply(HERO_BODY_LOCAL, trs([HERO_SEAT[0] - hs * heroHips[0], HERO_SEAT[1] - hs * heroHips[1], HERO_SEAT[2] - hs * heroHips[2]], [0, 0, 0], hs));
    const local = decompose(seatLocal);
    // the shipped workaround (a top-level rig, world.ts writes its world transform) next to the nested alternative
    const authored = scene()
      .add(model(TURF_IDOL_ASSETS.turfHeroDriverRig, { name: "workaround", scaleMode: "world", scale: hs }).position(0, -60, 0).runtime({ id: "workaround" }))
      .add(group("ink-rover-body", [
        model(TURF_IDOL_ASSETS.turfHeroDriverRig, { name: HERO_DRIVER_ID, scaleMode: "world" }).runtime({ id: HERO_DRIVER_ID })
      ]).runtime({ id: "ink-rover-body" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(flattenAuraSceneSnapshot(authored, flags), { flags }, authored);
    try {
      const kart = registry.require("ink-rover-body"), driver = registry.require(HERO_DRIVER_ID), workaround = registry.require("workaround");
      driver.setPosition(local.t[0], local.t[1], local.t[2]).setRotation(local.rot[0], local.rot[1], local.rot[2]).setScale(local.s);
      let worst = 0;
      for (let frame = 0; frame < 240; frame += 1) {
        const time = frame / 60;
        const laneOffset = 2.4 * Math.sin(time * 0.9), scale = 1 + 0.08 * Math.sin(time * 2.1);
        const roverPitch = 0.12 * Math.sin(time * 5), yokeBank = 0.3 * Math.sin(time * 1.7);
        // world.ts: the kart group's pose, then the workaround's world transform for the top-level driver
        kart.setPosition(laneOffset, BALL_RADIUS * scale, 0).setRotation(roverPitch, yokeBank * 0.42, yokeBank * 0.65).setScale(scale);
        const seat = decompose(multiply(
          multiply(trs([laneOffset, BALL_RADIUS * scale, 0], [roverPitch, yokeBank * 0.42, yokeBank * 0.65], scale), HERO_BODY_LOCAL),
          trs([HERO_SEAT[0] - hs * heroHips[0], HERO_SEAT[1] - hs * heroHips[1], HERO_SEAT[2] - hs * heroHips[2]], [0, 0, 0], hs)
        ));
        workaround.setPosition(seat.t[0], seat.t[1], seat.t[2]).setRotation(seat.rot[0], seat.rot[1], seat.rot[2]).setScale(seat.s);
        const expected = trsQ(workaround.getWorldPosition(), workaround.getWorldQuaternion(), workaround.getWorldScale());
        const actual = trsQ(driver.getWorldPosition(), driver.getWorldQuaternion(), driver.getWorldScale());
        for (let i = 0; i < 16; i += 1) worst = Math.max(worst, Math.abs(actual[i]! - expected[i]!));
      }
      expect(worst).toBeLessThanOrEqual(1e-6);
    } finally { registry.dispose(); }
  });
});

/** Column-major T · R(q) · S, independent of the engine. */
function trsQ(t: readonly number[], q: readonly number[], s: readonly number[]): number[] {
  const [x, y, z, w] = q as [number, number, number, number];
  const r = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)
  ];
  return [r[0]! * s[0]!, r[1]! * s[0]!, r[2]! * s[0]!, 0, r[3]! * s[1]!, r[4]! * s[1]!, r[5]! * s[1]!, 0, r[6]! * s[2]!, r[7]! * s[2]!, r[8]! * s[2]!, 0, t[0]!, t[1]!, t[2]!, 1];
}

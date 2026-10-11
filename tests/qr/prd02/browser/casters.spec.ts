/**
 * 02-S4 — shadow caster variants (PRD-02 §16.1 S4, item 1940) on
 * prd02-caster-fixtures and prd02-16b-instancing-shadowed, A3D_QR_LIGHTING on.
 *
 * Shadow masks are `shadowMask(on, no-shadows)` per engine; every criterion
 * is measured inside a ground region around that caster group's analytic
 * footprint (object base swept along the sun direction to the ground):
 *  (a) skinned Soldier (Walk, t = 1.25 s): shadow-mask IoU vs three ≥ 0.75;
 *  (b) 3×3 static batch: connected shadow components within ±1 of three's (9);
 *  (c) 16-instance row: connected shadow components within ±1 of three's (16);
 *  (d) alpha leaf card: shadow-filled ratio of its footprint within ±10 % of three's.
 * prd02-16b (10k instanced casters): shadow-mask IoU vs three ≥ 0.75.
 * Broken control: with the flag off the S4 verdict must fail.
 */
import { expect, test } from "@playwright/test";
import type { ImageSize, MaskBuffer, PixelBuffer } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import { getPrd02Spec } from "../../../../benchmarks/quality-rebuild/scenes/prd02/specs";
import type { SceneSpec, Vec3 } from "../../../../benchmarks/quality-rebuild/shared/types";
import { coverage, maskIoU, shadowMask } from "../metrics/regionMetrics";
import { captureLaneScene, startLaneServer, type LaneServer } from "./lane-page";
import { connectedComponents, worldQuadMask } from "./shadow-helpers";

const FIXTURES = "prd02-caster-fixtures";
const INSTANCED = "prd02-16b-instancing-shadowed";
const IOU_MIN = 0.75;

function sunDirection(spec: SceneSpec): Vec3 {
  const sun = spec.lights.find((light) => light.kind === "directional" && light.castShadow);
  if (!sun || sun.kind !== "directional") throw new Error(`${spec.id}: no shadow-casting sun`);
  const d: Vec3 = [sun.target[0] - sun.position[0], sun.target[1] - sun.position[1], sun.target[2] - sun.position[2]];
  const l = Math.hypot(...d);
  return [d[0] / l, d[1] / l, d[2] / l];
}

/** Ground hit (y = 0) of a world point swept along the sun direction. */
function groundHit(p: Vec3, dir: Vec3): Vec3 {
  const t = p[1] / -dir[1];
  return [p[0] + dir[0] * t, 0, p[2] + dir[2] * t];
}

/** Ground rectangle covering the footprint of an AABB caster, plus `margin` metres. */
function footprintRegion(spec: SceneSpec, size: ImageSize, min: Vec3, max: Vec3, margin: number): MaskBuffer {
  const dir = sunDirection(spec);
  const xs: number[] = [];
  const zs: number[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const hit = groundHit([x, y, z], dir);
        xs.push(hit[0], x);
        zs.push(hit[2], z);
      }
    }
  }
  const x0 = Math.min(...xs) - margin;
  const x1 = Math.max(...xs) + margin;
  const z0 = Math.min(...zs) - margin;
  const z1 = Math.max(...zs) + margin;
  return worldQuadMask(spec, size, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]]);
}

function and(a: MaskBuffer, b: MaskBuffer): MaskBuffer {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] && b[i] ? 255 : 0;
  return out;
}

interface FixtureVerdict {
  readonly soldierIoU: number;
  readonly batchComponents: number;
  readonly instanceComponents: number;
  readonly cardFilled: number;
}

function fixtureMeasures(spec: SceneSpec, on: PixelBuffer, off: PixelBuffer): FixtureVerdict {
  const shadow = shadowMask(on, off);
  const regions = fixtureRegions(spec, on);
  return {
    soldierIoU: Number.NaN,
    batchComponents: connectedComponents(shadow, on, regions.batch).length,
    instanceComponents: connectedComponents(shadow, on, regions.instances).length,
    cardFilled: coverage(shadow, regions.card)
  };
}

function fixtureRegions(spec: SceneSpec, size: ImageSize): { soldier: MaskBuffer; batch: MaskBuffer; instances: MaskBuffer; card: MaskBuffer } {
  const dir = sunDirection(spec);
  const card = spec.objects.find((object) => object.name === "alpha leaf card");
  if (!card || card.kind !== "primitive") throw new Error(`${spec.id}: missing alpha leaf card`);
  // The card is a plane on XZ (facing +Y) rotated about Y; its exact footprint
  // is its four corners swept to the ground.
  const half = card.size[0] / 2;
  const yaw = card.rotation?.[1] ?? 0;
  const corners = ([[-half, -half], [half, -half], [half, half], [-half, half]] as const).map(([dx, dz]) => {
    const x = card.position[0] + dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const z = card.position[2] - dx * Math.sin(yaw) + dz * Math.cos(yaw);
    return groundHit([x, card.position[1], z], dir);
  });
  return {
    soldier: footprintRegion(spec, size, [-4.0, 0, 0.6], [-2.8, 1.85, 1.8], 0.35),
    batch: footprintRegion(spec, size, [-2.7, 0, -2.1], [-0.9, 0.4, -0.3], 0.15),
    instances: footprintRegion(spec, size, [0.4, 0, -2.2], [2.3, 0.6, -0.3], 0.15),
    card: worldQuadMask(spec, size, corners)
  };
}

test.describe("02-S4 shadow caster variants", () => {
  let server: LaneServer;
  test.beforeAll(async () => {
    server = await startLaneServer();
  });
  test.afterAll(async () => {
    await server.close();
  });
  test.beforeEach(() => {
    test.setTimeout(600_000);
  });

  test("prd02-caster-fixtures: skinned / batch / instance / alpha casters match three; flag off fails", async ({ page }, testInfo) => {
    const spec = getPrd02Spec(FIXTURES);
    const capture = async (engine: "aura3d" | "three", flags: string, control?: string) =>
      (await captureLaneScene(page, server, { scene: FIXTURES, engine, flags, ...(control ? { control } : {}) })).pixels;
    const three = await capture("three", "none");
    const threeOff = await capture("three", "none", "no-shadows");
    const aura = await capture("aura3d", "lighting");
    const auraOff = await capture("aura3d", "lighting", "no-shadows");
    const legacy = await capture("aura3d", "none");
    const legacyOff = await capture("aura3d", "none", "no-shadows");

    const regions = fixtureRegions(spec, three);
    const threeShadow = shadowMask(three, threeOff);
    const verdict = (on: PixelBuffer, off: PixelBuffer): FixtureVerdict => {
      const measures = fixtureMeasures(spec, on, off);
      return { ...measures, soldierIoU: maskIoU(and(shadowMask(on, off), regions.soldier), and(threeShadow, regions.soldier)) };
    };
    const ref = fixtureMeasures(spec, three, threeOff);
    const on = verdict(aura, auraOff);
    const flagOff = verdict(legacy, legacyOff);
    const passes = (v: FixtureVerdict) => ({
      soldier: v.soldierIoU >= IOU_MIN,
      batch: Math.abs(v.batchComponents - ref.batchComponents) <= 1,
      instances: Math.abs(v.instanceComponents - ref.instanceComponents) <= 1,
      card: Math.abs(v.cardFilled - ref.cardFilled) <= 0.1
    });
    const report = { three: ref, flagOn: on, flagOff, flagOnPass: passes(on), flagOffPass: passes(flagOff) };
    await testInfo.attach("02-S4-caster-fixtures.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });

    expect(ref.batchComponents, `three batch components ${JSON.stringify(report)}`).toBeGreaterThanOrEqual(8);
    expect(ref.instanceComponents, `three instance components ${JSON.stringify(report)}`).toBeGreaterThanOrEqual(15);
    expect(report.flagOnPass, JSON.stringify(report)).toEqual({ soldier: true, batch: true, instances: true, card: true });
    expect(Object.values(report.flagOffPass).every(Boolean), `flag-off control must fail S4: ${JSON.stringify(report)}`).toBe(false);
  });

  test("prd02-16b-instancing-shadowed: 10k instanced casters shadow like three", async ({ page }, testInfo) => {
    const capture = async (engine: "aura3d" | "three", control?: string) =>
      (await captureLaneScene(page, server, { scene: INSTANCED, engine, flags: engine === "three" ? "none" : "lighting", ...(control ? { control } : {}) })).pixels;
    const threeShadow = shadowMask(await capture("three"), await capture("three", "no-shadows"));
    const auraShadow = shadowMask(await capture("aura3d"), await capture("aura3d", "no-shadows"));
    const iou = maskIoU(auraShadow, threeShadow);
    await testInfo.attach("02-S4-16b.json", { body: JSON.stringify({ iou }), contentType: "application/json" });
    expect(iou).toBeGreaterThanOrEqual(IOU_MIN);
  });
});

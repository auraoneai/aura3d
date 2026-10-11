/**
 * Shadow pixels (G1 top priority; S2S3-15, S4, S5, T1923, S11 depend on it).
 * GPU run 38126910230 showed no Aura shadow under A3D_QR_LIGHTING: every
 * default capture was byte-identical to its no-shadows control. This spec
 * reports where the chain breaks and asserts the end result:
 *
 *  1. the bridged prd02 cascade depth maps contain caster depth
 *     (`prd02ShadowDepth`: covered share > 0, min < 1) — casters reached the
 *     depth surface;
 *  2. a shadowed texel is darker: inside three's shadow mask on 12-shadows the
 *     Aura default render is darker than Aura's own no-shadows control.
 *
 * Diagnostics are attached either way so a red run says which link failed.
 */
import { expect, test } from "@playwright/test";
import { shadowMask } from "../metrics/regionMetrics";
import { captureLaneScene, startLaneServer, type LaneServer } from "./lane-page";

const SCENE = "prd02-12-shadows";

interface DepthStat {
  readonly index: number;
  readonly width: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly covered: number;
}

/** `shadowMask` returns a bare Uint8Array (255 = differs between on/off). */
function meanLumaIn(pixels: { data: Uint8Array | Uint8ClampedArray }, mask: Uint8Array): { mean: number; count: number } {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const o = i * 4;
    sum += 0.2126 * pixels.data[o]! + 0.7152 * pixels.data[o + 1]! + 0.0722 * pixels.data[o + 2]!;
    count += 1;
  }
  return { mean: count ? sum / count : Number.NaN, count };
}

let server: LaneServer;
test.beforeAll(async () => {
  server = await startLaneServer();
});
test.afterAll(async () => {
  await server?.close();
});

test("prd02 shadow chain: cascade depth is written and shadowed texels are darker", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const auraOn = await captureLaneScene(page, server, { scene: SCENE, flags: "lighting" });
  const auraOff = await captureLaneScene(page, server, { scene: SCENE, flags: "lighting", control: "no-shadows" });
  const threeOn = await captureLaneScene(page, server, { scene: SCENE, engine: "three", flags: "lighting" });
  const threeOff = await captureLaneScene(page, server, { scene: SCENE, engine: "three", flags: "lighting", control: "no-shadows" });

  const depth = ((auraOn.payload as { prd02ShadowDepth?: DepthStat[] } | null)?.prd02ShadowDepth ?? []) as DepthStat[];
  const mask = shadowMask(threeOn.pixels, threeOff.pixels);
  const lit = meanLumaIn(auraOff.pixels, mask);
  const shadowed = meanLumaIn(auraOn.pixels, mask);
  const evidence = { depth, maskPixels: lit.count, auraNoShadowsLuma: lit.mean, auraDefaultLuma: shadowed.mean };
  await testInfo.attach("shadow-chain.json", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  console.log(`[prd02-shadow-chain] ${JSON.stringify(evidence)}`);

  expect(lit.count, "three shadow mask is non-empty").toBeGreaterThan(500);
  expect(depth.length, "bridge produced at least one cascade").toBeGreaterThan(0);
  expect(Math.max(...depth.map((d) => d.covered)), "casters reached the cascade depth surface").toBeGreaterThan(0);
  expect(Math.min(...depth.map((d) => d.min)), "cascade depth has caster texels < 1").toBeLessThan(1);
  expect(shadowed.mean, "shadowed texels are darker than the no-shadows control").toBeLessThan(lit.mean - 8);
});

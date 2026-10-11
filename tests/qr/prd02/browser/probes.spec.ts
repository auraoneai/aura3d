/**
 * 02-S12 — reflection probes and irradiance volume (PRD-02 §16.1 S12,
 * items 1951/1952), A3D_QR_LIGHTING on, `with-probes` control (the lane page
 * appends `probes.reflection()` / `probes.irradianceVolume()` nodes).
 *
 *  - prd02-probe-stripe-room: a box-projected probe (box = the room) on a
 *    mirror sphere puts the left-wall emissive stripe within 2 px (centroid)
 *    of where it should be. The reference is the exact ray-traced reflection
 *    against the room box — what three's CubeCamera + PMREM reference
 *    converges to with box projection (three r185 core has no box-projected
 *    env sampling, so a three render would need a shader patch).
 *  - prd02-red-wall-bounce: the bounce hue on the front face of "white cube a"
 *    is within 15° of three's CubeCamera → `LightProbeGenerator` reference
 *    (same sample point, lane fixtures.ts).
 */
import { expect, test } from "@playwright/test";
import { emptyMask, maskPixelCount, projectDisc, type MaskBuffer, type PixelBuffer } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import { getPrd02Spec, PROBE_STRIPE_ROOM } from "../../../../benchmarks/quality-rebuild/scenes/prd02/specs";
import type { SceneSpec, Vec3 } from "../../../../benchmarks/quality-rebuild/shared/types";
import { captureLaneScene, startLaneServer, type LaneServer } from "./lane-page";
import { worldQuadMask } from "./shadow-helpers";

const STRIPE_SCENE = "prd02-probe-stripe-room";
const BOUNCE_SCENE = "prd02-red-wall-bounce";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a));
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Analytic stripe-on-sphere mask: pixels whose mirror reflection hits the stripe on the room box. */
function predictedStripe(spec: SceneSpec, size: { width: number; height: number }): MaskBuffer {
  const sphere = spec.objects.find((object) => object.name === "mirror sphere");
  const stripe = spec.objects.find((object) => object.name === "wall stripe");
  if (sphere?.kind !== "primitive" || stripe?.kind !== "primitive") throw new Error(`${spec.id}: fixture objects missing`);
  const radius = sphere.size[0] / 2;
  const { camera } = spec;
  const forward = norm(sub(camera.target, camera.position));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const aspect = size.width / size.height;
  const zMin = stripe.position[2] - stripe.size[2] / 2;
  const zMax = stripe.position[2] + stripe.size[2] / 2;
  const mask = emptyMask(size);
  for (let py = 0; py < size.height; py += 1) {
    for (let px = 0; px < size.width; px += 1) {
      const u = (px + 0.5) / size.width;
      const v = (py + 0.5) / size.height;
      const dir = norm(add(forward, add(scale(right, (u - 0.5) * 2 * tanV * aspect), scale(up, (0.5 - v) * 2 * tanV))));
      const oc = sub(camera.position, sphere.position);
      const b = dot(oc, dir);
      const disc = b * b - (dot(oc, oc) - radius * radius);
      if (disc < 0) continue;
      const hit = add(camera.position, scale(dir, -b - Math.sqrt(disc)));
      const n = norm(sub(hit, sphere.position));
      const r = sub(dir, scale(n, 2 * dot(dir, n)));
      let t = Infinity;
      let axis = -1;
      for (let i = 0; i < 3; i += 1) {
        if (Math.abs(r[i]!) < 1e-9) continue;
        const bound = r[i]! > 0 ? PROBE_STRIPE_ROOM.max[i]! : PROBE_STRIPE_ROOM.min[i]!;
        const ti = (bound - hit[i]!) / r[i]!;
        if (ti > 0 && ti < t) { t = ti; axis = i; }
      }
      if (axis !== 0 || r[0] > 0) continue; // the stripe is on the left wall (x = min)
      const wall = add(hit, scale(r, t));
      if (wall[2] >= zMin && wall[2] <= zMax && wall[1] >= 0 && wall[1] <= 3) mask[py * size.width + px] = 255;
    }
  }
  return mask;
}

/** Green-dominant (stripe emissive #00ff40) pixels inside `within`. */
function detectedStripe(img: PixelBuffer, within: MaskBuffer): MaskBuffer {
  const mask = emptyMask(img);
  for (let i = 0; i < within.length; i += 1) {
    if (!within[i]) continue;
    const r = img.data[i * 4]!;
    const g = img.data[i * 4 + 1]!;
    const b = img.data[i * 4 + 2]!;
    if (g > 120 && g > r + 60 && g > b + 30) mask[i] = 255;
  }
  return mask;
}

function centroid(mask: MaskBuffer, width: number): [number, number] | null {
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    sx += i % width;
    sy += Math.floor(i / width);
    n += 1;
  }
  return n ? [sx / n, sy / n] : null;
}

function meanHue(img: PixelBuffer, mask: MaskBuffer): { hue: number; rgb: [number, number, number] } {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    r += img.data[i * 4]!; g += img.data[i * 4 + 1]!; b += img.data[i * 4 + 2]!; n += 1;
  }
  const rgb: [number, number, number] = n ? [r / n, g / n, b / n] : [0, 0, 0];
  const max = Math.max(...rgb), min = Math.min(...rgb), d = max - min;
  if (d < 1e-6) return { hue: 0, rgb };
  let hue = rgb[0] === max ? (rgb[1] - rgb[2]) / d : rgb[1] === max ? 2 + (rgb[2] - rgb[0]) / d : 4 + (rgb[0] - rgb[1]) / d;
  hue = (hue * 60 + 360) % 360;
  return { hue, rgb };
}

test.describe("02-S12 reflection probes and irradiance volume", () => {
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

  test("box-projected probe puts the wall stripe within 2 px of the ray-traced reflection", async ({ page }, testInfo) => {
    const spec = getPrd02Spec(STRIPE_SCENE);
    const aura = (await captureLaneScene(page, server, { scene: STRIPE_SCENE, flags: "lighting", control: "with-probes" })).pixels;
    const sphere = spec.objects.find((object) => object.name === "mirror sphere");
    if (sphere?.kind !== "primitive") throw new Error(`${STRIPE_SCENE}: missing mirror sphere`);
    const disc = projectDisc(spec.camera, aura, sphere.position, sphere.size[0] / 2);
    const sphereMask = emptyMask(aura);
    if (disc) {
      for (let y = 0; y < aura.height; y += 1) for (let x = 0; x < aura.width; x += 1) {
        if ((x - disc.x) ** 2 + (y - disc.y) ** 2 <= (disc.r * 0.97) ** 2) sphereMask[y * aura.width + x] = 255;
      }
    }
    const predicted = predictedStripe(spec, aura);
    const detected = detectedStripe(aura, sphereMask);
    const expectedAt = centroid(predicted, aura.width);
    const foundAt = centroid(detected, aura.width);
    const report = {
      predictedPixels: maskPixelCount(predicted),
      detectedPixels: maskPixelCount(detected),
      expectedAt,
      foundAt,
      offsetPx: expectedAt && foundAt ? Math.hypot(expectedAt[0] - foundAt[0], expectedAt[1] - foundAt[1]) : null
    };
    await testInfo.attach("02-S12-stripe.json", { body: JSON.stringify(report), contentType: "application/json" });
    expect(report.predictedPixels, "the stripe is visible in the ideal reflection").toBeGreaterThan(20);
    expect(foundAt, `stripe reflection on the mirror sphere: ${JSON.stringify(report)}`).not.toBeNull();
    expect(report.offsetPx!, JSON.stringify(report)).toBeLessThanOrEqual(2);
  });

  test("red-wall bounce hue within 15 degrees of three LightProbeGenerator", async ({ page }, testInfo) => {
    const spec = getPrd02Spec(BOUNCE_SCENE);
    const cube = spec.objects.find((object) => object.name === "white cube a");
    if (cube?.kind !== "primitive") throw new Error(`${BOUNCE_SCENE}: missing white cube a`);
    const h = cube.size[0] / 2;
    const [cx, cy, cz] = cube.position;
    const face = worldQuadMask(spec, spec.resolution, [
      [cx - h * 0.8, cy + h * 0.8, cz + h], [cx + h * 0.8, cy + h * 0.8, cz + h],
      [cx + h * 0.8, cy - h * 0.8, cz + h], [cx - h * 0.8, cy - h * 0.8, cz + h]
    ]);
    expect(maskPixelCount(face), "front face of white cube a").toBeGreaterThan(500);
    const three = (await captureLaneScene(page, server, { scene: BOUNCE_SCENE, engine: "three", flags: "none", control: "with-probes" })).pixels;
    const aura = (await captureLaneScene(page, server, { scene: BOUNCE_SCENE, flags: "lighting", control: "with-probes" })).pixels;
    const threeHue = meanHue(three, face);
    const auraHue = meanHue(aura, face);
    const delta = Math.min(Math.abs(threeHue.hue - auraHue.hue), 360 - Math.abs(threeHue.hue - auraHue.hue));
    const report = { three: threeHue, aura: auraHue, hueDelta: delta };
    await testInfo.attach("02-S12-bounce.json", { body: JSON.stringify(report), contentType: "application/json" });
    expect(delta, JSON.stringify(report)).toBeLessThanOrEqual(15);
  });
});

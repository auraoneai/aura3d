/**
 * Shared measurement helpers for the lane-02 shadow pixel specs (02-S2S3,
 * S4, S5, S6, S11, T1923). Scene rendering goes through `lane-page.ts`
 * (`startLaneServer` / `captureLaneScene`); this file only adds what those
 * specs need on top of it:
 *
 *  - `stagePixels`: re-read the live #stage after a spec has stepped the
 *    mounted app (`window.__qrPrd02App`, set by lane-main.ts).
 *  - mask helpers: per-object projected discs, boundary rings, connected
 *    components and pixel-space boxes.
 *  - `linearLuma` for the PRD's "mean linear luma" wording (S2).
 *
 * Page scripts are passed as self-invoking strings (`(() => ...)()`): a bare
 * `"() => ..."` string evaluates to the function object, which Playwright
 * 1.59 neither calls nor serializes (azure-gpu run 38117996666).
 */
import type { Page } from "@playwright/test";
import sharp from "sharp";
import {
  emptyMask,
  fillDisc,
  projectDisc,
  projectWorldToUv,
  type ImageSize,
  type MaskBuffer,
  type PixelBuffer
} from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import type { SceneSpec, Vec3 } from "../../../../benchmarks/quality-rebuild/shared/types";
import { lumaAt } from "../metrics/regionMetrics";

/** Decode the current #stage frame (no reload). */
export async function stagePixels(page: Page): Promise<PixelBuffer> {
  const png = await page.locator("#stage").screenshot({ animations: "disabled", timeout: 30_000 });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) };
}

/** Throws unless lane-main.ts published the mounted Aura app. */
export async function requireLaneApp(page: Page): Promise<void> {
  const ok = await page.evaluate("Boolean(window.__qrPrd02App)");
  if (!ok) throw new Error("lane page did not publish window.__qrPrd02App (lane-main.ts collectExtra hook)");
}

/** Read the C-38 `app.lighting.diagnostics()` counters from the mounted app. */
export async function lightingCounters(page: Page): Promise<{ readPixelsCalls: number | null; programCompileCount: number | null }> {
  return (await page.evaluate(`(() => {
    const app = window.__qrPrd02App;
    const d = app && app.lighting && typeof app.lighting.diagnostics === "function" ? app.lighting.diagnostics() : null;
    return { readPixelsCalls: d ? d.readPixelsCalls : null, programCompileCount: d ? d.programCompileCount : null };
  })()`)) as { readPixelsCalls: number | null; programCompileCount: number | null };
}

/** Step the mounted app `frames` times at 60 Hz, one rAF per step. */
export async function stepFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate(`(async () => {
    const app = window.__qrPrd02App;
    for (let i = 0; i < ${Math.max(0, Math.floor(frames))}; i += 1) {
      app.step(1 / 60);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
  })()`);
}

/**
 * Move the camera through the public surfaces the shared translator uses
 * (C-22 `app.camera.setPose`, else the runtime camera node), then present one
 * frame. Returns false when neither surface exists.
 */
export async function setCameraPose(page: Page, position: Vec3, target: Vec3): Promise<boolean> {
  return (await page.evaluate(`(async () => {
    const app = window.__qrPrd02App;
    const position = ${JSON.stringify(position)};
    const target = ${JSON.stringify(target)};
    let moved = false;
    if (app.camera && typeof app.camera.setPose === "function") {
      app.camera.setPose({ position, target });
      moved = true;
    } else if (app.nodes && typeof app.nodes.all === "function") {
      const cam = app.nodes.all().find((node) => node.kind === "camera");
      if (cam && typeof cam.setPosition === "function") {
        cam.setPosition(position[0], position[1], position[2]);
        moved = true;
      }
    }
    app.step(1 / 60);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    app.step(0);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    return moved;
  })()`)) as boolean;
}

const SRGB_TO_LINEAR = (() => {
  const table = new Float64Array(256);
  for (let v = 0; v < 256; v += 1) {
    const c = v / 255;
    table[v] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return table;
})();

/** Rec.709 luma of the linearized sRGB pixel (0..1). */
export function linearLumaAt(data: Uint8ClampedArray, index: number): number {
  const o = index * 4;
  return 0.2126 * SRGB_TO_LINEAR[data[o]!]! + 0.7152 * SRGB_TO_LINEAR[data[o + 1]!]! + 0.0722 * SRGB_TO_LINEAR[data[o + 2]!]!;
}

export function meanLinearLuma(img: PixelBuffer, mask: MaskBuffer): number {
  let sum = 0;
  let n = 0;
  for (let index = 0; index < img.width * img.height; index += 1) {
    if (!mask[index]) continue;
    sum += linearLumaAt(img.data, index);
    n += 1;
  }
  return n ? sum / n : 0;
}

export function maxLuma(img: PixelBuffer, mask: MaskBuffer): number {
  let max = 0;
  for (let index = 0; index < img.width * img.height; index += 1) {
    if (mask[index]) max = Math.max(max, lumaAt(img.data, index));
  }
  return max;
}

/** Split a mask at its mean row: [top half, bottom half]. */
export function splitTopBottom(mask: MaskBuffer, size: ImageSize): [MaskBuffer, MaskBuffer] {
  let rowSum = 0;
  let n = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    rowSum += Math.floor(index / size.width);
    n += 1;
  }
  const mid = n ? rowSum / n : size.height / 2;
  const top = emptyMask(size);
  const bottom = emptyMask(size);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    if (Math.floor(index / size.width) < mid) top[index] = 255;
    else bottom[index] = 255;
  }
  return [top, bottom];
}

/** Projected bounding disc of one named spec object (primitives only). */
export function objectDiscMask(spec: SceneSpec, size: ImageSize, name: string, radiusScale = 1): MaskBuffer {
  const object = spec.objects.find((entry) => entry.kind === "primitive" && entry.name === name);
  if (!object || object.kind !== "primitive") throw new Error(`${spec.id}: no primitive named "${name}"`);
  const s = object.scale === undefined ? 1 : typeof object.scale === "number" ? object.scale : Math.max(...object.scale);
  const radius = 0.5 * Math.min(object.size[0], object.size[1], object.size[2] || object.size[0]) * s * radiusScale;
  const disc = projectDisc(spec.camera, size, object.position, radius);
  const mask = emptyMask(size);
  if (disc) fillDisc(mask, size, disc.x, disc.y, disc.r);
  return mask;
}

/** World point → pixel coordinates, or null when behind the camera. */
export function projectToPixel(spec: SceneSpec, size: ImageSize, world: Vec3): readonly [number, number] | null {
  const uv = projectWorldToUv(spec.camera, size.width / size.height, world);
  return uv ? [uv[0] * size.width, uv[1] * size.height] : null;
}

/** Mask of the projected convex quad `corners` (world, in order). */
export function worldQuadMask(spec: SceneSpec, size: ImageSize, corners: readonly Vec3[]): MaskBuffer {
  const pts = corners.map((corner) => projectToPixel(spec, size, corner));
  const mask = emptyMask(size);
  if (pts.some((p) => p === null)) return mask;
  const poly = pts as (readonly [number, number])[];
  const minY = Math.max(0, Math.floor(Math.min(...poly.map((p) => p[1]))));
  const maxY = Math.min(size.height - 1, Math.ceil(Math.max(...poly.map((p) => p[1]))));
  const minX = Math.max(0, Math.floor(Math.min(...poly.map((p) => p[0]))));
  const maxX = Math.min(size.width - 1, Math.ceil(Math.max(...poly.map((p) => p[0]))));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
        const [xi, yi] = poly[i]!;
        const [xj, yj] = poly[j]!;
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) mask[y * size.width + x] = 255;
    }
  }
  return mask;
}

/** Pixels inside `mask` that touch a pixel outside it, dilated by `radius`. */
export function boundaryRing(mask: MaskBuffer, size: ImageSize, radius = 1): MaskBuffer {
  const { width, height } = size;
  const edge = emptyMask(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      const outside =
        (x > 0 && !mask[index - 1]) || (x < width - 1 && !mask[index + 1]) ||
        (y > 0 && !mask[index - width]) || (y < height - 1 && !mask[index + width]);
      if (outside) edge[index] = 255;
    }
  }
  if (radius <= 0) return edge;
  const out = emptyMask(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!edge[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px >= 0 && py >= 0 && px < width && py < height) out[py * width + px] = 255;
        }
      }
    }
  }
  return out;
}

/** 4-connected components of `mask ∩ within` with at least `minArea` pixels. */
export function connectedComponents(mask: MaskBuffer, size: ImageSize, within?: MaskBuffer, minArea = 12): number[] {
  const { width, height } = size;
  const seen = new Uint8Array(mask.length);
  const areas: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (seen[start] || !mask[start] || (within && !within[start])) continue;
    let area = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      area += 1;
      const x = index % width;
      const y = (index - x) / width;
      const next = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
      for (const n of next) {
        if (n < 0 || seen[n] || !mask[n] || (within && !within[n])) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (area >= minArea) areas.push(area);
  }
  return areas;
}

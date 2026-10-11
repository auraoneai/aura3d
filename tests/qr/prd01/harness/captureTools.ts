/**
 * Lane-01 row 01-S11 (?tools=capture-pdb|dpr).
 *
 *  - capture-pdb: the same scene mounted twice through `createAuraApp`, once
 *    with `renderer.debug.preserveDrawingBuffer: true` (reference =
 *    `canvas.toDataURL()` right after a step) and once with the §6.9 default
 *    `preserveDrawingBuffer: false`. C-05 `app.capture()` from both must equal
 *    the reference (MAD ≤ 1/255, PRD-01 §15 Phase 2). The real context
 *    attributes are reported so the spec can prove which mode each run used.
 *  - dpr: a lane scene with no explicit `pixelRatio`, CSS 320×180, at the
 *    page's deviceScaleFactor; reports `diagnostics().resolution` and the
 *    canvas backing size.
 */

import { camera, group, lights, material, primitives, scene } from "@aura3d/engine";
import type { AuraApp, AuraSceneSnapshot } from "@aura3d/engine";
import { errorText, mountAura, nextFrame, placeCanvas, settleAura } from "./specKit";

export interface CaptureRun {
  readonly preserveDrawingBuffer: boolean | null;
  readonly width: number;
  readonly height: number;
  readonly madVsReference: number | null;
  readonly maxDiffVsReference: number | null;
  readonly nonBlankFraction: number;
}

export interface CapturePdbReport {
  readonly referenceWidth: number;
  readonly referenceHeight: number;
  readonly runs: readonly CaptureRun[];
  readonly errors: readonly string[];
}

export interface DprReport {
  readonly devicePixelRatio: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly resolution: unknown;
  readonly errors: readonly string[];
}

interface Pixels { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number }

async function bitmapPixels(source: Blob | ImageBitmap): Promise<Pixels> {
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : source;
  const probe = document.createElement("canvas");
  probe.width = bitmap.width;
  probe.height = bitmap.height;
  const ctx = probe.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, probe.width, probe.height);
  return { data: image.data, width: image.width, height: image.height };
}

/** A small scene-graph-hierarchy look-alike: nested groups, lit boxes and a sphere. */
function hierarchySnapshot(): AuraSceneSnapshot {
  return scene()
    .background("#1d2633")
    .camera(camera.perspective({ fov: 45, position: [0, 1.6, 4], target: [0, 0.4, 0] }))
    .add(lights.directional({ position: [3, 5, 2], intensity: 2.5 }))
    .add(lights.ambient({ intensity: 0.4 }))
    .add(
      group("parent", [
        primitives.box({ name: "torso", material: material.pbr({ color: "#c0563a", roughness: 0.5 }), size: [0.8, 1, 0.4] }).toJSON(),
        group("arm", [primitives.box({ name: "arm-box", material: material.pbr({ color: "#3a8fc0" }), size: [0.2, 0.7, 0.2] }).position(0.7, 0.2, 0).toJSON()], {
          rotation: [0, 0, 0.4]
        }).toJSON(),
        primitives.sphere({ name: "head", material: material.pbr({ color: "#e0c090" }), size: 0.45 }).position(0, 0.8, 0).toJSON()
      ], { position: [0, 0.2, 0], rotation: [0, 0.5, 0] })
    )
    .toJSON();
}

function compare(a: Pixels, b: Pixels): { mad: number; max: number } {
  let total = 0;
  let max = 0;
  for (let i = 0; i < a.data.length; i += 1) {
    const d = Math.abs(a.data[i]! - b.data[i]!);
    total += d;
    if (d > max) max = d;
  }
  return { mad: total / a.data.length, max };
}

async function captureRun(stage: HTMLElement, preserve: boolean, x: number): Promise<{ app: AuraApp; canvas: HTMLCanvasElement }> {
  const canvas = placeCanvas(stage, x, 0, 320, 240, `qr-capture-${preserve ? "pdb" : "nopdb"}`);
  const app = await mountAura(canvas, hierarchySnapshot(), preserve ? { renderer: { debug: { preserveDrawingBuffer: true } } } : {});
  await settleAura(app, 4);
  return { app, canvas };
}

function contextPreserve(canvas: HTMLCanvasElement): boolean | null {
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
  return gl?.getContextAttributes()?.preserveDrawingBuffer ?? null;
}

export async function runCapturePdbTool(stage: HTMLElement): Promise<CapturePdbReport> {
  const errors: string[] = [];
  const runs: CaptureRun[] = [];
  let reference: Pixels | null = null;
  try {
    const withPdb = await captureRun(stage, true, 0);
    withPdb.app.step(1 / 60);
    reference = await bitmapPixels(await fetch(withPdb.canvas.toDataURL("image/png")).then((r) => r.blob()));
    const live: { app: AuraApp; canvas: HTMLCanvasElement }[] = [withPdb, await captureRun(stage, false, 330)];
    for (const { app, canvas } of live) {
      const capture = app.capture;
      if (typeof capture !== "function") {
        errors.push("app.capture is not mounted (C-05 extension did not resolve)");
        continue;
      }
      const shot = await bitmapPixels(await capture.call(app, { type: "png-blob" }));
      let nonBlank = 0;
      for (let i = 0; i < shot.data.length; i += 4) if (shot.data[i]! + shot.data[i + 1]! + shot.data[i + 2]! > 0) nonBlank += 1;
      const sameSize = shot.width === reference.width && shot.height === reference.height;
      const diff = sameSize ? compare(shot, reference) : null;
      if (!sameSize) errors.push(`size mismatch: capture ${shot.width}x${shot.height} vs toDataURL ${reference.width}x${reference.height}`);
      runs.push({
        preserveDrawingBuffer: contextPreserve(canvas),
        width: shot.width,
        height: shot.height,
        madVsReference: diff?.mad ?? null,
        maxDiffVsReference: diff?.max ?? null,
        nonBlankFraction: nonBlank / (shot.data.length / 4)
      });
    }
    for (const { app } of live) app.dispose();
  } catch (error) {
    errors.push(errorText(error));
  }
  const report: CapturePdbReport = { referenceWidth: reference?.width ?? 0, referenceHeight: reference?.height ?? 0, runs, errors };
  window.__QR_SPEC__ = report;
  return report;
}

export async function runDprTool(stage: HTMLElement): Promise<DprReport> {
  const errors: string[] = [];
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.left = "0px";
  host.style.top = "0px";
  host.style.width = "320px";
  host.style.height = "180px";
  stage.appendChild(host);
  let backingWidth = 0;
  let backingHeight = 0;
  let resolution: unknown = null;
  try {
    const canvas = document.createElement("canvas");
    canvas.style.width = "320px";
    canvas.style.height = "180px";
    host.appendChild(canvas);
    const app = await mountAura(canvas, hierarchySnapshot(), { pixelRatio: "auto", resize: true });
    await nextFrame();
    await settleAura(app, 4);
    backingWidth = canvas.width;
    backingHeight = canvas.height;
    resolution = (app.diagnostics() as unknown as { resolution?: unknown }).resolution ?? null;
    errors.push(...app.diagnostics().errors);
  } catch (error) {
    errors.push(errorText(error));
  }
  const report: DprReport = {
    devicePixelRatio: globalThis.devicePixelRatio ?? 1,
    cssWidth: 320,
    cssHeight: 180,
    backingWidth,
    backingHeight,
    resolution,
    errors
  };
  window.__QR_SPEC__ = report;
  return report;
}

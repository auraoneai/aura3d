/**
 * Lane-01 row 01-S9 (?tools=temporal-dolly&a3d-qr=<list>): specular-AA
 * temporal stability. The `prd01-specular-aa` content (five chrome spheres,
 * metalness 1, roughness 0.05, floor, ambient + directional key) is rendered
 * in Aura (at 0,0) and three r185 (at HALF_W,0) under the same deterministic
 * 60-frame cosine-eased camera dolly. Aura evaluates `camera.dolly` at the
 * simulated clock (`app.step`); three places its camera with the identical
 * formula (compiler/camera.ts) at the same `app.runtime.time`, so both engines
 * see the same eye per frame. The key light is static (no orbit) so the only
 * motion is the camera: per-pixel luma sigma in the spheres mask is then the
 * geometric motion (identical in both engines) plus specular shimmer.
 *
 * Frames are read back synchronously after each draw (drawImage of the WebGL
 * canvas in the same task), cropped to the spheres mask, and reduced in-page
 * with `metrics.temporalSigma`. Published on `window.__QR_SPEC__`.
 */

import * as THREE from "three";
import { camera, lights, material, primitives, scene } from "@aura3d/engine";
import type { AuraApp } from "@aura3d/engine";
import { temporalSigma, type TemporalSigmaResult } from "../metrics/temporalSigma";
import type { ImageLike } from "../metrics/maskIoU";
import { errorText, HALF_H, HALF_W, mountAura, mountThree, placeCanvas, qrFlagsParam, settleThree } from "./specKit";

export interface TemporalDollyEngineResult {
  readonly sigma: TemporalSigmaResult;
  /** Mean mask luma over all frames (sanity: a black frame has sigma 0). */
  readonly meanLuma: number;
  /** Frames whose mask crop differs from the previous frame (sanity: the dolly moved). */
  readonly changedFrames: number;
}

export interface TemporalDollyReport {
  readonly flags: string;
  readonly frames: number;
  readonly mask: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly aura: TemporalDollyEngineResult | null;
  readonly three: TemporalDollyEngineResult | null;
  readonly errors: readonly string[];
}

export const DOLLY_FRAMES = 60;
const BACKGROUND = "#0d1015";
const TARGET: [number, number, number] = [0, 0.5, 0];
const FROM: [number, number, number] = [0, 1.25, 5.6];
const TO: [number, number, number] = [0, 1.25, 4.8];
const SECONDS = 4; // 60 frames @ 1/60 s = a quarter of the cosine cycle
const FOV = 38;
/** `prd01-specular-aa` mask "spheres" (scenes/prd01/scenes.ts). */
const MASK = { x: 0.1, y: 0.3, w: 0.8, h: 0.42 } as const;
const SPHERES = 5;
const SPACING = 1.05;
const KEY_POSITION: [number, number, number] = [4.2, 2.2, 0]; // orbit start of the scene's key

/** compiler/camera.ts `dolly` eye at simulated time `seconds`. */
function dollyEye(seconds: number): [number, number, number] {
  const phase = (seconds % SECONDS) / SECONDS;
  const eased = 0.5 - Math.cos(phase * Math.PI * 2) * 0.5;
  return [0, 1, 2].map((i) => FROM[i]! + (TO[i]! - FROM[i]!) * eased) as [number, number, number];
}

function buildAuraSnapshot() {
  const builder = scene()
    .background(BACKGROUND)
    .camera(camera.dolly({ from: FROM, to: TO, target: TARGET, seconds: SECONDS, fov: FOV }));
  builder.add(lights.ambient({ intensity: 0.22, color: "#96a4bd" }).toJSON());
  builder.add(lights.directional({ position: KEY_POSITION, intensity: 2.6, color: "#ffffff" }).toJSON());
  const x0 = (-(SPHERES - 1) * SPACING) / 2;
  for (let i = 0; i < SPHERES; i += 1) {
    builder.add(
      primitives
        .sphere({ name: `chrome-${i}`, material: material.pbr({ color: "#d7dce4", metalness: 1, roughness: 0.05 }) })
        .position(x0 + i * SPACING, 0.55, 0)
        .scale(0.48)
        .toJSON()
    );
  }
  builder.add(
    primitives
      .plane({ name: "floor", material: material.pbr({ color: "#1a2029", roughness: 0.9, metalness: 0 }) })
      .position(0, 0, 0)
      .scale([14, 1, 14])
      .toJSON()
  );
  return builder.toJSON();
}

function populateThree(target: THREE.Scene): void {
  target.add(new THREE.AmbientLight(new THREE.Color("#96a4bd"), 0.22));
  const key = new THREE.DirectionalLight(new THREE.Color("#ffffff"), 2.6);
  key.position.set(...KEY_POSITION);
  target.add(key);
  const x0 = (-(SPHERES - 1) * SPACING) / 2;
  for (let i = 0; i < SPHERES; i += 1) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 96, 48),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#d7dce4"), metalness: 1, roughness: 0.05 })
    );
    sphere.position.set(x0 + i * SPACING, 0.55, 0);
    target.add(sphere);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: new THREE.Color("#1a2029"), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  target.add(floor);
}

/** Synchronous mask crop of a WebGL canvas right after its draw (no preserveDrawingBuffer needed). */
function makeCropper(source: HTMLCanvasElement): () => ImageLike {
  const x = Math.floor(MASK.x * source.width);
  const y = Math.floor(MASK.y * source.height);
  const w = Math.ceil(MASK.w * source.width);
  const h = Math.ceil(MASK.h * source.height);
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
  return () => {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    return { data: data.data, width: w, height: h };
  };
}

function summarize(frames: readonly ImageLike[]): TemporalDollyEngineResult {
  let lumaSum = 0;
  let lumaCount = 0;
  let changedFrames = 0;
  frames.forEach((frame, index) => {
    for (let o = 0; o < frame.data.length; o += 4) {
      lumaSum += 0.2126 * frame.data[o]! + 0.7152 * frame.data[o + 1]! + 0.0722 * frame.data[o + 2]!;
      lumaCount += 1;
    }
    const previous = frames[index - 1];
    if (previous && previous.data.some((v, i) => v !== frame.data[i])) changedFrames += 1;
  });
  return { sigma: temporalSigma(frames), meanLuma: lumaCount ? lumaSum / lumaCount : 0, changedFrames };
}

export async function runTemporalDollyTool(stage: HTMLElement): Promise<TemporalDollyReport> {
  const errors: string[] = [];
  const flags = qrFlagsParam();
  let aura: TemporalDollyEngineResult | null = null;
  let three: TemporalDollyEngineResult | null = null;
  let app: AuraApp | null = null;
  const times: number[] = [];

  try {
    const auraCanvas = placeCanvas(stage, 0, 0, HALF_W, HALF_H, "qr-dolly-aura");
    app = await mountAura(auraCanvas, buildAuraSnapshot());
    const crop = makeCropper(auraCanvas);
    const frames: ImageLike[] = [];
    for (let i = 0; i < DOLLY_FRAMES; i += 1) {
      app.step(1 / 60);
      times.push(app.runtime.time);
      frames.push(crop());
    }
    aura = summarize(frames);
    errors.push(...app.diagnostics().errors);
  } catch (error) {
    errors.push(`aura: ${errorText(error)}`);
  }

  try {
    const threeCanvas = placeCanvas(stage, HALF_W, 0, HALF_W, HALF_H, "qr-dolly-three");
    const mount = await mountThree(threeCanvas, { toneMapping: "aces", fov: FOV, position: dollyEye(times[0] ?? 0), target: TARGET, background: BACKGROUND });
    populateThree(mount.scene);
    await settleThree(mount);
    const crop = makeCropper(threeCanvas);
    const frames: ImageLike[] = [];
    const lookAt = new THREE.Vector3(...TARGET);
    // Same simulated times as the Aura frames (fallback: the nominal 1/60 cadence).
    const schedule = times.length === DOLLY_FRAMES ? times : Array.from({ length: DOLLY_FRAMES }, (_, i) => (i + 1) / 60);
    for (const seconds of schedule) {
      mount.camera.position.set(...dollyEye(seconds));
      mount.camera.lookAt(lookAt);
      mount.render();
      frames.push(crop());
    }
    three = summarize(frames);
  } catch (error) {
    errors.push(`three: ${errorText(error)}`);
  }

  const report: TemporalDollyReport = { flags, frames: DOLLY_FRAMES, mask: MASK, aura, three, errors };
  window.__QR_SPEC__ = report;
  return report;
}

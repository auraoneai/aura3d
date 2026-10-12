/**
 * Lane-01 row 01-S9 (?tools=temporal-dolly&a3d-qr=<list>): specular-AA
 * temporal stability, PRD-01 §15 `prd01-specular-aa` — "40 thin glossy tori
 * (roughness 0.05) and wires at 20-60 m, camera dolly over 60 frames;
 * temporal luminance variance in highlight regions (frame-to-frame σ)
 * relative to three with MeshStandardMaterial".
 *
 * Aura (at 0,0) and three r185 (at HALF_W,0) render identical geometry —
 * Aura's unit torus/cylinder (torus r 0.43 tube 0.045 64x16; cylinder r 0.5
 * h 1 48 seg) mirrored by the same three geometries — lit by one static key
 * light, no IBL on either side (three has no environment; Aura sets
 * envMapIntensity 0), so highlights are key-light glints whose sparkle under
 * the dolly is the specular aliasing being measured. Aura evaluates
 * `camera.dolly` at the simulated clock (`app.step`); three places its camera
 * with the identical formula (compiler/camera.ts) at the same runtime time.
 * Frames are read back after each draw (both engines preserveDrawingBuffer)
 * and reduced with `metrics.highlightFrameSigma`. Published on __QR_SPEC__.
 */

import * as THREE from "three";
import { camera, lights, material, primitives, scene } from "@aura3d/engine";
import type { AuraApp, AuraSceneNode } from "@aura3d/engine";
import { highlightFrameSigma, type HighlightFrameSigmaResult } from "../metrics/temporalSigma";
import type { ImageLike } from "../metrics/maskIoU";
import { errorText, HALF_H, HALF_W, mountAura, mountThree, placeCanvas, qrFlagsParam, settleThree } from "./specKit";

export interface TemporalDollyEngineResult {
  readonly highlight: HighlightFrameSigmaResult;
  /** Fraction of pixels with alpha > 0 (sanity: an unreadable / cleared drawing buffer reads back 0). */
  readonly opaqueFraction: number;
  /** Frames that differ from the previous frame (sanity: the dolly moved). */
  readonly changedFrames: number;
}

export interface TemporalDollyReport {
  readonly flags: string;
  readonly frames: number;
  readonly aura: TemporalDollyEngineResult | null;
  readonly three: TemporalDollyEngineResult | null;
  readonly errors: readonly string[];
}

export const DOLLY_FRAMES = 60;
const BACKGROUND = "#0d1015";
const TARGET: [number, number, number] = [0, 1.5, -40];
const FROM: [number, number, number] = [0, 1.5, 4];
const TO: [number, number, number] = [0, 1.5, 0];
const SECONDS = 4; // 60 frames @ 1/60 s = a quarter of the cosine cycle
const FOV = 38;
const KEY_POSITION: [number, number, number] = [4.2, 6, 8];
const CHROME = "#d7dce4";

interface Placement { readonly kind: "torus" | "cylinder"; readonly position: [number, number, number]; readonly rotation: [number, number, number]; readonly scale: [number, number, number] }

/** Deterministic layout: 40 tori and 12 wires spread over 20-60 m. */
export function specularAaLayout(): readonly Placement[] {
  const out: Placement[] = [];
  for (let i = 0; i < 40; i += 1) {
    const z = -(20 + (40 * i) / 39);
    out.push({
      kind: "torus",
      position: [(((i * 7) % 9) - 4) * 2.2, 0.6 + ((i * 5) % 7) * 0.7, z],
      rotation: [i * 0.41, i * 0.67, i * 0.23],
      scale: [1.2, 1.2, 1.2]
    });
  }
  for (let i = 0; i < 12; i += 1) {
    out.push({
      kind: "cylinder",
      position: [(((i * 5) % 11) - 5) * 1.9, 2.5, -(24 + i * 3)],
      rotation: [0, 0, (((i * 3) % 5) - 2) * 0.35],
      scale: [0.02, 7, 0.02]
    });
  }
  return out;
}

/** compiler/camera.ts `dolly` eye at simulated time `seconds`. */
function dollyEye(seconds: number): [number, number, number] {
  const phase = (seconds % SECONDS) / SECONDS;
  const eased = 0.5 - Math.cos(phase * Math.PI * 2) * 0.5;
  return [0, 1, 2].map((i) => FROM[i]! + (TO[i]! - FROM[i]!) * eased) as [number, number, number];
}

function buildAuraSnapshot() {
  const builder = scene()
    .background(BACKGROUND, { toneMapped: false })
    .camera(camera.dolly({ from: FROM, to: TO, target: TARGET, seconds: SECONDS, fov: FOV }));
  builder.add(lights.ambient({ intensity: 0.22, color: "#96a4bd" }).toJSON());
  builder.add(lights.directional({ position: KEY_POSITION, intensity: 2.6, color: "#ffffff" }).toJSON());
  const glossy = material.pbr({ color: CHROME, metalness: 1, roughness: 0.05, envMapIntensity: 0 });
  specularAaLayout().forEach((p, index) => {
    const node: AuraSceneNode = primitives[p.kind]({ name: `aa-${p.kind}-${index}`, material: glossy })
      .position(...p.position)
      .rotate(...p.rotation)
      .scale(p.scale)
      .toJSON();
    builder.add(node);
  });
  return builder.toJSON();
}

function populateThree(target: THREE.Scene): void {
  target.add(new THREE.AmbientLight(new THREE.Color("#96a4bd"), 0.22));
  const key = new THREE.DirectionalLight(new THREE.Color("#ffffff"), 2.6);
  key.position.set(...KEY_POSITION);
  target.add(key);
  const glossy = new THREE.MeshStandardMaterial({ color: new THREE.Color(CHROME), metalness: 1, roughness: 0.05 });
  const torus = new THREE.TorusGeometry(0.43, 0.045, 16, 64);
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 1);
  for (const p of specularAaLayout()) {
    const mesh = new THREE.Mesh(p.kind === "torus" ? torus : cylinder, glossy);
    mesh.position.set(...p.position);
    mesh.rotation.set(...p.rotation);
    mesh.scale.set(...p.scale);
    target.add(mesh);
  }
}

function makeReader(source: HTMLCanvasElement): () => ImageLike {
  const scratch = document.createElement("canvas");
  scratch.width = source.width;
  scratch.height = source.height;
  const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
  return () => {
    ctx.clearRect(0, 0, scratch.width, scratch.height);
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, scratch.width, scratch.height);
    return { data: data.data, width: data.width, height: data.height };
  };
}

function summarize(frames: readonly ImageLike[]): TemporalDollyEngineResult {
  let opaque = 0;
  let total = 0;
  let changedFrames = 0;
  frames.forEach((frame, index) => {
    for (let o = 3; o < frame.data.length; o += 4) {
      if (frame.data[o]! > 0) opaque += 1;
      total += 1;
    }
    const previous = frames[index - 1];
    if (previous && previous.data.some((v, i) => v !== frame.data[i])) changedFrames += 1;
  });
  return { highlight: highlightFrameSigma(frames), opaqueFraction: total ? opaque / total : 0, changedFrames };
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
    app = await mountAura(auraCanvas, buildAuraSnapshot(), { renderer: { debug: { preserveDrawingBuffer: true } } });
    const read = makeReader(auraCanvas);
    const frames: ImageLike[] = [];
    for (let i = 0; i < DOLLY_FRAMES; i += 1) {
      app.step(1 / 60);
      times.push(app.runtime.time);
      frames.push(read());
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
    const read = makeReader(threeCanvas);
    const frames: ImageLike[] = [];
    const lookAt = new THREE.Vector3(...TARGET);
    const schedule = times.length === DOLLY_FRAMES ? times : Array.from({ length: DOLLY_FRAMES }, (_, i) => (i + 1) / 60);
    for (const seconds of schedule) {
      mount.camera.position.set(...dollyEye(seconds));
      mount.camera.lookAt(lookAt);
      mount.render();
      frames.push(read());
    }
    three = summarize(frames);
  } catch (error) {
    errors.push(`three: ${errorText(error)}`);
  }

  const report: TemporalDollyReport = { flags, frames: DOLLY_FRAMES, aura, three, errors };
  window.__QR_SPEC__ = report;
  return report;
}

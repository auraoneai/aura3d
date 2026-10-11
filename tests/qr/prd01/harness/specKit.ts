/**
 * Shared helpers for the lane-01 spec tools (tests/qr/prd01/harness/spec*.ts):
 * side-by-side Aura/three hosts, engine mounts that settle until drawn, and
 * device-level fullscreen draws + float readback for the C-04/C-05
 * conformance tools. Each tool publishes its report on `window.__QR_SPEC__`;
 * image comparisons are done by the spec from page screenshots (works with
 * `preserveDrawingBuffer: false`) via `__QR_TOOLS__.metrics`.
 */

import * as THREE from "three";
import { createAuraApp } from "@aura3d/engine";
import type { AuraApp, AuraSceneSnapshot } from "@aura3d/engine";
import {
  VertexAttribute,
  VertexFormat,
  type RenderDevice,
  type RenderShaderProgram,
  type UniformValue
} from "../../../../packages/rendering/src";
import type { RenderCommandState } from "../../../../packages/rendering/src/RenderDevice";

declare global {
  interface Window {
    __QR_SPEC__?: unknown;
  }
}

export const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Spec-tool canvases: Aura at (0,0), three at (HALF_W,0), each HALF_W×HALF_H CSS px. */
export const HALF_W = 640;
export const HALF_H = 360;

export function qrFlagsParam(): string {
  return new URLSearchParams(window.location.search).get("a3d-qr") ?? "none";
}

export function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function placeCanvas(stage: HTMLElement, x: number, y: number, w: number, h: number, id: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.width = w;
  canvas.height = h;
  canvas.style.position = "absolute";
  canvas.style.left = `${x}px`;
  canvas.style.top = `${y}px`;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  stage.appendChild(canvas);
  return canvas;
}

export interface AuraMountOptions {
  readonly flags?: string;
  readonly settleFrames?: number;
  readonly renderer?: Record<string, unknown>;
  /** Explicit pixelRatio (default 1); `"auto"` omits it so §6.9 resolves the DPR. */
  readonly pixelRatio?: number | "auto";
  /** Mount at CSS size with `resize: true` (the canvas backing follows the DPR policy). */
  readonly resize?: boolean;
}

/**
 * Mounts a snapshot on a canvas through the public `createAuraApp` path
 * (production profile, no safe-basic fallback), steps until it has drawn and
 * settles. Mount errors throw — a spec must see them, never a degraded frame.
 */
export async function mountAura(canvas: HTMLCanvasElement, snapshot: AuraSceneSnapshot, options: AuraMountOptions = {}): Promise<AuraApp> {
  const app = createAuraApp(canvas, {
    scene: snapshot,
    renderer: { qualityProfile: "production", ...(options.renderer ?? {}) },
    ...(options.pixelRatio === "auto" ? {} : { pixelRatio: options.pixelRatio ?? 1 }),
    resize: options.resize ?? false,
    autoStart: false,
    qualityRebuild: { flags: [options.flags ?? qrFlagsParam()] }
  } as Parameters<typeof createAuraApp>[1]);
  await app.ready();
  const mountErrors = app.diagnostics().errors;
  if (mountErrors.length > 0) throw new Error(`aura mount failed: ${mountErrors.join("; ")}`);
  await settleAura(app, options.settleFrames ?? 6);
  return app;
}

/** Apps whose first-draw wait already ran (a draw-free scene, e.g. background only, waits once, not per settle). */
const drawWaited = new WeakSet<AuraApp>();

export async function settleAura(app: AuraApp, frames: number): Promise<void> {
  const deadline = drawWaited.has(app) ? 0 : performance.now() + 30_000;
  drawWaited.add(app);
  while (performance.now() < deadline) {
    app.step(1 / 60);
    const d = app.diagnostics();
    if (d.drawCalls > 0 || d.errors.length > 0) break;
    await sleep(25);
  }
  for (let i = 0; i < frames; i += 1) {
    app.step(1 / 60);
    await nextFrame();
  }
}

export const THREE_TONE_MAPPING: Readonly<Record<string, THREE.ToneMapping>> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping
};

export interface ThreeMount {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  render(): void;
}

/** three r185 reference renderer on a canvas: sRGB output, explicit tone mapping. */
export async function mountThree(
  canvas: HTMLCanvasElement,
  options: { readonly toneMapping?: string; readonly exposure?: number; readonly fov: number; readonly position: readonly [number, number, number]; readonly target?: readonly [number, number, number]; readonly background: string }
): Promise<ThreeMount> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE_TONE_MAPPING[options.toneMapping ?? "aces"] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background);
  const camera = new THREE.PerspectiveCamera(options.fov, canvas.width / canvas.height, 0.05, 500);
  camera.position.set(...(options.position as [number, number, number]));
  camera.lookAt(new THREE.Vector3(...((options.target ?? [0, 0, 0]) as [number, number, number])));
  return {
    renderer,
    scene,
    camera,
    render: () => renderer.render(scene, camera)
  };
}

export async function settleThree(mount: ThreeMount, frames = 4): Promise<void> {
  await mount.renderer.compileAsync(mount.scene, mount.camera);
  for (let i = 0; i < frames; i += 1) {
    mount.render();
    await nextFrame();
  }
}

/* ------------------------------------------------------------------ */
/* Device-level fullscreen draws (C-04 / C-05 conformance tools)        */
/* ------------------------------------------------------------------ */

const FULLSCREEN_VERTEX = `#version 300 es
// @aura3d-qr:spec-tools
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

export interface FullscreenDraw {
  readonly shader: RenderShaderProgram;
  draw(renderState: RenderCommandState, uniforms?: ReadonlyMap<string, UniformValue>): void;
}

/** A fullscreen-triangle program on a RenderDevice; `fragment` omits `#version`. */
export function fullscreenDraw(device: RenderDevice, label: string, fragment: string): FullscreenDraw {
  const vertexBuffer = device.createBuffer("vertex", 24, new Float32Array([-1, -1, 3, -1, -1, 3]));
  const vertexFormat = new VertexFormat([new VertexAttribute({ semantic: "position", components: 2, offset: 0, shaderName: "a_position" })]);
  const shader = device.createShaderProgram({
    label,
    marker: "@aura3d-qr:spec-tools",
    vertex: FULLSCREEN_VERTEX,
    fragment: `#version 300 es
// @aura3d-qr:spec-tools
precision highp float;
${fragment}`
  });
  return {
    shader,
    draw: (renderState, uniforms) =>
      device.draw({ topology: "triangles", vertexBuffer, vertexFormat, vertexCount: 3, renderState, shader, ...(uniforms ? { uniforms } : {}) })
  };
}

export const OPAQUE_STATE: RenderCommandState = {
  depthTest: false,
  depthWrite: false,
  cullMode: "none",
  blend: false,
  depthCompare: "always"
};

/**
 * GL error trace for the device-level tools: `check(step)` drains
 * `gl.getError()` and records `step: 0x…` for every pending error, so a GPU run
 * names the step that raised it (a strict-mode device throw only reports the
 * first later check that saw it). `drain()` clears without recording.
 */
export interface GlTrace {
  readonly entries: string[];
  check(step: string): void;
  drain(): void;
}

export function glTrace(gl: WebGL2RenderingContext): GlTrace {
  const entries: string[] = [];
  const read = (): number[] => {
    const errors: number[] = [];
    for (let error = gl.getError(); error !== gl.NO_ERROR && errors.length < 8; error = gl.getError()) errors.push(error);
    return errors;
  };
  return {
    entries,
    check(step) {
      for (const error of read()) entries.push(`${step}: 0x${error.toString(16)}`);
    },
    drain() {
      read();
    }
  };
}

/** Float-capable context for the HDR tools: EXT_color_buffer_float enabled before any float target exists. */
export function enableFloatTargets(gl: WebGL2RenderingContext): boolean {
  return gl.getExtension("EXT_color_buffer_float") !== null;
}

/** RGBA float readback of the currently bound framebuffer on a raw context (three reference side). */
export function readGlFloatPixels(gl: WebGL2RenderingContext, x: number, y: number, w: number, h: number): Float32Array {
  gl.getExtension("EXT_color_buffer_float");
  const out = new Float32Array(w * h * 4);
  gl.readPixels(x, y, w, h, gl.RGBA, gl.FLOAT, out);
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error(`readGlFloatPixels: GL error 0x${error.toString(16)}`);
  return out;
}

/** RGBA float readback of the device's active target through the device's own probe path. */
export function readFloatPixels(device: { readFloatPixels?(x: number, y: number, w: number, h: number): Float32Array }, x: number, y: number, w: number, h: number): Float32Array {
  if (!device.readFloatPixels) throw new Error("device has no readFloatPixels");
  return device.readFloatPixels(x, y, w, h);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb8(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  const e = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(e * 255);
}

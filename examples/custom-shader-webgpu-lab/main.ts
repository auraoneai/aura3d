import { Geometry, Renderer, createDefaultShaderLibrary } from "@aura3d/rendering";
// `material.custom` lowers to this adapter; it is not a public export, so the lab imports it directly
// to drive the exact GLSL/WGSL pair through `Renderer.create({ backend })` (createAuraApp is WebGL2-only).
import { createCustomShaderMaterial } from "../../packages/engine/src/agent-api/compiler/customMaterial";

/**
 * threejs-parity SH-02 / L1-04: the engine's custom-material adapter on a real
 * `?backend=webgl2|webgpu` renderer. One authored GLSL + WGSL pair; changing an
 * authored uniform must change pixels without compiling a new pipeline.
 */

interface LabState {
  status: "loading" | "ready" | "error";
  backend: string;
  frame: number;
  wgslAuthored: boolean;
  tint: string;
  gain: number;
  diagnostics: Record<string, unknown>;
  deviceHealth?: Record<string, unknown>;
  error?: string;
}

interface LabReadback {
  readonly hash: string;
  readonly mean: readonly [number, number, number];
  readonly litPixels: number;
}

declare global {
  interface Window {
    __AURA_CUSTOM_SHADER_BACKEND_LAB__?: LabState;
    __AURA_CUSTOM_SHADER_BACKEND_LAB_SET__?: (tint: string, gain: number) => LabState;
    __AURA_CUSTOM_SHADER_BACKEND_LAB_READ__?: () => Promise<LabReadback>;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (!canvas) throw new Error("Custom shader backend lab canvas is missing");

const params = new URLSearchParams(location.search);
const requested = params.get("backend") === "webgpu" ? "webgpu" : "webgl2";
// `?present=offscreen` never configures a canvas context: render into a render target and verify via GPU readback.
// Needed where the browser destroys a GPUDevice as soon as a canvas is configured with it (parity R-22, ACR runner).
const offscreen = params.get("present") === "offscreen";
const state: LabState = { status: "loading", backend: requested, frame: 0, wgslAuthored: true, tint: "#ff3a2a", gain: 1, diagnostics: {} };
window.__AURA_CUSTOM_SHADER_BACKEND_LAB__ = state;

// Diagnostic: record who destroys the GPUDevice. No entry on a lost device means the browser, not JS, destroyed it.
const destroyTrace: string[] = [];
const gpuDeviceProto = (globalThis as { GPUDevice?: { prototype: { destroy?: () => void } } }).GPUDevice?.prototype;
if (requested === "webgpu" && gpuDeviceProto?.destroy) {
  const nativeDestroy = gpuDeviceProto.destroy;
  gpuDeviceProto.destroy = function (this: unknown) {
    destroyTrace.push(`${Math.round(performance.now())}ms frame=${state.frame} ${(new Error().stack ?? "").split("\n").slice(1, 9).map((line) => line.trim()).join(" <- ")}`);
    return nativeDestroy.call(this);
  };
}

const GLSL_FRAGMENT = `out vec4 outColor;
void main() {
  float band = 0.55 + 0.45 * sin(gl_FragCoord.x * 0.06);
  outColor = vec4(tint * band * gain, 1.0);
}`;

const WGSL_FRAGMENT = `@fragment
fn fs_main(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let band = 0.55 + 0.45 * sin(frag.x * 0.06);
  return vec4<f32>(aura.u_tint * band * aura.u_gain, 1.0);
}`;

const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};

try {
  const renderer = await Renderer.create({
    backend: requested,
    ...(offscreen ? {} : { canvas }),
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.018, 0.024, 0.07, 1],
    shaderLibrary: createDefaultShaderLibrary()
  });
  const offscreenTarget = offscreen
    ? renderer.device.createRenderTarget({ width: canvas.width, height: canvas.height, label: "backend-lab-target", format: "rgba8", depth: true })
    : undefined;
  const material = createCustomShaderMaterial({
    glsl: { fragment: GLSL_FRAGMENT },
    wgsl: { fragment: WGSL_FRAGMENT },
    uniforms: { tint: { type: "color3", value: state.tint }, gain: { type: "f32", value: 1 } }
  }, "backend-lab");
  const geometry = Geometry.uvSphere(0.5, 48, 28);
  // Column-major; z translated into [0,1] so the sphere survives both GL and WebGPU clip volumes.
  const transform = [0.8, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0.8, 0, 0, 0, 0.5, 1];

  const deviceHealth = (): Record<string, unknown> => {
    try {
      const { lastError, contextLost } = renderer.getDiagnostics() as unknown as { lastError?: unknown; contextLost?: unknown };
      return { lastError: lastError ?? null, contextLost: contextLost ?? null, destroyTrace, nowMs: Math.round(performance.now()) };
    } catch (error) {
      return { healthProbeError: error instanceof Error ? error.message : String(error) };
    }
  };

  const render = (): LabState => {
    try {
      material.setParameter("u_tint", hexToRgb(state.tint));
      material.setParameter("u_gain", state.gain);
      const diagnostics = renderer.render({
        renderItems: [{ geometry, material, label: material.name, modelMatrix: transform, modelViewProjectionMatrix: transform }],
        ...(offscreenTarget ? { renderTarget: offscreenTarget } : {})
      });
      state.frame += 1;
      state.backend = renderer.device.kind;
      state.diagnostics = { ...diagnostics };
      state.deviceHealth = deviceHealth();
      state.status = "ready";
      document.querySelector("#backend")!.textContent = `${renderer.device.kind.toUpperCase()} · material.custom adapter`;
      document.querySelector("#evidence")!.textContent = `${diagnostics.drawCalls} draw · tint ${state.tint} · gain ${state.gain}`;
      return state;
    } catch (error) {
      state.status = "error";
      state.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      state.deviceHealth = deviceHealth();
      throw error;
    }
  };

  window.__AURA_CUSTOM_SHADER_BACKEND_LAB_SET__ = (tint, gain) => {
    state.tint = tint;
    state.gain = gain;
    return render();
  };
  window.__AURA_CUSTOM_SHADER_BACKEND_LAB_READ__ = async () => {
    const readPixelsAsync = renderer.device.readPixelsAsync;
    if (!offscreenTarget || typeof readPixelsAsync !== "function") throw new Error("GPU readback requires ?present=offscreen on a device with readPixelsAsync");
    const pixels = await readPixelsAsync.call(renderer.device, 0, 0, canvas.width, canvas.height);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", pixels));
    const sum = [0, 0, 0];
    let lit = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      // Clear colour is ~(5,6,18); anything brighter than that is the shaded sphere.
      if (pixels[i]! > 40 || pixels[i + 1]! > 40 || pixels[i + 2]! > 40) {
        sum[0]! += pixels[i]!; sum[1]! += pixels[i + 1]!; sum[2]! += pixels[i + 2]!;
        lit += 1;
      }
    }
    const mean = lit > 0 ? [sum[0]! / lit, sum[1]! / lit, sum[2]! / lit] as const : [0, 0, 0] as const;
    return { hash: Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join(""), mean, litPixels: lit };
  };
  render();
} catch (error) {
  state.status = "error";
  state.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  throw error;
}

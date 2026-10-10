// PRD-07 P3-T3 — bare `sky` node harness (C-21 through the frame graph).
// A `sky.preetham` node (noon sun) + a lit ground plane; reports sky-region
// luma stats + atmosphere diagnostics + sun-disc luminance from an rgba16f
// device readback (P-34: sun disc HDR luminance > 10).
import { camera, createAuraApp, primitives, scene, sky } from "@aura3d/engine";
import { WebGL2Device } from "/packages/rendering/src/WebGL2Device.js";
import { skyPassFor } from "/packages/rendering/src/atmosphere/SkyBackgroundPass.js";
import { sunDirection } from "/packages/rendering/src/atmosphere/PreethamSky.js";
import { mountReady } from "./mount-timing.js";

interface SkyBgResult {
  readonly status: "ready" | "error";
  readonly mountMs?: number | null;
  readonly flags?: readonly string[];
  readonly skyLumaStd?: number;
  readonly horizonMeanLuma?: number;
  readonly zenithMeanLuma?: number;
  readonly background?: string | null;
  readonly sunDiscLuminance?: number;
  readonly errors?: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_SKYBG__?: SkyBgResult;
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function meanStd(data: Uint8ClampedArray, y0: number, y1: number, w: number): { mean: number; std: number } {
  let n = 0, sum = 0, sq = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const L = luma(data[i]!, data[i + 1]!, data[i + 2]!);
      n += 1; sum += L; sq += L * L;
    }
  }
  const mean = sum / Math.max(1, n);
  return { mean, std: Math.sqrt(Math.max(0, sq / Math.max(1, n) - mean * mean)) };
}

async function main(): Promise<void> {
  const host = document.getElementById("stage")!;
  const raw = new URLSearchParams(window.location.search).get("a3d-qr");
  const flags = raw ? raw.split(",").filter(Boolean) : [];

  const built = scene()
    .add(sky.preetham({ sun: { elevationDeg: 60, azimuthDeg: 200 }, turbidity: 5 }))
    .add(primitives.plane({ name: "ground", material: { color: "#3a4a2a", roughness: 0.9 }, size: [30, 1, 30], receiveShadow: true }));
  built.camera(camera.perspective({ position: [0, 1.6, 7], target: [0, 3.0, -3], fov: 55, near: 0.05, far: 120 }));

  const app = createAuraApp(host, {
    scene: built,
    renderer: { qualityProfile: "production" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    ...(flags.length > 0 ? { qualityRebuild: { flags } } : {})
  });
  const __mount = await mountReady(app);
  for (let i = 0; i < 30; i += 1) {
    app.step(1 / 60);
    await frame();
  }
  const canvas = host.querySelector("canvas")!;
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const h = canvas.height;
  const skyRegion = meanStd(data, 0, Math.floor(h * 0.35), canvas.width);
  const zenith = meanStd(data, 0, Math.floor(h * 0.08), canvas.width);
  const horizon = meanStd(data, Math.floor(h * 0.28), Math.floor(h * 0.4), canvas.width);

  const report = app.diagnostics() as unknown as {
    atmosphere?: { background?: string };
    errors?: readonly string[];
  };

  // P-34 — sun disc HDR luminance: render the same preetham spec straight into
  // an rgba16f target with a view-projection centred on the sun, then take the
  // max luminance via RenderDevice.readFloatPixels. The sky shader writes
  // L0 += sunE·19000·Fex at the disc, so a real sky reads >> 10 there.
  let sunDiscLuminance: number | undefined;
  try {
    sunDiscLuminance = renderSunDiscLuminance({ elevationDeg: 60, azimuthDeg: 200 }, 5);
  } catch {
    sunDiscLuminance = undefined;
  }

  window.__QR_PRD07_SKYBG__ = {
    status: "ready",
    mountMs: __mount.mountMs,
    flags,
    skyLumaStd: skyRegion.std,
    zenithMeanLuma: zenith.mean,
    horizonMeanLuma: horizon.mean,
    background: report.atmosphere?.background ?? null,
    sunDiscLuminance,
    errors: [...(report.errors ?? [])]
  };
  app.dispose();
}

/** Inverse of a column-major 4×4 (Gauss-Jordan). The flat input read as
 *  row-major is Mᵀ; inverting it row-major yields M⁻ᵀ row-major, which is
 *  M⁻¹ column-major — the exact layout callers pass back in. */
function invertMat4(m: Float32Array): Float32Array {
  const a = Array.from(m);
  const inv = new Array(16).fill(0);
  for (let i = 0; i < 4; i += 1) inv[i * 4 + i] = 1;
  for (let col = 0; col < 4; col += 1) {
    let piv = col;
    for (let r = col + 1; r < 4; r += 1) {
      if (Math.abs(a[r * 4 + col]!) > Math.abs(a[piv * 4 + col]!)) piv = r;
    }
    for (let c = 0; c < 4; c += 1) {
      const t = a[col * 4 + c]!; a[col * 4 + c] = a[piv * 4 + c]!; a[piv * 4 + c] = t;
      const u = inv[col * 4 + c]!; inv[col * 4 + c] = inv[piv * 4 + c]!; inv[piv * 4 + c] = u;
    }
    const d = a[col * 4 + col]!;
    for (let c = 0; c < 4; c += 1) { a[col * 4 + c]! /= d; inv[col * 4 + c]! /= d; }
    for (let r = 0; r < 4; r += 1) {
      if (r === col) continue;
      const f = a[r * 4 + col]!;
      for (let c = 0; c < 4; c += 1) {
        a[r * 4 + c]! -= f * a[col * 4 + c]!;
        inv[r * 4 + c]! -= f * inv[col * 4 + c]!;
      }
    }
  }
  return new Float32Array(inv);
}

/** Renders the preetham sky into rgba16f aimed at the sun; returns max luma. */
function renderSunDiscLuminance(sun: { elevationDeg: number; azimuthDeg: number }, turbidity: number): number {
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 64;
  const device = WebGL2Device.create({ canvas });
  const target = device.createRenderTarget({ width: 64, height: 64, format: "rgba16f", depth: false, label: "prd07.sky-sun-disc" });
  try {
    const pass = skyPassFor(device);
    pass.setSpec({ model: "preetham", sun, turbidity }, 0);
    const s = sunDirection(sun);
    const up: [number, number, number] = Math.abs(s[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    // tx = normalize(cross(up, sun)), ty = cross(sun, tx)
    let tx = [up[1] * s[2] - up[2] * s[1], up[2] * s[0] - up[0] * s[2], up[0] * s[1] - up[1] * s[0]];
    const tl = Math.hypot(tx[0]!, tx[1]!, tx[2]!) || 1;
    tx = [tx[0]! / tl, tx[1]! / tl, tx[2]! / tl];
    const ty = [s[1] * tx[2]! - s[2] * tx[1]!, s[2] * tx[0]! - s[0] * tx[2]!, s[0] * tx[1]! - s[1] * tx[0]!];
    const k = 0.1; // NDC→dir slope: keeps the 0.53° disc across several texels
    // invViewProj maps vec4(v_clip,1,1) → x·tx·k + y·ty·k + sun·k (+w=1), so the
    // centre texel's ray is exactly the sun direction.
    const m = new Float32Array([
      tx[0]! * k, tx[1]! * k, tx[2]! * k, 0,
      ty[0]! * k, ty[1]! * k, ty[2]! * k, 0,
      s[0] * k, s[1] * k, s[2] * k, 0,
      0, 0, 0, 1
    ]);
    const vp = invertMat4(m);
    device.setRenderTarget(target);
    pass.drawSky(vp);
    device.setRenderTarget(null);
    const px = device.readFloatPixels(0, 0, 64, 64);
    let max = 0;
    for (let i = 0; i < px.length; i += 4) {
      max = Math.max(max, luma(px[i]!, px[i + 1]!, px[i + 2]!));
    }
    return max;
  } finally {
    target.dispose();
    device.dispose?.();
  }
}

main().catch((error: unknown) => {
  window.__QR_PRD07_SKYBG__ = { status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
});

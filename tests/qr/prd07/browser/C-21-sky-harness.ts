// 07 Phase D §22.5 — C-21 sky conformance harness (stub and real legs).
// Contract leg: skyBackgroundSlot resolves to the PR 0a stub with
// A3D_QR_VFX off (horizonRadiance is 3 zeros; sky→IBL capture absent) and to
// PRD 07's SkyBackgroundPass with it on (horizonRadiance(8) = 24 finite
// floats with non-zero radiance for a noon preetham sky).
// App leg: a `sky.preetham` scene draws a varied sky through the frame graph
// with flags `vfx,vfx.sky` (sky-region 8-bit luma std).
import { camera, createAuraApp, primitives, scene, sky } from "@aura3d/engine";
import { skyBackgroundSlot } from "/packages/rendering/src/contracts/atmosphere.js";
import { WebGL2Device } from "/packages/rendering/src/WebGL2Device.js";
import { mountReady } from "./mount-timing.js";

interface SkyResult {
  readonly status: "ready" | "error";
  readonly flags?: readonly string[];
  readonly provided?: boolean;
  readonly resolved?: "stub" | "real";
  readonly radianceLength?: number;
  readonly radianceMax?: number;
  readonly radianceFinite?: boolean;
  readonly skyLumaStd?: number;
  readonly errors?: readonly string[];
  readonly mountMs?: number | null;
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_C21__?: SkyResult;
  }
}

const NOON = { model: "preetham", sun: { elevationDeg: 60, azimuthDeg: 200 }, turbidity: 5 } as const;

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function contractLeg(vfxOn: boolean): { resolved: "stub" | "real"; radiance: Float32Array } {
  const flags = { values: {}, on: (name: string) => vfxOn && name === "A3D_QR_VFX" };
  const factory = skyBackgroundSlot.get(flags as never);
  const resolved = factory === skyBackgroundSlot.stub ? "stub" : "real";
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const pass = factory(WebGL2Device.create({ canvas }));
  pass.setSpec(NOON, 0);
  return { resolved, radiance: pass.horizonRadiance(8) };
}

function skyLumaStd(canvas: HTMLCanvasElement): number {
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const rows = Math.floor(canvas.height * 0.35);
  const data = ctx.getImageData(0, 0, canvas.width, rows).data;
  let n = 0, sum = 0;
  const values: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    values.push(l);
    sum += l;
    n += 1;
  }
  const mean = sum / Math.max(1, n);
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / Math.max(1, n));
}

async function main(): Promise<void> {
  const host = document.getElementById("stage")!;
  const raw = new URLSearchParams(window.location.search).get("a3d-qr");
  const flags = raw ? raw.split(",").filter(Boolean) : [];
  const contract = contractLeg(flags.includes("vfx"));

  const built = scene()
    .add(sky.preetham({ sun: { elevationDeg: NOON.sun.elevationDeg, azimuthDeg: NOON.sun.azimuthDeg }, turbidity: NOON.turbidity }))
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
  const mount = await mountReady(app);
  for (let i = 0; i < 20; i += 1) {
    app.step(1 / 60);
    await frame();
  }
  const std = skyLumaStd(host.querySelector("canvas")!);
  const report = app.diagnostics() as unknown as { errors?: readonly string[] };
  const radiance = Array.from(contract.radiance);
  window.__QR_PRD07_C21__ = {
    status: "ready",
    flags,
    provided: skyBackgroundSlot.provided,
    resolved: contract.resolved,
    radianceLength: radiance.length,
    radianceMax: radiance.length ? Math.max(...radiance) : 0,
    radianceFinite: radiance.every((v) => Number.isFinite(v)),
    skyLumaStd: std,
    errors: [...(report.errors ?? [])],
    mountMs: mount.mountMs
  };
  app.dispose();
}

main().catch((error: unknown) => {
  window.__QR_PRD07_C21__ = { status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
});

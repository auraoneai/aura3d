// 07 Phase D §22.5 — C-20 burst conformance harness (stub and real legs).
// Contract leg: particleRenderHookSlot resolves to the stub with A3D_QR_VFX
// off (upsertBatch throws PARTICLE_PASS_PENDING) and to PRD 07's real
// ParticleBatchPass with it on (upsertBatch returns a handle).
// App leg (CONTRACTS C-20 conformance): `app.effects.burst("spark", …)` gives
// instancesDrawn > 0 and a non-empty 64×64 diff region with flags `vfx`.
import { camera, createAuraApp, lights, primitives, scene } from "@aura3d/engine";
import { particleRenderHookSlot } from "/packages/rendering/src/contracts/particles.js";
import { WebGL2Device } from "/packages/rendering/src/WebGL2Device.js";
import { mountReady } from "./mount-timing.js";

interface BurstResult {
  readonly status: "ready" | "error";
  readonly flags?: readonly string[];
  readonly provided?: boolean;
  readonly resolved?: "stub" | "real";
  readonly upsert?: "handle" | "PARTICLE_PASS_PENDING" | string;
  readonly instancesDrawn?: number;
  readonly liveParticles?: number;
  readonly maxChangedFraction?: number;
  readonly errors?: readonly string[];
  readonly mountMs?: number | null;
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_C20__?: BurstResult;
  }
}

const REGION = 64;

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function region(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const x0 = Math.max(0, Math.floor(canvas.width / 2 - REGION / 2));
  const y0 = Math.max(0, Math.floor(canvas.height / 2 - REGION / 2));
  return ctx.getImageData(x0, y0, Math.min(REGION, canvas.width), Math.min(REGION, canvas.height)).data;
}

function changed(before: Uint8ClampedArray, after: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (Math.abs(before[i]! - after[i]!) + Math.abs(before[i + 1]! - after[i + 1]!) + Math.abs(before[i + 2]! - after[i + 2]!) > 24) n += 1;
  }
  return n / (before.length / 4);
}

/** Contract leg: resolve the slot exactly as the frame graph does. */
function contractLeg(vfxOn: boolean): { resolved: "stub" | "real"; upsert: string } {
  const flags = { values: {}, on: (name: string) => vfxOn && name === "A3D_QR_VFX" };
  const factory = particleRenderHookSlot.get(flags as never);
  const resolved = factory === particleRenderHookSlot.stub ? "stub" : "real";
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const device = WebGL2Device.create({ canvas });
  const hook = factory(device);
  let upsert: string;
  try {
    // upsertBatch only records the descriptor; the atlas is bound at draw time.
    const atlas = {} as never;
    const h = hook.upsertBatch({ key: "c20.probe", capacity: 8, source: "cpu", atlas, blend: "additive", shading: "unlit", softDepth: false, stretch: false, frameBlend: false } as never);
    upsert = h && typeof h.key === "string" ? "handle" : "no-handle";
    hook.removeBatch(h);
  } catch (error) {
    upsert = error instanceof Error ? error.message : String(error);
  }
  return { resolved, upsert };
}

async function main(): Promise<void> {
  const host = document.getElementById("stage")!;
  const raw = new URLSearchParams(window.location.search).get("a3d-qr");
  const flags = raw ? raw.split(",").filter(Boolean) : [];
  const contract = contractLeg(flags.includes("vfx"));

  const built = scene()
    .add(primitives.plane({ name: "floor", material: { color: "#0b0d14", roughness: 0.9, metalness: 0 }, size: [16, 1, 16], castShadow: false, receiveShadow: false }))
    .add(lights.ambient({ name: "ambient", color: "#ffffff", intensity: 0.1 }));
  built.background("#02030a");
  built.camera(camera.perspective({ position: [0, 1.6, 6], target: [0, 0.4, 0], fov: 50, near: 0.05, far: 60 }));
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
  const canvas = host.querySelector("canvas")!;
  const before = region(canvas);
  app.effects?.burst("spark", [0, 0.4, 0], { count: 64, seed: 20 });
  const fractions: number[] = [];
  let instancesDrawn = 0;
  for (let i = 0; i < 3; i += 1) {
    app.step(1 / 60);
    await frame();
    fractions.push(changed(before, region(canvas)));
    const fx = (app.diagnostics() as unknown as { effects?: { nodes?: readonly { instancesDrawn?: number }[] } }).effects;
    instancesDrawn = Math.max(instancesDrawn, (fx?.nodes ?? []).reduce((s, n) => s + (n.instancesDrawn ?? 0), 0));
  }
  const report = app.diagnostics() as unknown as { errors?: readonly string[]; effects?: { liveParticles?: number } };
  window.__QR_PRD07_C20__ = {
    status: "ready",
    flags,
    provided: particleRenderHookSlot.provided,
    resolved: contract.resolved,
    upsert: contract.upsert,
    instancesDrawn,
    liveParticles: report.effects?.liveParticles ?? 0,
    maxChangedFraction: Math.max(...fractions),
    errors: [...(report.errors ?? [])],
    mountMs: mount.mountMs
  };
  app.dispose();
}

main().catch((error: unknown) => {
  window.__QR_PRD07_C20__ = { status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
});

// PRD-07 P4-T7 — background fog match harness.
// preetham sky + `effects.fog` (exp, density tuned so everything past ~100 m
// saturates to fogColor) + a tall far box at z=-110. With A3D_QR_VFX_FOG on,
// the sky pass applies a3dApplyFog at backgroundDistance → the horizon band
// and the fully-fogged box band both converge to the same fog colour —
// delta ≤ 3/255. Flag off: the box shows its lit material colour and the two
// bands differ clearly (sentinel).
import { camera, createAuraApp, effects, primitives, scene, sky } from "@aura3d/engine";
import { mountReady } from "./mount-timing.js";

interface FogBgResult {
  readonly status: "ready" | "error";
  readonly mountMs?: number | null;
  readonly flags?: readonly string[];
  readonly skyBand?: readonly [number, number, number];
  readonly boxBand?: readonly [number, number, number];
  readonly delta?: number;
  readonly errors?: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_FOGBG__?: FogBgResult;
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function bandMean(data: Uint8ClampedArray, w: number, h: number, y0f: number, y1f: number, x0f: number, x1f: number): [number, number, number] {
  const y0 = Math.floor(h * y0f), y1 = Math.floor(h * y1f);
  const x0 = Math.floor(w * x0f), x1 = Math.floor(w * x1f);
  let n = 0;
  let r = 0, g = 0, b = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * w + x) * 4;
      r += data[i]!; g += data[i + 1]!; b += data[i + 2]!;
      n += 1;
    }
  }
  const inv = 1 / Math.max(1, n);
  return [Math.round(r * inv), Math.round(g * inv), Math.round(b * inv)];
}

async function main(): Promise<void> {
  const host = document.getElementById("stage")!;
  const raw = new URLSearchParams(window.location.search).get("a3d-qr");
  const flags = raw ? raw.split(",").filter(Boolean) : [];

  const built = scene()
    .add(sky.preetham({ sun: { elevationDeg: 55, azimuthDeg: 200 }, turbidity: 5 }))
    .add(
      effects.fog({
        name: "fog",
        mode: "exp",
        density: 0.08,
        color: "#a9bccf"
      } as never)
    )
    .add(primitives.plane({ name: "ground", material: { color: "#3a4a2a", roughness: 0.9 }, size: [40, 1, 40] }).position(0, 0, -10))
    .add(primitives.box({ name: "farwall", material: { color: "#43515c", roughness: 1 }, size: [60, 40, 4] }).position(0, 20, -110));
  built.camera(camera.perspective({ position: [0, 1.6, 7], target: [0, 2.5, -20], fov: 55, near: 0.05, far: 200 }));

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
  const w = canvas.width, h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  // Sky band well above the horizon; box band inside the far wall's face
  // (centre columns only — the box spans ~31° of the ~68° horizontal fov).
  const skyBand = bandMean(data, w, h, 0.06, 0.14, 0.4, 0.6);
  const boxBand = bandMean(data, w, h, 0.55, 0.65, 0.4, 0.6);
  const delta = Math.max(
    Math.abs(skyBand[0] - boxBand[0]),
    Math.abs(skyBand[1] - boxBand[1]),
    Math.abs(skyBand[2] - boxBand[2])
  );

  const report = app.diagnostics() as unknown as { errors?: readonly string[] };

  window.__QR_PRD07_FOGBG__ = {
    status: "ready",
    mountMs: __mount.mountMs,
    flags,
    skyBand,
    boxBand,
    delta,
    errors: [...(report.errors ?? [])]
  };
  app.dispose();
}

main().catch((error: unknown) => {
  window.__QR_PRD07_FOGBG__ = { status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
});

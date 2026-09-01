/** Pulse Tunnel V6 — isolated deterministic texture/identity candidate. */
import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraAssetRef
} from "@aura3d/engine";

declare global {
  interface Window {
    __PULSE_TEXTURE_IDENTITY_V6__?: {
      readonly ready: boolean;
      readonly backend: string | undefined;
      readonly drawCalls: number;
      readonly renderSize: readonly number[];
      readonly errors: readonly string[];
    };
    __PULSE_TEXTURE_IDENTITY_V6_ERROR__?: string;
  }
}

const candidate = <TName extends string>(
  file: string,
  name: TName,
  hash: string,
  bounds: readonly [number, number, number],
  sizeBytes: number
): AuraAssetRef<"model", TName> => ({
  type: "model",
  format: "glb",
  url: new URL(`./assets/texture-identity-v6/${file}`, import.meta.url).href,
  hash: `sha256-${hash}`,
  bounds,
  sizeBytes,
  metadata: {
    license: "CC0-1.0",
    author: "Aura3D route-local synthesis",
    sourcePath: "apps/showcase-pulse-tunnel/scripts/build-texture-identity-v6.py",
    role: "unregistered isolated art candidate"
  }
});

const runner = candidate(
  "pulsePhaseMantaV6.candidate.glb",
  "pulsePhaseMantaV6Candidate",
  "df01caa46aec41c038ab5371e4a15139a82c3b6c478329ff0afe180a9544de25",
  [3.89, 0.95, 3.7],
  1239812
);
const sentry = candidate(
  "pulseCathedralSentinelV6.candidate.glb",
  "pulseCathedralSentinelV6Candidate",
  "4fbbaa37232414a29475b22fe5e3cd222ae398bd4990575e56e96fca5628b4ba",
  [5.142, 2.561, 2.785],
  1806088
);
const world = candidate(
  "pulseBraidedReactorWorldV6.candidate.glb",
  "pulseBraidedReactorWorldV6Candidate",
  "eaab715521053a6977a0285d307e63a0205f47d29aa3408bec08c4bb4148a140",
  [9.398, 4.73, 15.58],
  2283816
);

const cyan = material.emissive({
  name: "V6 player phase exchange",
  color: "#bdfaff",
  emissive: "#00b8d4",
  emissiveIntensity: 1.55
});
const red = material.emissive({
  name: "V6 sentinel threat exchange",
  color: "#ff8b7e",
  emissive: "#f02318",
  emissiveIntensity: 1.7
});
const white = material.emissive({
  name: "V6 impact fracture",
  color: "#f2ffff",
  emissive: "#57e9f4",
  emissiveIntensity: 1.25,
  opacity: 0.88
});

const outgoing = Array.from({ length: 7 }, (_, index) => {
  const t = (index + 1) / 8;
  return primitives.cylinder({ name: `V6 cyan phase bolt ${index + 1}`, material: cyan })
    .position(-1.22 + t * 1.36, 0.68 + Math.sin(t * Math.PI) * 0.48, 0.05 - t * 6.35)
    .rotate(Math.PI / 2, 0, -0.09)
    .scale([0.075, 0.32 + (index % 2) * 0.08, 0.075]);
});
const incoming = Array.from({ length: 6 }, (_, index) => {
  const t = (index + 1) / 7;
  return primitives.torus({ name: `V6 red cutting pulse ${index + 1}`, material: red })
    .position(0.92 - t * 1.72, 1.58 - t * 0.75, -7.1 + t * 5.85)
    .rotate(0.12, -0.08, 0)
    .scale([0.15 + t * 0.06, 0.15 + t * 0.06, 0.045]);
});

const app = createAuraApp("#stage", {
  pixelRatio: 1,
  resize: true,
  renderer: { mode: "safe-basic", qualityProfile: "safe-basic" },
  scene: scene()
    .background("#02070c")
    .camera(camera.perspective({
      position: [0.35, 2.28, 8.8],
      target: [0.02, 1.12, -4.45],
      fov: 43
    }))
    .addMany([
      model(world, { name: "V6 braided reactor tunnel", role: "primaryWorld", targetMaxDimension: 15.58 }),
      model(runner, { name: "V6 original Pulse phase manta", role: "primarySubject", targetMaxDimension: 3.89 })
        .position(-1.36, 0.22, 0.42).rotate(0, -0.035, -0.015).scale(1.06),
      model(sentry, { name: "V6 original Pulse cathedral sentinel", role: "primarySubject", targetMaxDimension: 5.142 })
        .position(0.92, 0.14, -7.62).rotate(0, Math.PI, 0).scale(1.04),
      primitives.torus({ name: "V6 runner shield fracture", material: white })
        .position(-1.00, 0.82, -1.05).rotate(0.08, -0.10, 0.04).scale([0.66, 0.66, 0.055]),
      primitives.torus({ name: "V6 terminal cadence lock", material: red })
        .position(0.92, 1.70, -7.10).scale([0.76, 0.76, 0.055]),
      ...outgoing,
      ...incoming,
      effects.neonBloom({ intensity: 0.34, threshold: 0.79, maxIntensity: 0.82, antiBlowout: true }),
      effects.fog({ name: "V6 cold reactor depth", density: 0.0035, color: "#02070c" }),
      lights.ambient({ name: "V6 graphite ambient", color: "#315163", intensity: 0.36 }),
      lights.directional({ name: "V6 cold silhouette key", color: "#d9f7ff", intensity: 2.25 }).position(-5.8, 8.6, 6.8),
      lights.directional({ name: "V6 red terminal rim", color: "#ff4d3d", intensity: 1.15 }).position(5.6, 5.8, -5.9),
      lights.point({ name: "V6 player cyan contact", color: "#2deafa", intensity: 2.4 }).position(-2.2, 1.6, 1.5),
      lights.point({ name: "V6 sentinel furnace", color: "#ff2d23", intensity: 3.2 }).position(1.2, 2.2, -7.0),
      lights.point({ name: "V6 exchange lane", color: "#66f3ff", intensity: 1.05 }).position(0, 0.55, -3.4)
    ]),
  diagnostics: false,
  autoStart: true
});

void publishReady().catch((error: unknown) => {
  window.__PULSE_TEXTURE_IDENTITY_V6_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function publishReady(): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0 && diagnostics.errors.length === 0) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const settled = app.diagnostics();
      window.__PULSE_TEXTURE_IDENTITY_V6__ = {
        ready: true,
        backend: settled.renderer?.runtime.backend,
        drawCalls: settled.drawCalls,
        renderSize: settled.renderSize,
        errors: settled.errors
      };
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Pulse Tunnel V6 candidate pixels.");
}

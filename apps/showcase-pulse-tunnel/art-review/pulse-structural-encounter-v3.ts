/**
 * Pulse Tunnel structural encounter V3 — isolated, non-release art review.
 *
 * This page uses the retained, typed Pulse assets and public root-safe scene
 * builders. It does not change the playable chart, camera, sync, controls,
 * collision, reduced-motion, or manifest contracts. Its sole purpose is to
 * test a stronger composition before any integration decision is made.
 */
import {
  camera,
  createAuraApp,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraAssetRef
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

declare global {
  interface Window {
    __PULSE_TUNNEL_STRUCTURAL_V3__?: {
      readonly ready: boolean;
      readonly backend: string | undefined;
      readonly drawCalls: number;
      readonly renderSize: readonly number[];
      readonly errors: readonly string[];
    };
    __PULSE_TUNNEL_STRUCTURAL_V3_ERROR__?: string;
  }
}

const worldUrl = new URL("./assets/pulseStructuralWorldV3.candidate.glb", import.meta.url).href;
const structuralWorld: AuraAssetRef<"model", "pulseStructuralWorldV3Candidate"> = {
  type: "model",
  format: "glb",
  url: worldUrl,
  hash: "sha256-57f87e0eeb0360bee3a19ec0f968c322e9cb239ac6a95409ff433fa5f74add2f",
  bounds: [10.4, 4.3, 15.2],
  sizeBytes: 309384,
  metadata: {
    license: "CC0-1.0",
    role: "unregistered original route-local structural-world art candidate"
  }
};

const gunmetal = material.pbr({
  name: "V3 gunmetal architecture",
  color: "#26374a",
  metallic: 0.62,
  roughness: 0.42,
  emissive: "#102f4b",
  emissiveIntensity: 0.15
});
const deckMaterial = material.pbr({
  name: "V3 layered combat deck",
  color: "#30475e",
  metallic: 0.5,
  roughness: 0.48,
  emissive: "#123b55",
  emissiveIntensity: 0.16
});
const darkSteel = material.pbr({
  name: "V3 dark structural steel",
  color: "#152336",
  metallic: 0.7,
  roughness: 0.38,
  emissive: "#111f35",
  emissiveIntensity: 0.12
});
const cyan = material.emissive({
  name: "V3 runner energy",
  color: "#8beaff",
  emissive: "#14b8d4",
  emissiveIntensity: 0.72
});
const amber = material.emissive({
  name: "V3 terminal energy",
  color: "#ffd58a",
  emissive: "#e86c22",
  emissiveIntensity: 0.68
});
const rose = material.emissive({
  name: "V3 terminal warning",
  color: "#ff91ac",
  emissive: "#d22f67",
  emissiveIntensity: 0.64
});

// A broad near apron, lowered exchange channel, and raised terminal dock form
// three unambiguous depth planes. They remain set dressing around typed assets.
const deckBuilders = [
  primitives.box({ name: "V3 near runner apron", material: deckMaterial })
    .position(-1.15, -0.13, 0.35).scale([3.55, 0.16, 2.4]),
  primitives.box({ name: "V3 exchange channel", material: darkSteel })
    .position(0.15, -0.28, -3.15).scale([3.0, 0.08, 2.15]),
  primitives.box({ name: "V3 raised terminal dock", material: deckMaterial })
    .position(1.25, -0.04, -6.05).scale([3.45, 0.24, 1.45]),
  primitives.box({ name: "V3 left deck shoulder", material: gunmetal })
    .position(-4.2, 0.22, -2.65).rotate(0, -0.08, 0).scale([0.72, 0.42, 5.45]),
  primitives.box({ name: "V3 right deck shoulder", material: gunmetal })
    .position(4.1, 0.22, -2.65).rotate(0, 0.08, 0).scale([0.72, 0.42, 5.45])
];

// Sparse, thick structural ribs frame the exchange without producing the
// floating-bar clutter of the previous candidate.
const ribBuilders = Array.from({ length: 3 }, (_, index) => {
  const z = 0.4 - index * 2.35;
  const inset = index * 0.08;
  return [
    primitives.box({ name: `V3 left rib ${index + 1}`, material: darkSteel })
      .position(-4.05 + inset, 1.65, z).rotate(0, -0.04, -0.18).scale([0.22, 1.72, 0.28]),
    primitives.box({ name: `V3 right rib ${index + 1}`, material: darkSteel })
      .position(4.05 - inset, 1.65, z).rotate(0, 0.04, 0.18).scale([0.22, 1.72, 0.28]),
    primitives.box({ name: `V3 crown rib ${index + 1}`, material: gunmetal })
      .position(0, 3.13, z).scale([3.75 - inset, 0.18, 0.3])
  ];
}).flat();

// Deck edge strips make the lane's perspective converge on the terminal.
const guideBuilders = [
  primitives.box({ name: "V3 cyan left guide", material: cyan })
    .position(-2.85, 0.06, -2.65).rotate(0, -0.06, 0).scale([0.045, 0.035, 5.1]),
  primitives.box({ name: "V3 amber right guide", material: amber })
    .position(2.85, 0.06, -2.65).rotate(0, 0.06, 0).scale([0.045, 0.035, 5.1]),
  ...Array.from({ length: 5 }, (_, index) =>
    primitives.box({ name: `V3 channel cadence ${index + 1}`, material: index % 2 === 0 ? cyan : amber })
      .position(0.15, -0.17, -1.25 - index * 1.05).scale([0.62, 0.025, 0.045])
  )
];

// Projectile packets occupy two distinct arcs: cool outgoing packets rise from
// the runner, and warm returning packets descend toward a visible shield plane.
const outgoingPackets = Array.from({ length: 8 }, (_, index) => {
  const t = (index + 1) / 9;
  return primitives.sphere({ name: `V3 outgoing packet ${index + 1}`, material: cyan })
    .position(-1.4 + t * 2.75, 0.7 + Math.sin(t * Math.PI) * 0.62, 0.45 - t * 5.55)
    .scale([0.075, 0.075, 0.16]);
});
const returningPackets = Array.from({ length: 7 }, (_, index) => {
  const t = (index + 1) / 8;
  return primitives.sphere({ name: `V3 returning packet ${index + 1}`, material: index % 3 === 0 ? rose : amber })
    .position(1.25 - t * 2.15, 1.65 - t * 0.72 + Math.sin(t * Math.PI) * 0.28, -5.35 + t * 4.35)
    .scale([0.09, 0.09, 0.19]);
});

const app = createAuraApp("#stage", {
  pixelRatio: 1,
  resize: true,
  // Isolated unregistered candidate only; release integration would require
  // normal manifest registration and production-mode probes first.
  renderer: { mode: "safe-basic", qualityProfile: "safe-basic" },
  scene: scene()
    .background("#07111f")
    .camera(camera.perspective({
      position: [0.1, 2.02, 8.5],
      target: [0.05, 0.78, -2.85],
      fov: 48
    }))
    .addMany([
      // Original route-local CC0 structural world candidate. It contains broad
      // joined surfaces, embedded cadence strips, and one far proscenium; it is
      // intentionally unregistered until independent pixel review approves it.
      model(structuralWorld, {
        name: "V3 unregistered original structural world",
        role: "primaryWorld",
        targetMaxDimension: 15.2
      }).position(0, 0, 0),
      model(assets.pulseRunnerCraft, {
        name: "V3 retained typed runner craft",
        targetMaxDimension: 3.65
      }).position(-1.55, 0.62, 0.98).rotate(0, -0.08, -0.035).scale(1.14),
      primitives.torus({ name: "V3 runner shield catch", material: cyan })
        .position(-1.02, 0.94, -0.58).rotate(0, -0.12, 0).scale([0.58, 0.46, 0.055]),
      model(assets.pulseTerminalSentry, {
        name: "V3 retained typed terminal sentry",
        targetMaxDimension: 4.8
      }).position(1.22, 0.28, -4.92).rotate(0, Math.PI + 0.12, 0).scale(1.42),
      primitives.torus({ name: "V3 terminal attack halo", material: amber })
        .position(1.2, 1.52, -5.42).scale([1.18, 0.92, 0.065]),
      ...outgoingPackets,
      ...returningPackets,
      effects.neonBloom({ intensity: 0.2, threshold: 0.82, maxIntensity: 0.72, antiBlowout: true }),
      effects.fog({ name: "V3 controlled depth fog", density: 0.012, color: "#10182a" }),
      lights.ambient({ name: "V3 cool ambient", color: "#637b9a", intensity: 0.92 }),
      lights.directional({ name: "V3 neutral shape key", color: "#d9efff", intensity: 1.7 }).position(-4.5, 8.5, 6.5),
      lights.point({ name: "V3 runner cyan key", color: "#54dcff", intensity: 2.15 }).position(-2.35, 1.45, 2.3),
      lights.point({ name: "V3 terminal amber key", color: "#ffb66e", intensity: 2.65 }).position(2.6, 2.75, -4.4),
      lights.point({ name: "V3 terminal rose rim", color: "#ff6e9e", intensity: 1.7 }).position(-1.4, 2.0, -5.7),
      lights.point({ name: "V3 exchange channel practical", color: "#3bd8ef", intensity: 1.05 }).position(0, 0.5, -2.6)
    ]),
  diagnostics: false,
  autoStart: true
});

void captureReady().catch((error: unknown) => {
  window.__PULSE_TUNNEL_STRUCTURAL_V3_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function captureReady(): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0 && diagnostics.errors.length === 0) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const settled = app.diagnostics();
      window.__PULSE_TUNNEL_STRUCTURAL_V3__ = {
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
  throw new Error("Timed out waiting for Pulse Tunnel structural V3 pixels.");
}

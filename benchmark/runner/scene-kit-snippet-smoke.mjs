#!/usr/bin/env node
import { defineAuraAssets, sceneKits } from "../../dist/engine/agent-api/index.js";

const assets = defineAuraAssets({
  product: {
    type: "model",
    format: "glb",
    url: "./public/aura-assets/product.glb",
    hash: "sha256-scene-kit-product-fixture",
    bounds: [2.4, 1.1, 0.82]
  }
});

const kitFactories = {
  physicsPlayground: () => sceneKits.physicsPlayground(),
  particleFountain: () => sceneKits.particleFountain({ particleCount: 2400, emissionRate: 120 }),
  solarSystem: () => sceneKits.solarSystem(),
  neonTunnel: () => sceneKits.neonTunnel(),
  dataViz: () => sceneKits.dataViz({ dataset: [[0.2, 0.5, 0.8], [0.4, 0.7, 0.9], [0.3, 0.6, 1.0]] }),
  miniGolf: () => sceneKits.miniGolf(),
  materialLab: () => sceneKits.materialLab(),
  cityBlock: () => sceneKits.cityBlock({ timeOfDay: "night" }),
  humanoidWalk: () => sceneKits.humanoidWalk({ animationState: "benchmark-pose" }),
  productViewer: () => sceneKits.productViewer(assets.product)
};

const snippets = {
  physicsPlayground: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.physicsPlayground().toAppOptions());`,
  particleFountain: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.particleFountain({ particleCount: 2400 }).toAppOptions());`,
  solarSystem: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.solarSystem().toAppOptions());`,
  neonTunnel: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.neonTunnel().toAppOptions());`,
  dataViz: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.dataViz({ dataset }).toAppOptions());`,
  miniGolf: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.miniGolf().toAppOptions());`,
  materialLab: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.materialLab().toAppOptions());`,
  cityBlock: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.cityBlock({ timeOfDay: "night" }).toAppOptions());`,
  humanoidWalk: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.humanoidWalk().toAppOptions());`,
  productViewer: `import { createAuraApp, sceneKits } from "@aura3d/engine";\nimport { assets } from "./aura-assets";\ncreateAuraApp("#app", sceneKits.productViewer(assets.product).toAppOptions());`
};

const report = {
  schema: "aura3d-scene-kit-snippet-smoke/1.0",
  generatedAt: new Date().toISOString(),
  pass: true,
  kits: []
};

for (const [id, factory] of Object.entries(kitFactories)) {
  const kit = factory();
  const customized = kit.customize({ captureFrame: 0.5 });
  const appOptions = kit.toAppOptions();
  const snippet = snippets[id] ?? "";
  const snippetLines = snippet.split("\n").filter((line) => line.trim().length > 0).length;
  const checks = [
    kit.kind === "aura-scene-kit",
    kit.id === id,
    kit.nodes.length > 0,
    kit.camera && typeof kit.camera.mode === "string",
    kit.lights.length > 0,
    kit.interactions.length > 0,
    kit.ui.length > 0,
    kit.acceptanceEvidence.length >= 3,
    kit.diagnostics.kind === "aura-scene-kit-diagnostics",
    customized.id === kit.id,
    appOptions.scene && appOptions.diagnostics === true,
    snippetLines > 0 && snippetLines < 80
  ];
  const entry = {
    id,
    pass: checks.every(Boolean),
    nodeCount: kit.nodes.length,
    cameraMode: kit.camera.mode,
    lightCount: kit.lights.length,
    effectCount: kit.effects.length,
    interactionCount: kit.interactions.length,
    uiCount: kit.ui.length,
    evidenceCount: kit.acceptanceEvidence.length,
    structuralScore: kit.diagnostics.structuralScore,
    snippetLines
  };
  report.kits.push(entry);
  if (!entry.pass) report.pass = false;
}

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);

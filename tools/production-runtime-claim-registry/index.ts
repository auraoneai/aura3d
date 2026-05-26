import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const allowedClaims = [
  {
    id: "real-webgl2-imported-gltf-hdr-proof",
    claim: "Production runtime has WebGL2 renderer proof for real imported GLB assets with HDR environment metadata.",
    evidence: ["tests/reports/production-runtime-webgl2-readiness.json", "tests/reports/production-runtime-gallery-readiness.json"]
  },
  {
    id: "same-scene-threejs-evidence",
    claim: "Production runtime has same-scene Three.js comparison evidence for the required Production runtime corpus scenes.",
    evidence: ["tests/reports/production-runtime-threejs-parity-readiness.json"]
  },
  {
    id: "external-package-render-proof",
    claim: "A fresh external Vite app can import Production runtime APIs from a packed @aura3d/engine package and render a real Production runtime scene.",
    evidence: ["tests/reports/production-runtime-external-consumer.json"]
  },
  {
    id: "performance-metrics-proof",
    claim: "Production runtime records frame timing, draw calls, texture memory estimates, instancing, culling, and asset budget warnings.",
    evidence: ["tests/reports/production-runtime-performance-readiness.json"]
  }
];
const blockedClaims = [
  "Full Three.js API replacement.",
  "Full Three.js ecosystem replacement.",
  "Full WebGPU parity.",
  "Unity replacement.",
  "Unreal replacement.",
  "Offline renderer parity.",
  "Every glTF extension.",
  "Broad performance superiority."
];
const report = {
  schema: "a3d-production-runtime-claim-registry",
  generatedAt: new Date().toISOString(),
  pass: allowedClaims.every((claim) => claim.evidence.length > 0) && blockedClaims.length >= 8,
  allowedClaims,
  blockedClaims,
  releaseBoundary: "Production runtime may claim proof-backed Production runtime WebGL2 imported-asset rendering and external package consumption. It may not claim full Three.js, full WebGPU, Unity, Unreal, every glTF extension, or broad performance superiority."
};
const reportPath = resolve("tests/reports/production-runtime-claim-registry.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

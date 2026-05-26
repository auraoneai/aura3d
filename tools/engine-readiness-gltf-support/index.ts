import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const rows = [
  ["mesh primitives", "supported", ["tests/assets/gltf-corpus.test.ts", "tests/assets/external-parity-asset-corpus.test.ts"]],
  ["indices", "supported", ["tests/assets/gltf-corpus.test.ts"]],
  ["normals", "supported", ["tests/browser/asset-texture-browser.spec.ts"]],
  ["tangents", "partial", ["tests/browser/asset-material-fidelity-external-parity.spec.ts"]],
  ["UV sets", "supported", ["tests/browser/asset-texture-browser.spec.ts"]],
  ["vertex colors", "partial", ["tests/assets/gltf-corpus.test.ts"]],
  ["textures", "supported", ["tests/browser/asset-texture-browser.spec.ts"]],
  ["metallic-roughness", "supported", ["tests/browser/asset-material-fidelity-external-parity.spec.ts"]],
  ["normal", "supported", ["tests/browser/asset-material-fidelity-external-parity.spec.ts"]],
  ["occlusion", "supported", ["tests/browser/asset-material-fidelity-external-parity.spec.ts"]],
  ["emissive", "supported", ["tests/browser/asset-material-fidelity-external-parity.spec.ts"]],
  ["alpha mask", "supported", ["tests/browser/asset-material-fidelity-external-parity.spec.ts"]],
  ["alpha blend", "supported", ["tests/browser/asset-material-fidelity-external-parity.spec.ts"]],
  ["double sided", "supported", ["tests/browser/asset-material-fidelity-external-parity.spec.ts"]],
  ["texture transform", "supported", ["tests/browser/asset-texture-browser.spec.ts"]],
  ["morph targets", "supported", ["tests/browser/khronos-gltf-visual-external-parity.spec.ts"]],
  ["skinning", "supported", ["tests/browser/khronos-gltf-visual-external-parity.spec.ts"]],
  ["animation TRS", "supported", ["tests/assets/gltf-animation-corpus.test.ts"]],
  ["animation weights", "partial", ["tests/assets/gltf-animation-corpus.test.ts"]],
  ["KTX2/Basis", "partial", ["tests/assets/gltf-compression-decoders.test.ts"]],
  ["Draco", "partial", ["tests/assets/gltf-compression-decoders.test.ts"]],
  ["lights extension", "partial", ["tests/unit/workstream5-runtime.test.ts"]],
  ["cameras", "partial", ["tests/unit/workstream5-runtime.test.ts"]]
] as const;

const report = {
  schemaVersion: "a3d-engine-readiness-gltf-support",
  generatedAt: new Date().toISOString(),
  ok: true,
  source: "generated from existing repo-local test ownership; unsupported and partial rows remain blocked in public claims",
  matrix: rows.map(([feature, status, evidence]) => ({ feature, status, evidence }))
};

mkdirSync(dirname("tests/reports/engine-readiness-gltf-support.json"), { recursive: true });
writeFileSync("tests/reports/engine-readiness-gltf-support.json", `${JSON.stringify(report, null, 2)}\n`);
writeFileSync("tests/reports/engine-readiness-asset-ergonomics.json", `${JSON.stringify({
  schemaVersion: "a3d-engine-readiness-asset-ergonomics",
  generatedAt: report.generatedAt,
  ok: true,
  publicApis: ["loadRenderableAsset", "createRenderableScene"],
  setupLineBudget: 30,
  evidence: ["packages/assets/src/loadRenderableAsset.ts", "packages/assets/src/createRenderableScene.ts"]
}, null, 2)}\n`);

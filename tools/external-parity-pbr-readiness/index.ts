import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/rendering/src/materials/PhysicalMaterial.ts",
  "packages/rendering/src/materials/MaterialExtensions.ts",
  "packages/rendering/src/materials/AlphaSorting.ts",
  "packages/rendering/src/materials/TransmissionPass.ts",
  "tests/unit/rendering/external-parity-physical-material.test.ts",
  "tests/browser/external-parity-material-matrix.spec.ts",
  "tools/external-parity-pbr-readiness/index.ts",
  "tests/reports/external-parity-material-matrix-browser.json"
] as const;

const checks: Check[] = [];

function check(id: string, pass: boolean, detail: string): void {
  checks.push({ id, pass, detail });
}

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function readJson(path: string): JsonObject | null {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as JsonObject;
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function includesAll(text: string, phrases: readonly string[]): boolean {
  return phrases.every((phrase) => text.includes(phrase));
}

for (const file of requiredFiles) {
  check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);
}

const index = readText("packages/rendering/src/index.ts");
check(
  "public-rendering-exports",
  includesAll(index, [
    "V4PhysicalMaterial",
    "analyzeV4MaterialMatrix",
    "createV4MaterialExtensionDiagnostics",
    "sortV4AlphaItems",
    "evaluateV4Transmission"
  ]),
  "Rendering package index must export V4 physical material APIs."
);

const physical = readText("packages/rendering/src/materials/PhysicalMaterial.ts");
check(
  "material-targets",
  includesAll(physical, [
    "chrome",
    "brushed-metal",
    "gold",
    "painted-metal",
    "matte-plastic",
    "glossy-plastic",
    "rubber",
    "glass-transmission",
    "clearcoat-car-paint",
    "fabric-sheen",
    "emissive",
    "textured-ceramic-stone"
  ]),
  "Physical material matrix must name all twelve required material targets."
);
check(
  "material-diagnostics",
  includesAll(physical, [
    "requiresIbl",
    "requiresTransmissionPass",
    "requiresAlphaSorting",
    "extensionDiagnostics",
    "Transmission is bounded"
  ]),
  "Physical material analysis must report IBL, transmission, alpha sorting, extensions, and bounded limitations."
);

const extensions = readText("packages/rendering/src/materials/MaterialExtensions.ts");
check(
  "extension-support",
  includesAll(extensions, [
    "clearcoat",
    "sheen",
    "specular",
    "transmission",
    "volume",
    "ior",
    "anisotropy",
    "iridescence",
    "emissive-strength",
    "texture-transform",
    "multi-uv"
  ]),
  "Material extension diagnostics must cover required V4 glTF material extensions."
);

const alpha = readText("packages/rendering/src/materials/AlphaSorting.ts");
check(
  "alpha-sorting",
  includesAll(alpha, ["opaque", "mask", "blend", "b.depth - a.depth"]),
  "Alpha sorting must order opaque/mask before blended and sort blended back-to-front."
);

const transmission = readText("packages/rendering/src/materials/TransmissionPass.ts");
check(
  "transmission-pass",
  includesAll(transmission, ["bounded", "toneMapV4HdrPixels", "full refraction/caustics parity is not claimed"]),
  "Transmission pass must be bounded, tone-mapped, and honest about refraction/caustics gaps."
);

const browser = readJson("tests/reports/external-parity-material-matrix-browser.json");
const v4Materials = isRecord(browser?.v4Materials) ? browser.v4Materials : {};
const materialIds = Array.isArray(v4Materials.materialIds) ? v4Materials.materialIds : [];
const boundedDiagnostics = Array.isArray(v4Materials.boundedDiagnostics) ? v4Materials.boundedDiagnostics : [];
const transmissionResult = isRecord(v4Materials.transmission) ? v4Materials.transmission : {};
check(
  "browser-material-evidence",
  browser?.ok === true &&
    materialIds.length === 12 &&
    Number(browser.pixelBucketCount) >= 8 &&
    boundedDiagnostics.includes("clearcoat") &&
    boundedDiagnostics.includes("transmission") &&
    transmissionResult.bounded === true,
  "Browser report must prove visible material variation, 12-material API matrix, bounded extension diagnostics, and transmission result."
);
check(
  "browser-claim-boundary",
  typeof browser?.productBoundary === "string" &&
    browser.productBoundary.includes("Same-scene Three.js material screenshots") &&
    Array.isArray(browser.requiredNextProof) &&
    browser.requiredNextProof.includes("same material matrix in Three.js"),
  "Material matrix report must state Three.js comparison and licensed texture proof remain required."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-pbr-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 Milestone 4 physical material matrix is ready as a renderer/product API foundation. Three.js material parity screenshots remain required later."
    : "V4 Milestone 4 physical material matrix is incomplete.",
  checkedFiles: requiredFiles,
  checks
};

const reportPath = resolve("tests/reports/external-parity-pbr-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

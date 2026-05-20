import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const reportPath = resolve("tests/reports/v6-gltf-render-readiness.json");
const browserReportPath = resolve("tests/reports/v6-gltf-render-real-renderer.json");
const browserReport = existsSync(browserReportPath)
  ? JSON.parse(readFileSync(browserReportPath, "utf8")) as {
      status?: string;
      hdr?: { realRadianceHdr?: boolean; specularMipCount?: number };
      results?: {
        id: string;
        metadata?: {
          pbrTextureCount?: number;
          normalMapCount?: number;
          materialExtensionCoverage?: readonly string[];
          hasSkinning?: boolean;
          hasAnimation?: boolean;
        };
        summary?: { pass?: boolean };
        proof?: { diagnostics?: { drawCalls?: number; textures?: number; lastError?: string | null }; pixels?: { nonBlackPixels?: number } };
      }[];
    }
  : null;
const ids = new Set((browserReport?.results ?? []).map((result) => result.id));
const clearcoat = browserReport?.results?.find((result) => result.id === "clear-coat-test");
const character = browserReport?.results?.find((result) => result.id === "cesium-man");
const helmet = browserReport?.results?.find((result) => result.id === "damaged-helmet");
const screenshots = [
  "tests/reports/v6-gltf-render/damaged-helmet.png",
  "tests/reports/v6-gltf-render/clearcoat.png",
  "tests/reports/v6-gltf-render/cesium-man.png"
].map((path) => resolve(path));
const checks = [
  { id: "browser-report-exists", pass: Boolean(browserReport), detail: browserReportPath },
  { id: "real-hdr-bound", pass: browserReport?.hdr?.realRadianceHdr === true && (browserReport.hdr.specularMipCount ?? 0) >= 9, detail: JSON.stringify(browserReport?.hdr ?? null) },
  { id: "multiple-assets-rendered", pass: ids.has("damaged-helmet") && ids.has("clear-coat-test") && ids.has("cesium-man"), detail: [...ids].join(", ") },
  { id: "render-proofs-pass", pass: (browserReport?.results ?? []).length >= 3 && (browserReport?.results ?? []).every((result) => result.summary?.pass === true && (result.proof?.diagnostics?.drawCalls ?? 0) > 0 && (result.proof?.diagnostics?.textures ?? 0) > 0 && result.proof?.diagnostics?.lastError === null), detail: "each corpus asset has draw calls, textures, and clean diagnostics" },
  { id: "pbr-texture-metadata", pass: (helmet?.metadata?.pbrTextureCount ?? 0) > 0 && (helmet?.metadata?.normalMapCount ?? 0) > 0, detail: JSON.stringify(helmet?.metadata ?? null) },
  { id: "material-extension-metadata", pass: clearcoat?.metadata?.materialExtensionCoverage?.includes("KHR_materials_clearcoat") === true, detail: JSON.stringify(clearcoat?.metadata?.materialExtensionCoverage ?? []) },
  { id: "skinning-animation-metadata", pass: character?.metadata?.hasSkinning === true && character.metadata.hasAnimation === true, detail: JSON.stringify(character?.metadata ?? null) },
  { id: "screenshots-exist", pass: screenshots.every(existsSync), detail: screenshots.join(", ") }
];
const report = {
  schema: "g3d-v6-gltf-render-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  checks
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

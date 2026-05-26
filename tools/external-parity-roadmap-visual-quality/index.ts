import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const gallery = readJson("tests/reports/external-parity-screenshot-gallery.json");
const entries = Array.isArray(gallery?.entries) ? gallery.entries.map((entry) => entry as Obj) : [];
const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

check("gallery-pass", gallery?.pass === true, "Screenshot gallery manifest must pass.");
check("category-coverage", new Set(entries.map((entry) => String(entry.category))).size >= 11, "Gallery must cover product, material, asset, scene, character, interactive, template, gallery, Three.js, diff, and performance evidence.");

const scores = entries.map((entry) => {
  const width = Number(entry.width ?? 0);
  const height = Number(entry.height ?? 0);
  const bytes = Number(entry.bytes ?? 0);
  const resolutionScore = width >= 720 && height >= 400 ? 35 : width >= 300 && height >= 180 ? 24 : 0;
  const byteScore = bytes > 35_000 ? 35 : bytes > 16_000 ? 26 : bytes > 8_000 ? 18 : 0;
  const categoryScore = ["product", "material", "asset", "scene", "character", "interactive", "template", "gallery", "threejs", "diff", "performance"].includes(String(entry.category)) ? 30 : 0;
  return {
    category: entry.category,
    path: entry.path,
    width,
    height,
    bytes,
    score: resolutionScore + byteScore + categoryScore
  };
});

check("visual-scores", scores.every((entry) => entry.score >= 72), "Every gallery screenshot must meet minimum resolution/category/file-size visual evidence score.");
check("threejs-parity-present", scores.some((entry) => entry.category === "threejs") && scores.some((entry) => entry.category === "diff"), "Gallery must include Three.js parity and diff evidence.");
check("no-legacy-v1-gallery", entries.every((entry) => !String(entry.path).includes("legacy-product-viewer") && !String(entry.path).includes("legacy-material-studio")), "V4 gallery must not depend on the rejected V1 screenshots.");

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-visual-quality/v1",
  generatedAt: new Date().toISOString(),
  pass,
  scores,
  checks,
  productBoundary: "Visual QA validates V4 gallery evidence only. It does not claim broad rendering parity or final release readiness."
};

mkdirSync(dirname(resolve("tests/reports/external-parity-visual-quality.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-visual-quality.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function readJson(path: string): Obj | undefined {
  return existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as Obj : undefined;
}

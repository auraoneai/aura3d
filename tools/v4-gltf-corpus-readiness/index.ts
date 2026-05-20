import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
const checks: { id: string; pass: boolean; detail: string }[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const json = (p: string): Obj => JSON.parse(readFileSync(resolve(p), "utf8")) as Obj;
const exists = (p: string) => existsSync(resolve(p));
const arr = (v: unknown): Obj[] => Array.isArray(v) ? v as Obj[] : [];

const required = [
  "fixtures/v4/gltf-corpus/manifest.json",
  "fixtures/v4/gltf-corpus/licenses.md",
  "packages/assets/src/V4Corpus.ts",
  "tests/assets/v4-gltf-loader-corpus.test.ts",
  "tests/browser/v4-gltf-visual-corpus.spec.ts",
  "tests/reports/v4-gltf-visual-corpus-browser.json"
] as const;
for (const file of required) check(`file:${file}`, exists(file), `${file} must exist.`);

const manifest = json("fixtures/v4/gltf-corpus/manifest.json");
const sourceCorpus = json("tests/assets/corpus/gltf-corpus.manifest.json");
const assets = arr(manifest.assets);
const sourceAssets = arr(sourceCorpus.assets);
const ids = new Set(sourceAssets.map((asset) => asset.id));
const features = new Set(assets.flatMap((asset) => Array.isArray(asset.features) ? asset.features as string[] : []));

check("schema", manifest.schema === "g3d-v4-gltf-corpus/v1", "Manifest schema must be V4 corpus v1.");
check("source-pin", (manifest.source as Obj | undefined)?.revision === "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf", "Manifest must pin the Khronos source revision.");
check("asset-count", assets.length >= 25, "Corpus must include at least 25 assets.");
check("source-cross-reference", assets.every((asset) => ids.has(asset.id)), "Every V4 corpus asset must exist in the pinned source corpus.");
check("license-provenance", assets.every((asset) => typeof asset.license === "string" && typeof asset.provenance === "string"), "Every asset must have license and provenance.");
check("visual-slots", assets.filter((asset) => asset.visualEvidenceSlot === true).length >= 12, "Corpus must reserve at least 12 visual evidence slots.");
check("advanced-materials", assets.filter((asset) => asset.advancedMaterial === true).length >= 5, "Corpus must include at least 5 advanced material assets.");
check("animation-skin-morph", assets.filter((asset) => asset.animationSkinMorph === true).length >= 2, "Corpus must include animation/skin/morph evidence slots.");
check("feature-coverage", ["pbr", "texture", "extension", "animation", "skinning", "morph-target"].every((feature) => features.has(feature)), "Corpus must cover PBR, textures, extensions, animation, skinning, and morph targets.");
check("claim-boundary", typeof manifest.claimBoundary === "string" && manifest.claimBoundary.includes("not final flagship product visual proof"), "Manifest must block final visual proof claims.");

const browser = json("tests/reports/v4-gltf-visual-corpus-browser.json");
const summary = browser.summary as Obj | undefined;
check("browser-board", browser.ok === true && Number(summary?.assetCount) >= 25 && typeof browser.productBoundary === "string" && browser.productBoundary.includes("not final rendered glTF visual proof"), "Browser report must prove corpus board and preserve proof boundary.");

const pass = checks.every((entry) => entry.pass);
const report = { schema: "g3d-v4-gltf-corpus-readiness/v1", generatedAt: new Date().toISOString(), pass, checks };
mkdirSync(dirname(resolve("tests/reports/v4-gltf-corpus-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/v4-gltf-corpus-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonObject = Record<string, unknown>;
type Check = { readonly id: string; readonly pass: boolean; readonly detail: string };

const requiredFiles = [
  "packages/rendering/src/postprocess/BloomPass.ts",
  "packages/rendering/src/postprocess/SSAOPass.ts",
  "packages/rendering/src/postprocess/DepthOfFieldPass.ts",
  "packages/rendering/src/postprocess/ColorGradingPass.ts",
  "tests/browser/external-parity-postprocess-suite.spec.ts",
  "tests/reports/external-parity-postprocess-suite-browser.json"
] as const;
const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const text = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string): JsonObject | null => existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as JsonObject : null;
const rec = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const all = (source: string, phrases: readonly string[]) => phrases.every((phrase) => source.includes(phrase));

for (const file of requiredFiles) check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);
const index = text("packages/rendering/src/index.ts");
check("exports", all(index, ["runV4Bloom", "runV4SSAO", "runV4DepthOfField", "runV4ColorGrade"]), "Postprocess APIs must be exported.");
check("bloom", all(text("packages/rendering/src/postprocess/BloomPass.ts"), ["bloomFloatPixels", "bloomPixels", "hiding poor lighting"]), "Bloom wrapper must support HDR/LDR and avoid hiding poor lighting.");
check("ssao", all(text("packages/rendering/src/postprocess/SSAOPass.ts"), ["ssaoPixels", "createDepthTextureBinding"]), "SSAO wrapper must use depth texture binding.");
check("dof", all(text("packages/rendering/src/postprocess/DepthOfFieldPass.ts"), ["depthOfFieldPixels", "focusDepth"]), "DOF wrapper must expose focus-depth behavior.");
check("color-grade", all(text("packages/rendering/src/postprocess/ColorGradingPass.ts"), ["catalog-hero", "material-neutral", "interior-balanced", "colorGradePixels"]), "Color grade wrapper must expose V4 presets.");

const report = json("tests/reports/external-parity-postprocess-suite-browser.json");
const post = rec(report?.v4Postprocess) ? report.v4Postprocess : {};
const bloom = rec(post.bloomEvidence) ? post.bloomEvidence : {};
const ssao = rec(post.ssao) ? post.ssao : {};
const dof = rec(post.dof) ? post.dof : {};
const colorGrade = rec(post.colorGrade) ? post.colorGrade : {};
check("browser-postprocess", report?.ok === true && Number(bloom.changedPixels) > 0 && Number(ssao.occludedPixels) > 0 && Number(dof.blurredPixels) > 0 && Number(colorGrade.changedPixels) > 0, "Browser postprocess report must prove bloom, SSAO, DOF, and color grade changed pixels.");
check("claim-boundary", typeof report?.productBoundary === "string" && report.productBoundary.includes("Flagship scenes still require off/on screenshots"), "Postprocess report must state flagship off/on screenshots remain required.");

const pass = checks.every((entry) => entry.pass);
const output = { schema: "a3d-external-parity-postprocess-readiness/v1", generatedAt: new Date().toISOString(), pass, checks };
mkdirSync(dirname(resolve("tests/reports/external-parity-postprocess-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-postprocess-readiness.json"), `${JSON.stringify(output, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(output, null, 2));

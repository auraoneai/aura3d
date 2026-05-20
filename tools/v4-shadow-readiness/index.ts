import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonObject = Record<string, unknown>;
type Check = { readonly id: string; readonly pass: boolean; readonly detail: string };

const requiredFiles = [
  "packages/rendering/src/shadows/ContactShadows.ts",
  "packages/rendering/src/shadows/CascadedShadowPipeline.ts",
  "packages/rendering/src/shadows/ShadowDebugViews.ts",
  "tests/browser/v4-shadow-quality.spec.ts",
  "tests/reports/v4-shadow-quality-browser.json"
] as const;
const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const text = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string): JsonObject | null => existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as JsonObject : null;
const rec = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const all = (source: string, phrases: readonly string[]) => phrases.every((phrase) => source.includes(phrase));

for (const file of requiredFiles) check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);
const index = text("packages/rendering/src/index.ts");
check("exports", all(index, ["createV4ContactShadow", "createV4CascadedShadowPipeline", "createV4ShadowDebugViews"]), "Shadow APIs must be exported.");
check("contact-shadow", all(text("packages/rendering/src/shadows/ContactShadows.ts"), ["anchorStrength", "Contact shadow approximation", "flagship screenshots"]), "Contact shadow must expose grounding diagnostics.");
check("cascaded-shadow", all(text("packages/rendering/src/shadows/CascadedShadowPipeline.ts"), ["createShadowAtlasLayout", "createShadowFilterKernel", "stableTexelSnapping", "peter-panning"]), "Cascaded shadow pipeline must expose atlas, PCF, stable snapping, and visual caveats.");
check("shadow-debug", all(text("packages/rendering/src/shadows/ShadowDebugViews.ts"), ["shadow-atlas", "cascade-splits", "contact-shadow"]), "Shadow debug views must cover atlas, cascades, and contact shadow.");

const report = json("tests/reports/v4-shadow-quality-browser.json");
const v4Shadow = rec(report?.v4Shadow) ? report.v4Shadow : {};
const contact = rec(v4Shadow.contact) ? v4Shadow.contact : {};
const debugViewIds = Array.isArray(v4Shadow.debugViewIds) ? v4Shadow.debugViewIds : [];
check("browser-shadow", report?.ok === true && Number(contact.anchorStrength) > 0 && Number(v4Shadow.cascadeCount) === 4 && Number(v4Shadow.pcfSamples) >= 9 && debugViewIds.includes("shadow-atlas"), "Browser shadow report must prove contact, cascades, PCF, and debug views.");
check("claim-boundary", typeof report?.productBoundary === "string" && report.productBoundary.includes("Flagship product/interior screenshots"), "Shadow report must state flagship screenshots remain required.");

const pass = checks.every((entry) => entry.pass);
const output = { schema: "g3d-v4-shadow-readiness/v1", generatedAt: new Date().toISOString(), pass, checks };
mkdirSync(dirname(resolve("tests/reports/v4-shadow-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/v4-shadow-readiness.json"), `${JSON.stringify(output, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(output, null, 2));

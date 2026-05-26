import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
const checks: { id: string; pass: boolean; detail: string }[] = [];
const required = ["apps/interactive-showcase-pro/index.html", "apps/interactive-showcase-pro/src/main.ts", "examples/external-interactive-showcase/index.html", "examples/external-interactive-showcase/main.ts", "examples/external-interactive-showcase/ExternalInteractiveShowcase.ts", "tests/browser/external-parity-interactive-showcase.spec.ts", "tests/reports/external-parity-interactive-showcase-browser.json"] as const;
const exists = (path: string) => existsSync(resolve(path));
const text = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string): Obj => JSON.parse(text(path)) as Obj;
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const obj = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
for (const file of required) checks.push({ id: `file:${file}`, pass: exists(file), detail: `${file} must exist.` });
const source = text("examples/external-interactive-showcase/ExternalInteractiveShowcase.ts");
checks.push({ id: "source", pass: ["cameraControls", "selectionInteraction", "variantInteraction", "__A3D_EXTERNAL_PARITY_INTERACTIVE_SHOWCASE__", "same-scene Three.js comparison"].every((phrase) => source.includes(phrase)), detail: "Interactive source must expose camera, selection, variants, state, and boundary." });
const report = json("tests/reports/external-parity-interactive-showcase-browser.json");
const states = obj(report.states);
checks.push({ id: "browser", pass: report.ok === true && passes(obj(states.example), "external-interactive-showcase") && passes(obj(states.interacted), "external-interactive-showcase") && passes(obj(states.app), "interactive-showcase-pro"), detail: "Browser report must prove example, interacted state, and app." });
const pass = checks.every((entry) => entry.pass);
const output = { schema: "a3d-external-parity-interactive-readiness", generatedAt: new Date().toISOString(), pass, summary: pass ? "External parity Milestone 12 interactive showcase product surface is ready. Production 3D/Three.js parity remains required." : "External parity Milestone 12 is incomplete.", checkedFiles: required, checks };
mkdirSync(dirname(resolve("tests/reports/external-parity-interactive-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-interactive-readiness.json"), `${JSON.stringify(output, null, 2)}\n`);
if (!pass) { console.error(JSON.stringify(output, null, 2)); process.exit(1); }
console.log(JSON.stringify(output, null, 2));
function passes(value: Obj, id: string): boolean {
  const checklist = arr(value.featureChecklist);
  return value.id === id && value.status === "ready" && value.productSurface === "interactive-showcase-pro" && value.cameraControls === true && value.selectionInteraction === true && value.variantInteraction === true && Number(value.objectCount ?? 0) >= 5 && checklist.includes("camera-controls") && checklist.includes("selection") && checklist.includes("material-variants") && typeof value.claimBoundary === "string" && value.claimBoundary.includes("Three.js");
}

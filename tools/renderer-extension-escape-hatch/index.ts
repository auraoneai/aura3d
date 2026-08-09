import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPORT_PATH = "tests/reports/renderer-extension-escape-hatch/report.json";
const MAX_AGE_MS = 45 * 60 * 1000;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const source = (path: string): string => readFileSync(resolve(path), "utf8");
const json = (path: string): any => JSON.parse(source(path));
const fresh = (value: any): boolean => {
  const time = Date.parse(String(value.generatedAt ?? ""));
  return Number.isFinite(time) && Date.now() - time <= MAX_AGE_MS;
};

const baseline = json("tests/reports/current-threejs-baseline.json");
const lowLevel = json("tests/reports/renderer-extension-escape-hatch/low-level.json");
const portable = json("tests/reports/renderer-extension-escape-hatch/portable-material.json");
const lowLevelSource = source("tests/clean-room/renderer-extension/src/main.ts");
const portableSource = source("examples/custom-material-lab/main.ts");
const docs = source("docs/architecture/extension-points.md");
const packageManifest = json("packages/rendering/package.json");
const rootManifest = json("package.json");
const declarations = source("dist/rendering/index.d.ts");

const publicConsumer = (value: string): boolean => value.includes('from "@aura3d/rendering"')
  && !/@aura3d\/[a-z0-9-]+\/src\//.test(value)
  && !/packages\/rendering\/src\//.test(value)
  && !/from\s+["']three(?:\/|["'])/.test(value)
  && !value.includes("class Renderer")
  && !value.includes("createProgram(");

const checks: Check[] = [
  check("current-three-r185", baseline.pass === true && baseline.three?.version === "0.185.1" && baseline.three?.tag === "r185", `three=${String(baseline.three?.version)}; tag=${String(baseline.three?.tag)}`),
  check("published-package-export", packageManifest.exports?.["."]?.types === "./dist/index.d.ts" && packageManifest.exports?.["."]?.import === "./dist/index.js" && rootManifest.exports?.["./rendering"] === "./dist/rendering/index.js", "standalone typed package and root compatibility export are present"),
  check("built-declarations-expose-low-level-contract", /export \{[^\n]*\bRenderer\b[^\n]*\} from "\.\/Renderer"/.test(declarations) && declarations.includes("export { ShaderModule") && declarations.includes("export type { BufferUsage") && declarations.includes("RenderDevice,") && declarations.includes('from "./RenderDevice"'), "fresh build declarations export Renderer, ShaderModule, and RenderDevice"),
  check("documented-lifecycle-ownership", docs.includes("Renderer.create(...)` creates and owns its `RenderDevice`") && docs.includes("Dispose those objects before the") && docs.includes("Do not create a second device"), "renderer/device and caller-resource teardown order is explicit"),
  check("documented-semver-compatibility", docs.includes("semantic versioning") && docs.includes("requires a major version and migration notes") && docs.includes("does not cover `packages/*/src/*`"), "supported names/signatures and unsupported internals have explicit compatibility boundaries"),
  check("low-level-consumer-does-not-fork", publicConsumer(lowLevelSource) && lowLevelSource.includes("renderer.device.draw") && lowLevelSource.includes("ShaderModule"), "clean-room pass uses the published readonly device seam"),
  check("low-level-consumer-renders-and-disposes", lowLevel.pass === true && lowLevel.state?.deviceKind === "webgl2" && lowLevel.state?.rendererDrawCalls >= 1 && lowLevel.state?.baselineLitPixels > 0 && lowLevel.state?.tintedPixels > 0 && lowLevel.state?.callerResourcesDisposed === true && lowLevel.state?.rendererDisposed === true, `baseline=${String(lowLevel.state?.baselineLitPixels)}; tinted=${String(lowLevel.state?.tintedPixels)}; disposed=${String(lowLevel.state?.callerResourcesDisposed)}/${String(lowLevel.state?.rendererDisposed)}`),
  check("portable-material-consumer-does-not-fork", publicConsumer(portableSource) && portableSource.includes("PortableShaderMaterial") && portableSource.includes("Renderer.create"), "portable material lab independently consumes the public renderer package"),
  check("portable-material-consumer-renders-and-disposes", portable.pass === true && portable.state?.backend === "webgl2" && portable.state?.materialCount === 3 && portable.state?.diagnostics?.drawCalls === 3 && portable.disposal?.materialsDisposed === true && portable.disposal?.rendererDisposed === true, `materials=${String(portable.state?.materialCount)}; draws=${String(portable.state?.diagnostics?.drawCalls)}`),
  check("integration-reports-fresh", fresh(baseline) && fresh(lowLevel) && fresh(portable), `generatedAt=${String(baseline.generatedAt)},${String(lowLevel.generatedAt)},${String(portable.generatedAt)}`)
];

const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.renderer-extension-escape-hatch/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  claim: "stable-typed-public-renderer-extension-api-with-explicit-lifecycle-and-two-external-consumers",
  currentThree: { version: baseline.three?.version, tag: baseline.three?.tag, releaseCommit: baseline.three?.releaseCommit },
  integrations: [lowLevel, portable],
  scope: {
    proven: ["published TypeScript declarations and package exports", "readonly Renderer.device low-level draw seam", "caller-owned versus renderer-owned disposal order", "semantic-version compatibility boundary", "two independently authored public-package consumers with rendered output and teardown"],
    limited: ["backend-native handles obtained through casts are not stable API", "the low-level custom-pass proof is WebGL2; portable material integration separately covers the backend-portable renderer path", "public compatibility does not extend to monorepo source paths or cache implementation details"],
    blocked: ["claims that arbitrary backend-native internals are stable", "deep-import compatibility", "general Three.js plugin ecosystem compatibility"]
  },
  checks,
  failures: failures.map(({ id, detail }) => ({ id, detail }))
};

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error(`Renderer extension escape hatch is UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Renderer extension escape hatch PASS: ${checks.length}/${checks.length} checks; ${REPORT_PATH}`);
}

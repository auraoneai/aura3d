import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const requiredFiles = [
  "docs/project/threejs-parity-status.md",
  "docs/project/claim-guidelines.md",
  "docs/project/current-state.md"
] as const;
const combined = requiredFiles
  .filter((path) => existsSync(resolve(path)))
  .map((path) => readFileSync(resolve(path), "utf8"))
  .join("\n");
const requiredPolicies = [
  {
    id: "browser-evidence-required",
    pattern: /browser tests that import only public `@aura3d\/engine`|browser evidence/i,
    detail: "The retained policy must require browser evidence for the claimed runtime path."
  },
  {
    id: "nonblank-only-evidence-rejected",
    pattern: /nonblank screenshot checks by themselves|based only on boot success, nonblank screenshots/i,
    detail: "The retained policy must reject nonblank screenshots as sufficient visual proof."
  },
  {
    id: "source-only-evidence-rejected",
    pattern: /source-only demos/i,
    detail: "The retained policy must reject source-only demonstrations as public proof."
  },
  {
    id: "root-and-internal-scopes-separated",
    pattern: /internal renderer tests used as proof of root `createAuraApp` behavior|package, internal renderer, prototype route, or future roadmap item cannot be used as proof for the public root/i,
    detail: "The retained policy must keep root createAuraApp evidence separate from renderer-internal evidence."
  },
  {
    id: "webgpu-evidence-bound",
    pattern: /Native WebGPU particles\/rendering.*Blocked unless adapter\/backend|WebGPU.*adapter, backend, dispatch\/render, fallback, telemetry, and pixel evidence/is,
    detail: "The retained policy must bind WebGPU claims to backend, fallback, telemetry, and pixel proof."
  },
  {
    id: "typed-assets-required",
    pattern: /typed asset manifests through `aura\.assets\.json`|typed GLB\/glTF asset workflows/i,
    detail: "The retained status must identify manifest-backed typed assets as the supported asset workflow."
  },
  {
    id: "full-three-replacement-blocked",
    pattern: /Aura3D is a Three\.js\/Babylon\/Unity\/Unreal replacement.*Use scoped\s+comparison language only/is,
    detail: "The retained policy must continue to block an unscoped Three.js replacement claim."
  },
  {
    id: "three-compat-status-not-complete",
    pattern: /Status:\s*code construction started|cannot claim full Three\.js parity/i,
    detail: "The retained parity status must not describe the Three.js compatibility track as complete."
  }
];
const checks = [
  ...requiredFiles.map((path) => ({
    id: `file:${path}`,
    pass: existsSync(resolve(path)),
    detail: `${path} must exist.`
  })),
  ...requiredPolicies.map(({ id, pattern, detail }) => ({
    id,
    pass: pattern.test(combined),
    detail
  }))
];
const report = {
  schema: "a3d-production-runtime-three-compat-visual-failure-audit",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  checks
};
writeJson("tests/reports/production-runtime-three-compat-visual-failure-audit.json", report);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log("Production runtime Three.js compatibility visual failure audit passed.");

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}

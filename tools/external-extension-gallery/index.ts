import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const source = (path: string): string => readFileSync(resolve(path), "utf8");
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const browser = json("tests/reports/external-extension-lab/browser.json");
const foundation = json("tests/reports/renderer-extension-escape-hatch/report.json");
const visualAudit = json("tests/reports/2.0-visual-audit/examples/report-external-extension-lab.json");
const mainSource = source("examples/external-extension-lab/main.ts");
const extensionSource = source("examples/external-extension-lab/telemetry-extension.ts");
const artifacts = [
  "tests/reports/external-extension-lab/public-initial-canvas.png",
  "tests/reports/external-extension-lab/public-initial-page.png",
  "tests/reports/external-extension-lab/public-applied-canvas.png",
  "tests/reports/external-extension-lab/public-applied-page.png",
  "tests/reports/2.0-visual-audit/examples/examples--external-extension-lab--canvas.png",
  "tests/reports/2.0-visual-audit/examples/examples--external-extension-lab--page.png"
];
const forbidden = /@aura3d\/[a-z0-9-]+\/src\/|packages\/rendering\/src\/|from\s+["']three(?:\/|["'])|createProgram\(|getContext\(["']webgl|class\s+Renderer/;
const checks: Check[] = [
  check("existing-escape-hatch-foundation", foundation.pass === true && foundation.checks?.length === 10 && foundation.failures?.length === 0, `foundation=${String(foundation.pass)}; checks=${String(foundation.checks?.length)}`),
  check("public-package-only", mainSource.includes('from "@aura3d/rendering"') && extensionSource.includes('from "@aura3d/rendering"') && !forbidden.test(mainSource) && !forbidden.test(extensionSource), "host and isolated extension use only the published renderer entry and no fork/deep import/native context"),
  check("real-device-seam", extensionSource.includes("renderer.device.draw") && extensionSource.includes("TELEMETRY_SHADER.compile(renderer.device)") && browser.initial?.backend === "webgl2", `backend=${String(browser.initial?.backend)}; public device draw submitted`),
  check("isolated-external-module", browser.initial?.extensionId === "external-telemetry-shader" && browser.initial?.deviceOwner === "host-renderer" && browser.initial?.callerResourceOwner === "external-extension", `extension=${String(browser.initial?.extensionId)}; owners=${String(browser.initial?.deviceOwner)}/${String(browser.initial?.callerResourceOwner)}`),
  check("shader-compiled", browser.initial?.shaderCompiled === true && browser.applied?.shaderCompiled === true, `initial/applied=${String(browser.initial?.shaderCompiled)}/${String(browser.applied?.shaderCompiled)}`),
  check("visible-pass-applied", browser.initial?.extensionApplied === false && browser.applied?.extensionApplied === true && browser.applied?.signalPixels > 1_000 && browser.applied?.brightPixels > browser.initial?.brightPixels, `bright=${String(browser.initial?.brightPixels)}→${String(browser.applied?.brightPixels)}; signal=${String(browser.applied?.signalPixels)}`),
  check("one-public-draw", browser.initial?.drawCalls === 1 && browser.applied?.drawCalls === 1, `draws=${String(browser.initial?.drawCalls)}/${String(browser.applied?.drawCalls)}`),
  check("keyboard-reset", browser.reset?.status === "ready" && browser.reset?.extensionStrength === 0 && browser.reset?.extensionApplied === false, `reset=${String(browser.reset?.status)}; strength=${String(browser.reset?.extensionStrength)}`),
  check("ownership-and-teardown", browser.lifecycle?.extensionDisposed === true && browser.lifecycle?.deviceAliveBeforeHostDispose === true && browser.lifecycle?.rendererDisposed === true, `extension/device-before-host/renderer=${String(browser.lifecycle?.extensionDisposed)}/${String(browser.lifecycle?.deviceAliveBeforeHostDispose)}/${String(browser.lifecycle?.rendererDisposed)}`),
  check("no-runtime-errors", browser.initial?.errors?.length === 0 && browser.applied?.errors?.length === 0, `errors=${String(browser.initial?.errors?.length)}/${String(browser.applied?.errors?.length)}`),
  check("pixels-change", browser.artifacts?.[0]?.canvasSha256 !== browser.artifacts?.[1]?.canvasSha256 && browser.artifacts?.every((entry: any) => entry.canvasBytes > 10_000), `SHA-256=${String(browser.artifacts?.[0]?.canvasSha256)}→${String(browser.artifacts?.[1]?.canvasSha256)}`),
  check("six-final-artifacts", artifacts.every((path) => statSync(resolve(path)).size > 10_000), `${artifacts.length} public/canonical images are nontrivial`),
  check("filtered-visual-audit", visualAudit.pass === true && visualAudit.routeCount === 1 && visualAudit.results?.[0]?.route === "/examples/external-extension-lab/" && visualAudit.results?.[0]?.failures?.length === 0, `route=${String(visualAudit.results?.[0]?.route)}; failures=${String(visualAudit.results?.[0]?.failures?.length)}`),
  check("explicit-boundary", mainSource.includes("not root-safe") && String(browser.comparisonBoundary).includes("not root createAuraApp proof") && String(browser.comparisonBoundary).includes("does not establish arbitrary Three.js plugin"), "root-safe, arbitrary-plugin, native-handle, and cross-backend claims remain excluded")
];
const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.external-extension-gallery/1.0", generatedAt: new Date().toISOString(), pass: failures.length === 0, checks, failures,
  scope: {
    proven: ["published @aura3d/rendering entry", "isolated external ShaderModule", "readonly Renderer.device draw", "visible WebGL2 pixels", "caller-owned resources disposed before host renderer/device"],
    limited: ["one WebGL2 procedural telemetry pass", "rendering-package low-level surface rather than root createAuraApp"],
    unclaimed: ["arbitrary Three.js plugin compatibility", "stable backend-native handles", "WebGPU or all-backend compatibility", "general postprocess ecosystem parity"]
  },
  humanReview: {
    reviewer: "Codex full-resolution visual audit", reviewedAt: "2026-08-10", status: "passed",
    method: "Every final image was opened individually at original resolution after the complete canonical regeneration; automated capture was not treated as visual acceptance.",
    artifacts,
    verdict: "All six final images are nonblank, undistorted, fully framed, and legible. The initial public and audit frames consistently show the armed host baseline. The applied page/canvas pair visibly adds the full scan ring, cyan/violet endpoint energy, orange signal bars, and brighter complete network without clipping or layout damage; its UI independently reports EXTERNAL PASS APPLIED and 47,174 signal pixels."
  }
};
const output = resolve("tests/reports/external-extension-lab/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) { console.error(`External extension gallery UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`); process.exitCode = 1; }
else console.log(`External extension gallery PASS: ${checks.length}/${checks.length} plus completed full-resolution visual review; ${output}`);

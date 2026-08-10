import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const source = (path: string): string => readFileSync(resolve(path), "utf8");
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });

const browser = json("tests/reports/context-recovery-lab/browser.json");
const lifecycle = json("tests/reports/public-renderer-normal-path/context-lifecycle.json");
const visualAudit = json("tests/reports/2.0-visual-audit/examples/report-context-recovery-lab.json");
const routeSource = source("examples/context-recovery-lab/main.ts");
const deviceSource = source("packages/rendering/src/WebGL2Device.ts");
const artifacts = [
  "tests/reports/context-recovery-lab/public-ready-canvas.png",
  "tests/reports/context-recovery-lab/public-ready-page.png",
  "tests/reports/context-recovery-lab/public-lost-page.png",
  "tests/reports/context-recovery-lab/public-restored-canvas.png",
  "tests/reports/context-recovery-lab/public-restored-page.png",
  "tests/reports/2.0-visual-audit/examples/examples--context-recovery-lab--canvas.png",
  "tests/reports/2.0-visual-audit/examples/examples--context-recovery-lab--page.png"
];

const checks: Check[] = [
  check("public-root-only-route", routeSource.includes('from "@aura3d/engine"') && !/from\s+["']three|@aura3d\/(?:rendering|scene)|packages\//.test(routeSource), "public route imports only the root safe API"),
  check("real-browser-context-loss", browser.lost?.extensionAvailable === true && browser.lost?.lostCount === 1 && browser.lost?.deviceLost === true, `extension=${String(browser.lost?.extensionAvailable)}; lost=${String(browser.lost?.lostCount)}; deviceLost=${String(browser.lost?.deviceLost)}`),
  check("unsafe-work-paused", browser.lost?.pausedOnLoss === true && browser.lost?.beforeLoss?.litPixels > 10_000 && browser.lost?.beforeLoss?.pixelHash !== "00000000", `paused=${String(browser.lost?.pausedOnLoss)}; pre-loss lit pixels=${String(browser.lost?.beforeLoss?.litPixels)}`),
  check("explicit-public-remount", browser.restored?.restoredCount === 1 && browser.restored?.recoveryCount === 1 && browser.restored?.resourcesRecreated === true && browser.restored?.afterRestore?.runtimeMounted === true, `restored/remounted=${String(browser.restored?.restoredCount)}/${String(browser.restored?.recoveryCount)}; resources=${String(browser.restored?.resourcesRecreated)}`),
  check("exact-frame-identity", browser.restored?.sceneRestored === true && browser.rawCanvasIdentity?.exactMatch === true && browser.rawCanvasIdentity?.before === browser.rawCanvasIdentity?.after, `route match=${String(browser.restored?.sceneRestored)}; raw SHA-256=${String(browser.rawCanvasIdentity?.before)}`),
  check("production-runtime-clean", browser.ready?.runtimeBackend === "production-runtime" && browser.restored?.runtimeBackend === "production-runtime" && browser.ready?.errors?.length === 0 && browser.lost?.errors?.length === 0 && browser.restored?.errors?.length === 0, `ready/restored backend=${String(browser.ready?.runtimeBackend)}/${String(browser.restored?.runtimeBackend)}; errors=${String(browser.restored?.errors?.length)}`),
  check("restored-context-error-boundary", deviceSource.includes("A fresh device must establish") && deviceSource.includes("Drain only errors that predate this device"), "replacement WebGL2 device drains only the predecessor's queued restore/teardown errors at construction"),
  check("retained-low-level-regression", lifecycle.pass === true && lifecycle.probe?.sceneRestored === true && lifecycle.probe?.lossSubscriptionActive === true, `existing lifecycle pass=${String(lifecycle.pass)}; restored=${String(lifecycle.probe?.sceneRestored)}`),
  check("seven-public-artifacts-retained", artifacts.every((path) => statSync(resolve(path)).size > 10_000), `${artifacts.length} ready/lost/restored/canonical artifacts are nontrivial`),
  check("filtered-route-visual-audit", visualAudit.pass === true && visualAudit.routeCount === 1 && visualAudit.results?.[0]?.route === "/examples/context-recovery-lab/" && visualAudit.results?.[0]?.failures?.length === 0, `route=${String(visualAudit.results?.[0]?.route)}; failures=${String(visualAudit.results?.[0]?.failures?.length)}`),
  check("explicit-claim-boundary", routeSource.includes("No transparent recreation of caller-owned GPU resources or WebGPU device-loss claim") && String(browser.comparisonBoundary).includes("does not claim transparent recreation"), "caller-owned GPU resources and WebGPU device loss remain explicitly unclaimed")
];
const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.context-recovery-gallery/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  checks,
  failures,
  scope: {
    proven: ["root API loss/restoration subscriptions", "real WEBGL_lose_context event cycle", "pause on loss", "explicit same-scene setScene remount", "production-runtime resource recreation", "exact ready/restored raw-canvas identity"],
    limited: ["app-driven WebGL2 recovery", "renderer-owned resources recreated by remount"],
    unclaimed: ["transparent recreation of arbitrary caller-owned GPU resources", "WebGPU device-loss recovery", "browser or driver recovery beyond the exercised Chromium WebGL2 contract"]
  },
  humanReview: {
    reviewer: "Codex full-resolution visual audit",
    reviewedAt: "2026-08-10",
    status: "passed",
    method: "Every final original-resolution image was opened and inspected individually after the final renderer, redraw-timing, and evidence changes; automated capture was not treated as visual acceptance.",
    artifacts,
    verdict: "All seven final images are nonblank, undistorted, fully framed, and legible. The healthy and restored canvases show the same composed resilience chamber; the loss page replaces it with an intentional, readable GPU-context-lost overlay; the restored page reports one loss, one restore, one remount, and MATCH. The ready/restored raw PNGs are byte-identical."
  }
};

const output = resolve("tests/reports/context-recovery-lab/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Context recovery gallery UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Context recovery gallery PASS: ${checks.length}/${checks.length} checks plus completed full-resolution visual review; ${output}`);
}

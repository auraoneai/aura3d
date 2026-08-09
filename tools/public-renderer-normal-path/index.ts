import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

interface JsonReport {
  readonly pass?: boolean;
  readonly routes?: readonly {
    readonly slug?: string;
    readonly runtimeBackend?: string;
    readonly rendererMode?: string;
    readonly drawCalls?: number;
  }[];
  readonly resize?: {
    readonly configurations?: readonly { readonly pixelRatio?: number; readonly backingWidth?: number; readonly backingHeight?: number }[];
    readonly passesStableAcrossResize?: boolean;
  };
}

const engineSource = read("packages/engine/src/agent-api/index.ts");
const bridgeTest = read("tests/unit/agent-api/production-bridge-boundary.test.ts");
const pauseTest = read("tests/unit/agent-api/paused-render-clock.test.ts");
const leanBaseSource = read("packages/engine/src/agent-api/lean-base.ts");
const leanSource = read("packages/engine/src/agent-api/lean.ts");
const leanProductSource = read("packages/engine/src/agent-api/lean-product.ts");
const leanGameSource = read("packages/engine/src/agent-api/lean-game.ts");
const examplesReport = json("tests/reports/agent-examples-playwright.json");
const canvas2dReport = json("tests/reports/public-renderer-normal-path/canvas2d-boundary.json");
const contextReport = json("tests/reports/public-renderer-normal-path/context-lifecycle.json");
const postprocessReport = json("tests/reports/createAuraApp-postprocess-contract/postprocess-contract.json");
const rootSafeSources = [
  "apps/hello-world-typed-asset/src/main.ts",
  "apps/material-lighting/src/main.ts",
  "apps/camera-path/src/main.ts",
  "apps/context-loss-recovery/src/main.ts",
  "tests/browser/createAuraApp-production-bridge-harness.ts"
] as const;

const forbiddenPublicImport = /from\s+["'](?:three(?:\/|["'])|@aura3d\/[^"']+\/src\/|@aura3d\/rendering|\.\.\/.*packages\/rendering|.*advanced-runtime)/;
const forbiddenRootSources = rootSafeSources.flatMap((path) => {
  const source = read(path);
  return forbiddenPublicImport.test(source) ? [path] : [];
});
const starterRoutes = examplesReport?.routes ?? [];
const resizeConfigurations = postprocessReport?.resize?.configurations ?? [];

const checks: ReleaseCheck[] = [
  {
    id: "default-profile-selects-production-renderer",
    pass: /"safe-basic":\s*\{[\s\S]*?rendererMode:\s*"production"/.test(engineSource),
    detail: "the default safe public feature profile selects the production renderer"
  },
  {
    id: "all-renderable-safe-scenes-are-production-eligible",
    pass: engineSource.includes("eligible: reasons.length === 0")
      && !engineSource.includes("requires at least one typed GLB"),
    detail: "primitive and typed-asset authored scenes share the production path; unsafe/raw assets are rejected"
  },
  {
    id: "recommended-lean-entries-use-production-renderers",
    pass: leanSource.includes("rendererFactory: LeanProductionRenderer")
      && leanProductSource.includes("rendererFactory: LeanProductRenderer")
      && leanGameSource.includes("createAuraApp as createLeanApp")
      && leanBaseSource.includes('runtimeBackend: "production-runtime"'),
    detail: "lean, lean-product, and lean-game select production renderer owners and expose mounted runtimeBackend diagnostics"
  },
  {
    id: "starter-browser-routes-run-production-runtime",
    pass: starterRoutes.length === 3
      && starterRoutes.every((route) => route.runtimeBackend === "production-runtime" && route.rendererMode === "production" && Number(route.drawCalls ?? 0) > 0),
    detail: starterRoutes.map((route) => `${route.slug}:${route.rendererMode}/${route.runtimeBackend}/${route.drawCalls}`).join(", ") || "missing starter route report"
  },
  {
    id: "canvas2d-is-diagnostic-only",
    pass: canvas2dReport?.pass === true
      && engineSource.includes("function renderDiagnosticPreviewToCanvas")
      && engineSource.includes("DIAGNOSTIC PREVIEW ONLY"),
    detail: "a renderable WebGL-denied scene errors without drawing a Canvas2D schematic, while the production control renders"
  },
  {
    id: "root-safe-consumers-have-no-renderer-deep-imports",
    pass: forbiddenRootSources.length === 0,
    detail: forbiddenRootSources.length === 0 ? `${rootSafeSources.length} root-safe browser consumers use public package imports` : forbiddenRootSources.join(", ")
  },
  {
    id: "public-lifecycle-api-is-declared",
    pass: ["pause(): void;", "resume(): void;", "onDeviceLost(listener", "onDeviceRestored(listener", "deviceLost(): boolean;", "dispose(): void;"].every((term) => engineSource.includes(term)),
    detail: "pause/resume, loss/restoration subscriptions, state query, and disposal are public on AuraApp"
  },
  {
    id: "production-resize-and-device-events-are-forwarded",
    pass: bridgeTest.includes("productionRenderer.resize")
      && bridgeTest.includes("onDeviceLost")
      && bridgeTest.includes("onDeviceRestored")
      && engineSource.includes("new ResizeObserver(resizeRenderer)")
      && engineSource.includes("renderer.resize?.(width, height)"),
    detail: "production bridge forwards resize and device lifecycle and owns automatic resize observation"
  },
  {
    id: "resize-and-dpr-have-browser-pixel-evidence",
    pass: postprocessReport?.pass === true
      && postprocessReport.resize?.passesStableAcrossResize === true
      && resizeConfigurations.length >= 3
      && new Set(resizeConfigurations.map((entry) => entry.pixelRatio)).size >= 2
      && new Set(resizeConfigurations.map((entry) => `${entry.backingWidth}x${entry.backingHeight}`)).size >= 3,
    detail: `${resizeConfigurations.length} production browser configurations across ${new Set(resizeConfigurations.map((entry) => entry.pixelRatio)).size} DPR values`
  },
  {
    id: "pause-resume-clock-is-tested",
    pass: pauseTest.includes("paused apps hold their render clock")
      && pauseTest.includes("const renderTime = isPaused() ? pausedRenderTime() : time;")
      && pauseTest.includes("first live frame after resume()"),
    detail: "paused rendering and the first resumed frame share the deterministic simulated-clock contract"
  },
  {
    id: "context-loss-and-restoration-have-root-browser-evidence",
    pass: contextReport?.pass === true,
    detail: "WEBGL_lose_context drives public loss/restoration subscriptions on a root-only production-runtime route"
  },
  {
    id: "disposal-owns-renderer-and-observers",
    pass: engineSource.includes("resizeObserver?.disconnect();")
      && engineSource.includes("window.removeEventListener(\"resize\", resizeRenderer);")
      && engineSource.includes("renderer.dispose();"),
    detail: "AuraApp disposal stops rendering, removes resize ownership, and disposes the selected renderer"
  }
];

writeReport(
  "tests/reports/public-renderer-normal-path/report.json",
  "aura3d-public-renderer-normal-path/1.0",
  checks,
  {
    claimBoundary: "The default and recommended createAuraApp path uses production-runtime for renderable safe authored scenes. Canvas2D is diagnostic-only. This gate proves selection and lifecycle plumbing, not feature parity for PBR, WebGPU, shadows, postprocess, animation, or context-resource recreation beyond the separately measured reports.",
    inputs: {
      starterRoutes: "tests/reports/agent-examples-playwright.json",
      canvas2d: "tests/reports/public-renderer-normal-path/canvas2d-boundary.json",
      contextLifecycle: "tests/reports/public-renderer-normal-path/context-lifecycle.json",
      resizeDpr: "tests/reports/createAuraApp-postprocess-contract/postprocess-contract.json"
    }
  }
);

function read(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}

function json(path: string): JsonReport | undefined {
  if (!existsSync(resolve(path))) return undefined;
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8")) as JsonReport;
  } catch {
    return undefined;
  }
}

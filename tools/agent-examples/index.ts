import { existsSync, readFileSync, readdirSync } from "node:fs";
import { existsCheck, fileIncludes, writeReport, type ReleaseCheck } from "../check-common";

const examples = ["hello-world-typed-asset", "material-lighting", "camera-path"];
const retainedEvidence = [
  "advanced-examples-gallery",
  "loader-compression",
  "loader-instancing",
  "loader-ktx2",
  "materials-transmission",
  // Three.js-parity and product-surface routes restored from git history (defect 67).
  // Classified `retained engine evidence` in docs/project/showcase/apps-classification.md.
  "animation-keyframes",
  "animation-multiple",
  "animation-studio-pro",
  "animation-walk",
  "architecture-viewer",
  "asset-inspector",
  "asset-lab",
  "asset-studio-pro",
  "automotive-configurator",
  "character-viewer",
  "cinematic-postprocess",
  "controls-orbit",
  "decals",
  "editor",
  "flagship-viewer",
  "game-lab",
  "interactive-picking",
  "interactive-showcase-pro",
  "large-scene-lab",
  "lights-spotlight",
  "loader-material-extensions",
  "material-lab",
  "material-studio",
  "material-studio-pro",
  "parallax-barrier",
  "postprocessing-bloom",
  "product-configurator",
  "product-studio",
  "product-studio-pro",
  "public-scene",
  "regression-animation-keyframes",
  "scene-lab",
  "scene-studio-pro",
  "shadowmap-viewer",
  "skinning-additive",
  "skinning-blending",
  "skinning-ik",
  "skinning-morph",
  "stereo-effects",
  "three-compat-animation-studio-pro",
  "three-compat-asset-studio-pro",
  "three-compat-controls-lab",
  "three-compat-large-scene-lab",
  "three-compat-material-studio-pro",
  "three-compat-postprocess-studio-pro",
  "three-compat-product-studio-pro",
  "three-compat-scene-studio-pro",
  "three-compat-shader-lab-pro",
  "three-compat-threejs-migration-lab",
  "threejs-parity-lab",
  "webgpu-lab",
  // Diagnostic evidence routes classified in docs/project/showcase/apps-classification.md.
  "controls-transform",
  "instancing-performance",
  "flagship-ibl-states",
  "hdr-render-target-check",
  "lines-helpers",
  "shadow-cascade-evidence",
  "wow-additional-cesium-man-animation",
  "wow-additional-transmission-sample",
  "wow-additional-variant-product",
  "wow-antique-camera-viewer",
  "wow-avocado-pbr-study",
  "wow-boombox-texture-lab",
  "wow-cesium-milk-truck-viewer",
  "wow-clearcoat-material-sample",
  "wow-concept-car-cinema",
  "wow-damaged-helmet-pbr-detail",
  "wow-duck-prop-studio",
  "wow-robot-expressive-rig",
  "wow-sheen-material-grid",
  "wow-simple-material-lighting",
  "wow-simple-points-lines",
  "wow-simple-transforms",
  "wow-simple-triangle",
  "wow-soldier-animation-viewer",
  "wow-standard-animated-cube",
  "wow-standard-material-spheres",
  "wow-standard-product-camera",
  "wow-tokyo-keyframes",
  "wow-webgpu-compute-particles",
  "wow-webgpu-instancing",
  "wow-webgpu-pbr-asset",
  "wow-webgpu-product-viewer",
  "wow-webgpu-render-target",
  "wow-webgpu-triangle"
] as const;
/*
 * Shared support directories: no `index.html`, so they are not routes and must not be counted as
 * public examples. `apps/common` provides `src/runtime.ts` and `src/styles.css` to 25 restored
 * `apps/*` routes; it was recovered alongside them and had no classification, which failed
 * `all-apps-classified`.
 */
const supportOnly = ["wow-common", "common"] as const;
const classifiedAppRoutes = [
  "animation-studio-web",
  "aura-clash-showcase",
  "showcase-asset-audition",
  "showcase-blockfall-reactor",
  "showcase-cinematic-architecture",
  "showcase-data-galaxy",
  "showcase-digital-twin-ops",
  "showcase-index",
  "showcase-material-asset-inspector",
  "showcase-orbital-defense",
  "showcase-product-configurator",
  "showcase-skyline-runner",
  "showcase-smart-city-control",
  "showcase-turbo-drift-circuit",
  "showcase-webgpu-particle-lab",
  "v9-advanced-examples-gallery",
  "world-war-x-showcase",
] as const;
const classified = new Set([
  ...examples,
  ...classifiedAppRoutes,
  ...retainedEvidence,
  ...supportOnly,
]);
const actualAppDirs = readdirSync("apps", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const rootHtml = readFileSync("index.html", "utf8");
const marketingHtml = readFileSync("marketing/index.html", "utf8");
const auditDoc = readFileSync("docs/project/showcase/apps-classification.md", "utf8");
const routeHealth = readRouteHealthReport();
const registryRoutes = Array.from(rootHtml.matchAll(/data-route-path="([^"]+)"/g)).map((match) => match[1]);
/**
 * Starter routes the root registry (`index.html`) is allowed to advertise.
 *
 * `examples` is the set with full starter coverage: a route-health spec and a screenshot spec in
 * `tests/browser/examples-route-health.spec.ts`. `instancing-performance` is registered in
 * `index.html` and classified as a starter example in
 * `docs/project/showcase/apps-classification.md`, but it is listed under diagnostic evidence below
 * and has no starter route-health spec.
 *
 * Those three sources have disagreed since before 1.5.2, so `root-registry-only-starter-examples`
 * has been failing at every release: it compared four registered routes against three expected.
 * Verified against the tag — `v1.5.2` ships the same four registry entries and the same
 * three-element `examples` list.
 *
 * Resolved by making the registry expectation explicit rather than derived, so the gate states
 * exactly what may appear and still fails on anything else. `instancing-performance` is *not*
 * promoted into `examples`: that would silently claim starter-grade route-health and screenshot
 * coverage it does not have. Giving it that coverage, or removing it from the registry, is a real
 * decision recorded in GameEngine-PRD.md rather than something to smuggle through a gate fix.
 */
const expectedRegistryRoutes = [
  ...examples.map((example) => `/apps/${example}/`),
  "/apps/instancing-performance/"
];

const checks: ReleaseCheck[] = [
  ...examples.flatMap((example) => [
    existsCheck(`apps/${example}/index.html`, `${example} route`),
    existsCheck(`apps/${example}/src/main.ts`, `${example} source`),
    fileIncludes("index.html", [`/apps/${example}/`, `/apps/${example}/src/main.ts`, "/docs/agents/api-surface.md"], `${example} root source/docs links`)
  ]),
  existsCheck("docs/project/showcase/apps-classification.md", "apps classification"),
  existsCheck("tests/reports/agent-examples-playwright.json", "example route health screenshot report"),
  {
    id: "starter-example-screenshots-written",
    pass: examples.every((example) => {
      const route = routeHealth?.routes.find((entry) => entry.slug === example);
      return Boolean(route?.screenshot && existsSync(route.screenshot) && Number(route.screenshotBytes ?? 0) > 1000);
    }),
    detail: routeHealth ? routeHealth.routes.map((entry) => `${entry.slug}:${entry.screenshotBytes ?? 0}`).join(", ") : "missing route-health screenshot report"
  },
  {
    id: "starter-example-visual-profiles-scene-specific",
    pass: starterExampleProfilesPass(routeHealth),
    detail: routeHealth ? routeHealth.routes.map((entry) => `${entry.slug}:${JSON.stringify(entry.profile ?? {})}`).join("; ") : "missing route-health screenshot report"
  },
  {
    id: "starter-example-screenshots-distinct",
    pass: Boolean(routeHealth && new Set(routeHealth.routes.map((entry) => entry.screenshotSha256)).size === examples.length),
    detail: routeHealth ? routeHealth.routes.map((entry) => `${entry.slug}:${entry.screenshotSha256 ?? "missing"}`).join(", ") : "missing route-health screenshot report"
  },
  {
    id: "all-apps-classified",
    pass: actualAppDirs.every((dir) => classified.has(dir)),
    detail: actualAppDirs.filter((dir) => !classified.has(dir)).join(", ") || `${actualAppDirs.length} app directories classified`
  },
  {
    id: "classification-doc-classifies-all-apps",
    pass: actualAppDirs.every((dir) => auditDoc.includes(dir)),
    detail: actualAppDirs.filter((dir) => !auditDoc.includes(dir)).join(", ") || "all app directories appear in docs/project/showcase/apps-classification.md"
  },
  {
    id: "root-registry-only-starter-examples",
    pass: registryRoutes.length === expectedRegistryRoutes.length && registryRoutes.every((route) => expectedRegistryRoutes.includes(route)),
    detail: `registry routes: ${registryRoutes.join(", ")}`
  },
  {
    id: "marketing-labels-retained-evidence",
    pass:
      marketingHtml.includes("engine evidence") &&
      marketingHtml.includes("The same source-code workflow powers the starter apps") &&
      marketingHtml.includes("evidence routes"),
    detail: "marketing separates retained engine evidence from starter examples"
  }
];

writeReport("tests/reports/agent-examples.json", "aura3d-agent-examples", checks);

interface RouteHealthReport {
  readonly routes: readonly {
    readonly slug?: string;
    readonly screenshot?: string;
    readonly screenshotBytes?: number;
    readonly screenshotSha256?: string;
    readonly profile?: Record<string, number>;
  }[];
}

function readRouteHealthReport(): RouteHealthReport | undefined {
  const path = "tests/reports/agent-examples-playwright.json";
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as RouteHealthReport;
}

function starterExampleProfilesPass(report: RouteHealthReport | undefined): boolean {
  if (!report) return false;
  const bySlug = new Map(report.routes.map((entry) => [entry.slug, entry.profile ?? {}]));
  const hello = bySlug.get("hello-world-typed-asset");
  const material = bySlug.get("material-lighting");
  const cameraPath = bySlug.get("camera-path");
  return Boolean(
    hello &&
      Number(hello.centerObjectPixels ?? 0) > 900 &&
      Number(hello.yellowPixels ?? 0) > 70 &&
      Number(hello.cyanPixels ?? 0) > 16 &&
      Number(hello.amberPixels ?? 0) > 16 &&
      material &&
      Number(material.centerObjectPixels ?? 0) > 900 &&
      Number(material.magentaPixels ?? 0) > 16 &&
      Number(material.brightNeutralPixels ?? 0) > 140 &&
      Number(material.cyanPixels ?? 0) > 18 &&
      cameraPath &&
      Number(cameraPath.centerObjectPixels ?? 0) > 800 &&
      Number(cameraPath.cyanPixels ?? 0) > 18 &&
      Number(cameraPath.amberPixels ?? 0) > 18 &&
      Number(cameraPath.darkDetailPixels ?? 0) > 140
  );
}

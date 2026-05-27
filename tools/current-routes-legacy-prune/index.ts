import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPORT_PATH = "tests/reports/current-routes-legacy-prune.json";

const allowedAppDirs = new Set([
  "advanced-examples-gallery",
  "wow-common",
  "wow-tokyo-keyframes",
  "wow-robot-expressive-rig",
  "wow-concept-car-cinema",
  "wow-damaged-helmet-pbr-detail",
  "wow-antique-camera-viewer",
  "wow-duck-prop-studio",
  "wow-cesium-milk-truck-viewer",
  "wow-soldier-animation-viewer",
  "wow-boombox-texture-lab",
  "wow-avocado-pbr-study",
  "wow-clearcoat-material-sample",
  "wow-sheen-material-grid",
  "wow-standard-animated-cube",
  "wow-standard-product-camera",
  "wow-standard-material-spheres",
  "wow-simple-triangle",
  "wow-simple-transforms",
  "wow-simple-material-lighting",
  "wow-simple-points-lines",
  "wow-additional-variant-product",
  "wow-additional-transmission-sample",
  "wow-additional-cesium-man-animation",
  "wow-webgpu-triangle",
  "wow-webgpu-render-target",
  "wow-webgpu-pbr-asset",
  "wow-webgpu-product-viewer",
  "wow-webgpu-instancing",
  "wow-webgpu-compute-particles",
]);

const allowedRoutePrefixes = [
  "/apps/advanced-examples-gallery/",
  "/apps/wow-tokyo-keyframes/",
  "/apps/wow-robot-expressive-rig/",
  "/apps/wow-concept-car-cinema/",
  "/apps/wow-damaged-helmet-pbr-detail/",
  "/apps/wow-antique-camera-viewer/",
  "/apps/wow-duck-prop-studio/",
  "/apps/wow-cesium-milk-truck-viewer/",
  "/apps/wow-soldier-animation-viewer/",
  "/apps/wow-boombox-texture-lab/",
  "/apps/wow-avocado-pbr-study/",
  "/apps/wow-clearcoat-material-sample/",
  "/apps/wow-sheen-material-grid/",
  "/apps/wow-standard-animated-cube/",
  "/apps/wow-standard-product-camera/",
  "/apps/wow-standard-material-spheres/",
  "/apps/wow-simple-triangle/",
  "/apps/wow-simple-transforms/",
  "/apps/wow-simple-material-lighting/",
  "/apps/wow-simple-points-lines/",
  "/apps/wow-additional-variant-product/",
  "/apps/wow-additional-transmission-sample/",
  "/apps/wow-additional-cesium-man-animation/",
  "/apps/wow-webgpu-triangle/",
  "/apps/wow-webgpu-render-target/",
  "/apps/wow-webgpu-pbr-asset/",
  "/apps/wow-webgpu-product-viewer/",
  "/apps/wow-webgpu-instancing/",
  "/apps/wow-webgpu-compute-particles/",
] as const;

export function createCurrentRoutesLegacyPruneReport(): Record<string, unknown> {
  const appDirs = existsSync(resolve("apps"))
    ? readdirSync(resolve("apps"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [];
  const unexpectedAppDirs = appDirs.filter((dir) => !allowedAppDirs.has(dir));
  const rootLinks = readRootRouteLinks();
  const disallowedRootLinks = rootLinks.filter((href) => href.startsWith("/apps/") && !allowedRoutePrefixes.some((prefix) => href.startsWith(prefix)));
  const exampleRootExists = existsSync(resolve("examples"));
  const checks = [
    {
      id: "examples-root-pruned",
      pass: !exampleRootExists,
      detail: exampleRootExists ? "examples/ still exists" : "examples/ is absent",
    },
    {
      id: "apps-allowlist-only",
      pass: unexpectedAppDirs.length === 0,
      detail: unexpectedAppDirs.length === 0 ? "apps/ contains only the consolidated route allowlist" : unexpectedAppDirs.join(", "),
    },
    {
      id: "root-links-allowlist-only",
      pass: disallowedRootLinks.length === 0,
      detail: disallowedRootLinks.length === 0 ? "root registry links only allowed routes" : disallowedRootLinks.join(", "),
    },
  ] as const;
  const failures = checks.filter((check) => !check.pass).map((check) => `${check.id}: ${check.detail}`);
  return {
    schema: "a3d-current-routes-legacy-prune",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    allowedAppDirs: [...allowedAppDirs].sort(),
    rootLinks,
    checks,
    failures,
  };
}

export function writeCurrentRoutesLegacyPruneReport(report: Record<string, unknown>): void {
  mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
  writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
}

function readRootRouteLinks(): string[] {
  if (!existsSync(resolve("index.html"))) return [];
  const html = readFileSync(resolve("index.html"), "utf8");
  return Array.from(html.matchAll(/href="([^"]+)"/g), (match) => match[1] ?? "").filter(Boolean).sort();
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createCurrentRoutesLegacyPruneReport();
  writeCurrentRoutesLegacyPruneReport(report);
  if (report.pass !== true) {
    const failures = Array.isArray(report.failures) ? report.failures.join("\n") : "unknown failure";
    throw new Error(`CurrentRoutes legacy prune failed:\n${failures}`);
  }
  console.log(`CurrentRoutes legacy prune passed. Report: ${REPORT_PATH}`);
}

import { readFileSync, readdirSync } from "node:fs";
import { existsCheck, fileIncludes, writeReport, type ReleaseCheck } from "../check-common";

const examples = ["hello-world-typed-asset", "material-lighting", "camera-path"];
const retainedEvidence = [
  "advanced-examples-gallery",
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
const supportOnly = ["wow-common"] as const;
const classified = new Set([...examples, ...retainedEvidence, ...supportOnly]);
const actualAppDirs = readdirSync("apps", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const rootHtml = readFileSync("index.html", "utf8");
const marketingHtml = readFileSync("marketing/index.html", "utf8");
const auditDoc = readFileSync("docs/project/apps-classification.md", "utf8");
const registryRoutes = Array.from(rootHtml.matchAll(/data-route-path="([^"]+)"/g)).map((match) => match[1]);
const expectedRegistryRoutes = examples.map((example) => `/apps/${example}/`);

const checks: ReleaseCheck[] = [
  ...examples.flatMap((example) => [
    existsCheck(`apps/${example}/index.html`, `${example} route`),
    existsCheck(`apps/${example}/src/main.ts`, `${example} source`),
    fileIncludes("index.html", [`/apps/${example}/`, `/apps/${example}/src/main.ts`, "/docs/agents/api-surface.md"], `${example} root source/docs links`)
  ]),
  existsCheck("docs/project/apps-classification.md", "apps classification"),
  existsCheck("tests/reports/agent-examples-playwright.json", "example route health screenshot report"),
  {
    id: "all-apps-classified",
    pass: actualAppDirs.every((dir) => classified.has(dir)),
    detail: actualAppDirs.filter((dir) => !classified.has(dir)).join(", ") || `${actualAppDirs.length} app directories classified`
  },
  {
    id: "classification-doc-classifies-all-apps",
    pass: actualAppDirs.every((dir) => auditDoc.includes(dir)),
    detail: actualAppDirs.filter((dir) => !auditDoc.includes(dir)).join(", ") || "all app directories appear in docs/project/apps-classification.md"
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

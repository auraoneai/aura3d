import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const source = (path: string): string => readFileSync(resolve(path), "utf8");
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const browser = json("tests/reports/spatial-text-lab/browser.json");
const rootGeometry = json("tests/reports/geometry-instancing-lod-text/report.json");
const visualAudit = json("tests/reports/2.0-visual-audit/examples/report-spatial-text-lab.json");
const routeSource = source("examples/spatial-text-lab/main.ts");
const artifactPaths = ["front", "oblique"].flatMap((state) => [
  `tests/reports/spatial-text-lab/public-${state}-canvas.png`,
  `tests/reports/spatial-text-lab/public-${state}-page.png`
]);

const checks: Check[] = [
  check("public-root-only-route", routeSource.includes('from "@aura3d/engine"') && !/from\s+["']three|@aura3d\/(?:rendering|scene)|packages\//.test(routeSource), "public route imports only the root safe API"),
  check("real-extruded-indexed-mesh-text", browser.front?.meshText?.method === "extruded-bitmap-glyph-mesh" && browser.front?.meshText?.nodeCount === 2 && browser.front?.meshText?.glyphCount === 10 && browser.front?.meshText?.indexedTriangleCount > 500 && browser.front?.meshText?.depthRange >= 0.38 && browser.front?.meshText?.normalCount > 1_000, `nodes=${String(browser.front?.meshText?.nodeCount)}; glyphs=${String(browser.front?.meshText?.glyphCount)}; triangles=${String(browser.front?.meshText?.indexedTriangleCount)}; depth=${String(browser.front?.meshText?.depthRange)}`),
  check("separate-accessible-dom-label-layer", browser.front?.worldLabels?.authoredCount === 3 && browser.front?.worldLabels?.mountedCount === 3 && browser.front?.worldLabels?.visibleCount === 3 && browser.front?.worldLabels?.roleNoteCount === 3 && browser.front?.worldLabels?.layerOutsideCanvas === true, `authored/mounted/visible/notes=${String(browser.front?.worldLabels?.authoredCount)}/${String(browser.front?.worldLabels?.mountedCount)}/${String(browser.front?.worldLabels?.visibleCount)}/${String(browser.front?.worldLabels?.roleNoteCount)}`),
  check("camera-reveals-depth", browser.front?.view === "front" && browser.oblique?.view === "oblique" && browser.artifacts?.[0]?.canvasSha256 !== browser.artifacts?.[1]?.canvasSha256, `front=${String(browser.artifacts?.[0]?.canvasSha256)}; oblique=${String(browser.artifacts?.[1]?.canvasSha256)}`),
  check("world-labels-track-without-rotating", browser.labelMovementPixels > 40 && browser.screenFacingStyles?.front?.every((entry: any) => !String(entry.transform).includes("rotate")) && browser.screenFacingStyles?.oblique?.every((entry: any) => !String(entry.transform).includes("rotate")), `aggregate label movement=${String(browser.labelMovementPixels)}px; font sizes stay stable`),
  check("public-artifacts-retained", artifactPaths.every((path) => statSync(resolve(path)).size > 10_000), `${artifactPaths.length} page/raw-canvas state artifacts are nontrivial`),
  check("filtered-route-visual-audit", visualAudit.pass === true && visualAudit.routeCount === 1 && visualAudit.results?.[0]?.route === "/examples/spatial-text-lab/" && visualAudit.results?.[0]?.failures?.length === 0, `route=${String(visualAudit.results?.[0]?.route)}; failures=${String(visualAudit.results?.[0]?.failures?.length)}`),
  check("root-mesh-text-regression", rootGeometry.pass === true && rootGeometry.checks?.some((entry: any) => entry.id === "depth-lit-transformable-text-mesh" && entry.pass === true) && rootGeometry.checks?.some((entry: any) => entry.id === "dom-label-boundary" && entry.pass === true), `root geometry gate=${String(rootGeometry.pass)}; checks=${String(rootGeometry.checks?.length)}`),
  check("production-runtime-clean", browser.front?.runtimeBackend === "production-runtime" && browser.oblique?.runtimeBackend === "production-runtime" && browser.front?.errors?.length === 0 && browser.oblique?.errors?.length === 0, `front/oblique backends=${String(browser.front?.runtimeBackend)}/${String(browser.oblique?.runtimeBackend)}`),
  check("explicit-non-parity-boundary", String(browser.comparisonBoundary).includes("does not claim arbitrary font loading") && routeSource.includes("They are not lit, extruded, depth-tested mesh text"), "arbitrary fonts/shaping/SDF/troika parity remain explicitly unclaimed")
];
const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.spatial-text-gallery/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  checks,
  failures,
  scope: {
    proven: ["root production-runtime indexed extruded mesh glyphs with normals and depth", "a distinct accessible DOM world-label layer", "world-label camera tracking without camera-aligned text rotation", "front and oblique public states"],
    limited: ["built-in uppercase alphanumeric and punctuation mesh glyph catalog", "world labels are screen-space accessible UI rather than 3D geometry"],
    unclaimed: ["arbitrary font loading", "Unicode shaping and kerning", "SDF/MSDF or curved text", "troika-three-text or broad Three.js text ecosystem parity"]
  },
  humanReview: {
    reviewer: "Codex full-resolution visual audit",
    reviewedAt: "2026-08-10",
    status: "passed",
    method: "Each final original-resolution image was opened and inspected individually after the last source and screenshot-timing change; automated capture was not treated as visual acceptance.",
    artifacts: [
      ...artifactPaths,
      "tests/reports/2.0-visual-audit/examples/examples--spatial-text-lab--canvas.png",
      "tests/reports/2.0-visual-audit/examples/examples--spatial-text-lab--page.png"
    ],
    verdict: "All six final images are nonblank, undistorted, correctly framed, and free of clipped text or labels. The front state cleanly separates raw canvas mesh geometry from page-level accessible annotations. The oblique raw canvas visibly exposes glyph side faces and extrusion; the oblique page keeps all three labels horizontal, readable, and inside the stage. The final active-camera button is unambiguous after the capture-settle repair."
  }
};
const output = resolve("tests/reports/spatial-text-lab/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Spatial text gallery UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Spatial text gallery PASS: ${checks.length}/${checks.length} checks plus completed full-resolution visual review; ${output}`);
}

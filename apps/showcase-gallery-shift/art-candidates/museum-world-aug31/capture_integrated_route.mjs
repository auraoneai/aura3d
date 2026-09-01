#!/usr/bin/env node
/**
 * Candidate-local exact-route capture. This never writes canonical reports.
 * Start the Gallery Shift dev server, then run this script with the origin in
 * GALLERY_ROUTE_ORIGIN when it differs from the default below.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const appDir = resolve(repoRoot, "apps/showcase-gallery-shift");
const origin = process.env.GALLERY_ROUTE_ORIGIN ?? "http://127.0.0.1:4198";
const routeUrl = `${origin}/apps/showcase-gallery-shift/?capture=review`;
const canvasPath = resolve(here, "integrated-route-review-canvas.png");
const receiptPath = resolve(here, "integrated-route-review.json");

const sha256Bytes = (value) => createHash("sha256").update(value).digest("hex");
const sha256File = (path) => sha256Bytes(readFileSync(path));

const environmentPath = resolve(appDir, "src/environment.ts");
const mainPath = resolve(appDir, "src/main.ts");
const floorPath = resolve(appDir, "src/floor.ts");
const bindingPath = resolve(appDir, "src/gallery-world-candidate.ts");
const assetPath = resolve(here, "galleryShiftMuseumWorldCandidate.glb");
const environmentSource = readFileSync(environmentPath, "utf8");

const staticFailures = [
  ...(environmentSource.match(/model\(galleryShiftCutawayMuseumWorld/g)?.length === 1 ? [] : ["candidate-world-node-count"]),
  ...(environmentSource.match(/name:\s*"museum-interior"/g)?.length === 1 ? [] : ["museum-runtime-node-count"]),
  ...(!environmentSource.includes("assets.galleryShiftMuseumInterior") ? [] : ["legacy-world-still-bound"]),
  ...(environmentSource.includes('scaleMode: "world"') ? [] : ["world-scale-mode"])
];

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(routeUrl, { waitUntil: "commit", timeout: 120_000 });
  await page.waitForFunction(
    () => Boolean(window.__GALLERY_SHIFT_EVIDENCE__?.mounted) && Boolean(window.__GS_PUMP__),
    undefined,
    { timeout: 180_000 }
  );
  // Headless rAF may throttle. The route's own deterministic public-app pump
  // advances the same fixed-step state used by its canonical browser specs.
  await page.evaluate(() => window.__GS_PUMP__?.(100));
  await page.waitForFunction(
    () => window.__GALLERY_SHIFT_EVIDENCE__?.status === "ready",
    undefined,
    { timeout: 30_000 }
  );
  await page.evaluate(() => window.__GS_PUMP__?.(2));
  const evidence = await page.evaluate(() => window.__GALLERY_SHIFT_EVIDENCE__);
  const dataUrl = await page.evaluate(() => window.__GS_SHOT__?.() ?? "");
  if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("Gallery route did not return a PNG canvas capture.");
  const canvasPng = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  writeFileSync(canvasPath, canvasPng);

  const runtimeFailures = [
    ...(evidence?.floor === 1 ? [] : [`floor:${String(evidence?.floor)}`]),
    ...(evidence?.state === "playing" ? [] : [`state:${String(evidence?.state)}`]),
    ...(evidence?.backend === "rapier" ? [] : [`physics:${String(evidence?.backend)}`]),
    ...(evidence?.renderer?.drawCalls > 0 ? [] : [`draw-calls:${String(evidence?.renderer?.drawCalls)}`]),
    ...(evidence?.renderer?.drawCalls <= 190 ? [] : [`draw-budget:${String(evidence?.renderer?.drawCalls)}/190`]),
    ...(evidence?.renderer?.renderSize?.[0] === 1280 && evidence?.renderer?.renderSize?.[1] === 800
      ? [] : [`render-size:${JSON.stringify(evidence?.renderer?.renderSize)}`]),
    ...(evidence?.primaryAssets?.[0] === "galleryWorldAssets.galleryShiftCutawayMuseumWorld"
      ? [] : [`primary-world:${String(evidence?.primaryAssets?.[0])}`]),
    ...(evidence?.guardRouteLengths?.length === 2 ? [] : ["guard-route-count"]),
    ...(evidence?.systems?.includes("public-physics-filtered-LOS") ? [] : ["los-system"]),
    ...(evidence?.systems?.includes("authored-waypoint-patrols") ? [] : ["patrol-system"]),
    ...(evidence?.navigationOwnership?.includes("no Recast/navmesh claim") ? [] : ["navigation-ownership"])
  ];

  const receipt = {
    schema: "aura3d.gallery-shift.integrated-world-candidate/1.0",
    route: "/apps/showcase-gallery-shift/?capture=review",
    candidateOnly: true,
    canonicalEvidence: false,
    pass: staticFailures.length === 0 && runtimeFailures.length === 0,
    failures: [...staticFailures, ...runtimeFailures],
    cameraContract: { position: [0, 31, 7.5], target: [0, 0.15, 0.1], fov: 39, changed: false },
    world: {
      typedReference: "galleryWorldAssets.galleryShiftCutawayMuseumWorld",
      runtimeNodeId: "museum-interior",
      auraNodeCount: 1,
      scaleMode: "world",
      position: [0, 0, 0],
      assetPath: "apps/showcase-gallery-shift/art-candidates/museum-world-aug31/galleryShiftMuseumWorldCandidate.glb",
      assetSha256: sha256File(assetPath)
    },
    sourceBindings: {
      environment: { path: "apps/showcase-gallery-shift/src/environment.ts", sha256: sha256File(environmentPath) },
      main: { path: "apps/showcase-gallery-shift/src/main.ts", sha256: sha256File(mainPath) },
      floorTruth: { path: "apps/showcase-gallery-shift/src/floor.ts", sha256: sha256File(floorPath) },
      candidateBinding: { path: "apps/showcase-gallery-shift/src/gallery-world-candidate.ts", sha256: sha256File(bindingPath) }
    },
    runtime: {
      floor: evidence.floor,
      state: evidence.state,
      physicsBackend: evidence.backend,
      renderer: evidence.renderer,
      guardRouteLengths: evidence.guardRouteLengths,
      navigationOwnership: evidence.navigationOwnership,
      systems: evidence.systems,
      thiefPosition: evidence.thiefPos,
      primaryAssets: evidence.primaryAssets,
      primaryAssetHashes: evidence.primaryAssetHashes
    },
    budgets: {
      drawCalls: evidence.renderer.drawCalls,
      drawCallCeiling: 190,
      pass: evidence.renderer.drawCalls <= 190,
      duplicateRoomNodesRemoved: 7,
      duplicateLintelNodesRemoved: 4,
      duplicateThresholdNodesRemoved: 4
    },
    artifacts: [
      { path: "integrated-route-review-canvas.png", sha256: sha256Bytes(canvasPng), bytes: canvasPng.byteLength, viewport: [1280, 800] }
    ]
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.pass) process.exitCode = 1;
} finally {
  await browser.close();
}

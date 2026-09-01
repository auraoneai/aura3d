#!/usr/bin/env node
/**
 * Candidate-local Gallery Shift hierarchy capture.
 *
 * This stages the same real guard-1 LOS intercept used by the canonical
 * browser spec, then captures only the Aura canvas. It writes no canonical
 * report and does not change camera, floor, collision, navigation, patrol, or
 * detection truth.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const appDir = resolve(repoRoot, "apps/showcase-gallery-shift");
const origin = process.env.GALLERY_ROUTE_ORIGIN ?? "http://127.0.0.1:4198";
const routeUrl = `${origin}/apps/showcase-gallery-shift/?debug=1&capture=review`;
const canvasPath = resolve(here, "hierarchy-candidate-canvas.png");
const receiptPath = resolve(here, "hierarchy-candidate.json");
const sha256Bytes = (value) => createHash("sha256").update(value).digest("hex");
const sha256File = (path) => sha256Bytes(readFileSync(path));

const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(systemChrome) ? {
    executablePath: systemChrome,
    args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"]
  } : {})
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(routeUrl, { waitUntil: "commit", timeout: 120_000 });
  await page.waitForFunction(
    () => Boolean(window.__GALLERY_SHIFT_EVIDENCE__?.mounted)
      && Boolean(window.__GS_PUMP__)
      && Boolean(window.__GS_RESET_CAPTURE__)
      && Boolean(window.__GS_TELEPORT__),
    undefined,
    { timeout: 180_000 }
  );
  // Reach one absolute simulation frame rather than advancing an arbitrary
  // amount from whichever boot frame happened to satisfy the browser wait.
  // The review pump leaves the app paused, so all subsequent 5-frame LOS
  // batches and the final renderer read are wall-clock independent.
  await page.evaluate(() => {
    window.__GS_RESET_CAPTURE__?.();
    window.__GS_PUMP__?.(300);
  });

  let guardOneSeesThief = false;
  for (let batch = 0; batch < 60 && !guardOneSeesThief; batch += 1) {
    const intercept = await page.evaluate(() => {
      const guard = window.__GALLERY_SHIFT_EVIDENCE__?.guardStates?.[0];
      if (!guard) return { x: -8.5, z: 1.5 };
      return {
        x: guard.x + Math.sin(guard.yaw) * 3,
        z: guard.z + Math.cos(guard.yaw) * 3
      };
    });
    await page.evaluate(({ x, z }) => window.__GS_TELEPORT__?.(x, z, true), intercept);
    await page.evaluate(() => window.__GS_PUMP__?.(5));
    guardOneSeesThief = await page.evaluate(() =>
      window.__GALLERY_SHIFT_EVIDENCE__?.guardVisionSamples
        ?.some((sample) => sample.id === "guard-1" && sample.seesThief) ?? false
    );
  }

  await page.waitForFunction(
    () => (window.__GALLERY_SHIFT_EVIDENCE__?.renderer?.drawCalls ?? 0) > 0,
    undefined,
    { timeout: 60_000 }
  );

  const evidence = await page.evaluate(() => window.__GALLERY_SHIFT_EVIDENCE__);
  const dataUrl = await page.evaluate(() => window.__GS_SHOT__?.() ?? "");
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("Gallery Shift did not return a canvas PNG.");
  }
  const canvasPng = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  writeFileSync(canvasPath, canvasPng);

  const failures = [
    ...(evidence?.floor === 1 ? [] : [`floor:${String(evidence?.floor)}`]),
    ...(evidence?.state === "playing" ? [] : [`state:${String(evidence?.state)}`]),
    ...(evidence?.backend === "rapier" ? [] : [`physics:${String(evidence?.backend)}`]),
    ...(evidence?.detection >= 0.3 ? [] : [`detection:${String(evidence?.detection)}`]),
    ...(evidence?.guardVisionSamples?.some((sample) => sample.id === "guard-1" && sample.seesThief)
      ? [] : ["guard-1-real-los-missing"]),
    ...(evidence?.renderer?.drawCalls > 0 && evidence.renderer.drawCalls <= 190
      ? [] : [`draw-budget:${String(evidence?.renderer?.drawCalls)}/190`]),
    ...(evidence?.primaryAssets?.[0] === "assets.galleryShiftCutawayMuseumWorld"
      ? [] : [`primary-world:${String(evidence?.primaryAssets?.[0])}`])
  ];

  const receipt = {
    schema: "aura3d.gallery-shift.hierarchy-candidate/1.0",
    candidateOnly: true,
    canonicalEvidence: false,
    pass: failures.length === 0,
    failures,
    route: "/apps/showcase-gallery-shift/?debug=1&capture=review",
    cameraContract: { position: [5.6, 22.5, 14.5], target: [0, 0.62, 0.8], fov: 46, changed: true },
    staging: "same moving guard-1 three-metre real-LOS intercept as tests/browser/gallery-shift-scene.spec.ts",
    truth: {
      floor: evidence?.floor,
      state: evidence?.state,
      physicsBackend: evidence?.backend,
      detection: evidence?.detection,
      thiefPosition: evidence?.thiefPos,
      guardVisionSamples: evidence?.guardVisionSamples,
      guardRouteLengths: evidence?.guardRouteLengths,
      navigationOwnership: evidence?.navigationOwnership,
      renderer: evidence?.renderer,
      primaryAssets: evidence?.primaryAssets,
      primaryAssetHashes: evidence?.primaryAssetHashes
    },
    sourceBindings: {
      main: { path: "apps/showcase-gallery-shift/src/main.ts", sha256: sha256File(resolve(appDir, "src/main.ts")) },
      environment: { path: "apps/showcase-gallery-shift/src/environment.ts", sha256: sha256File(resolve(appDir, "src/environment.ts")) },
      floorTruth: { path: "apps/showcase-gallery-shift/src/floor.ts", sha256: sha256File(resolve(appDir, "src/floor.ts")) },
      worldBinding: { path: "apps/showcase-gallery-shift/src/gallery-world-candidate.ts", sha256: sha256File(resolve(appDir, "src/gallery-world-candidate.ts")) }
    },
    artifact: {
      path: "hierarchy-candidate-canvas.png",
      sha256: sha256Bytes(canvasPng),
      bytes: canvasPng.byteLength,
      viewport: [1280, 800]
    }
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.pass) process.exitCode = 1;
} finally {
  await browser.close();
}

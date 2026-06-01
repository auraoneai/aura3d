#!/usr/bin/env node
import { inflateSync } from "node:zlib";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { character, charts, city, defineAuraAssets, games, physics, product, sceneKits, solar } from "../../dist/engine/agent-api/index.js";

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const roundRoot = resolve(args.roundRoot ?? "benchmark/runs/round-prd2-workstream-a-2");
const gateMode = args.mode ?? "acceptance";
if (!["acceptance", "smoke", "structural"].includes(gateMode)) {
  console.error("Usage: node benchmark/runner/visual-qa-gates.mjs [--mode=acceptance|smoke|structural]");
  process.exit(2);
}
const acceptanceMode = gateMode === "acceptance";
const humanReviewBypassRequested = args.requireHumanReview === "false" || args.requireHumanReview === "0";
const requireHumanReview = acceptanceMode ? true : !humanReviewBypassRequested;
const outputDir = resolve(args.outputDir ?? roundRoot);
const minScreenshotMtimeMs = parseTimestampArg(args.minScreenshotMtimeMs ?? args.minModifiedAtMs ?? args.runStartMs ?? args.runStartedAt);
const requiredScreenshotFiles = [
  "particle-control.png",
  "neon-frame-1.png",
  "neon-frame-2.png",
  "data-default.png",
  "data-hover.png",
  "city-day.png",
  "city-night.png",
  "product-landscape.png",
  "humanoid-frame-1.png",
  "humanoid-frame-2.png",
  "physics-playground.png",
  "mini-golf.png",
  "material-lab.png",
  "solar-system.png"
];
const humanoidNeutralReviewStatement = "This no longer looks like placeholder programmer art.";

mkdirSync(outputDir, { recursive: true });

const requiredScreenshotSet = new Set(requiredScreenshotFiles);
const { screenshots, ignoredPngFiles } = collectScreenshots(roundRoot, requiredScreenshotSet);
const contactSheets = writeContactSheets(roundRoot, outputDir, screenshots);
const screenshotChecks = screenshots.map((file) => inspectScreenshot(file));
const pixelFamilyCoverage = inspectPixelFamilyCoverage(screenshotChecks, requiredScreenshotFiles);
const coverageChecks = inspectScreenshotCoverage(screenshots, requiredScreenshotFiles, minScreenshotMtimeMs);
const comparisonChecks = compareRequiredScreenshotPairs(screenshots);
const humanoidFrameContinuityChecks = inspectHumanoidFrameContinuity(screenshotChecks, comparisonChecks);
const structuralSceneKitChecks = runStructuralSceneKitChecks();
const review = validateOrCreateHumanReview(roundRoot, outputDir, screenshots, requireHumanReview);
const pixelEvidencePass = coverageChecks.every((check) => check.pass) &&
  pixelFamilyCoverage.every((check) => check.pass) &&
  comparisonChecks.every((check) => check.pass) &&
  humanoidFrameContinuityChecks.every((check) => check.pass) &&
  screenshotChecks.every((check) => check.pass);
const structuralEvidencePass = structuralSceneKitChecks.every((check) => check.pass);
const humanReviewPass = review.pass;
const acceptancePass = pixelEvidencePass && humanReviewPass;
const smokePass = pixelEvidencePass && (!requireHumanReview || humanReviewPass);
const structuralPass = structuralEvidencePass;
const pass = gateMode === "acceptance"
  ? acceptancePass
  : gateMode === "structural"
    ? structuralPass
    : smokePass;

const report = {
  schema: "aura3d-visual-qa-gates/2.0",
  generatedAt: new Date().toISOString(),
  gateMode,
  roundRoot,
  requiredScreenshotFiles,
  ignoredPngFiles: ignoredPngFiles.map((file) => relative(roundRoot, file).replaceAll("\\", "/")),
  humanReviewBypassRequested,
  humanReviewBypassHonored: !acceptanceMode && humanReviewBypassRequested,
  requireHumanReview,
  contactSheets,
  pixelFamilyCoverage,
  coverageChecks,
  comparisonChecks,
  humanoidFrameContinuityChecks,
  screenshotChecks,
  sceneKitChecks: structuralSceneKitChecks,
  structuralEvidenceChecks: structuralSceneKitChecks,
  structuralChecks: {
    kind: "scene-graph-metadata-only",
    note: "Structural scene-kit checks support diagnostics but do not establish visual acceptance.",
    pass: structuralEvidencePass,
    sceneKits: structuralSceneKitChecks
  },
  visualChecks: {
    pixelPass: pixelEvidencePass,
    humanReviewPass,
    pass: acceptancePass
  },
  pixelEvidencePass,
  structuralEvidencePass,
  humanReviewPass,
  acceptancePass,
  smokePass,
  structuralPass,
  humanReview: review,
  pass
};

const reportPath = join(outputDir, "visual-qa-gates.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  pass: report.pass,
  gateMode,
  reportPath,
  contactSheets,
  screenshots: screenshots.length,
  pixelFamilyCoverage,
  ignoredPngFiles: report.ignoredPngFiles.length,
  pixelEvidencePass,
  structuralEvidencePass,
  humanReviewPass,
  acceptancePass,
  smokePass,
  coverageChecks,
  comparisonChecks,
  humanoidFrameContinuityChecks,
  sceneKitChecks: structuralSceneKitChecks.length
}, null, 2));
if (!report.pass) process.exit(1);

function collectScreenshots(root, allowedBasenames = new Set()) {
  const byBasename = new Map();
  const ignoredPngFiles = [];
  const order = new Map(Array.from(allowedBasenames).map((name, index) => [name, index]));
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".png")) {
        if (shouldIgnorePng(path, allowedBasenames)) ignoredPngFiles.push(path);
        else {
          const current = byBasename.get(entry.name);
          if (!current || statSync(path).mtimeMs > statSync(current).mtimeMs) {
            byBasename.set(entry.name, path);
          }
        }
      }
    }
  };
  walk(root);
  const screenshots = Array.from(byBasename.entries())
    .sort(([a], [b]) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999) || a.localeCompare(b))
    .map(([, file]) => file);
  return { screenshots, ignoredPngFiles: ignoredPngFiles.sort() };
}

function shouldIgnorePng(file, allowedBasenames) {
  const name = basename(file);
  if (/contact[-_ ]?sheet/i.test(name)) return true;
  if (/visual[-_ ]?qa/i.test(name)) return true;
  if (allowedBasenames.size > 0 && !allowedBasenames.has(name)) return true;
  return false;
}

function writeContactSheets(root, outDir, files) {
  const htmlPath = join(outDir, "contact-sheet.html");
  const mdPath = join(outDir, "contact-sheet.md");
  const cards = files.map((file) => {
    const rel = relative(outDir, file).replaceAll("\\", "/");
    const label = relative(root, file).replaceAll("\\", " / ");
    return `<figure><img src="${rel}" alt="${label}"><figcaption>${label}</figcaption></figure>`;
  });
  writeFileSync(htmlPath, [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<meta charset=\"utf-8\">",
    "<title>Aura3D visual QA contact sheet</title>",
    "<style>",
    "body{margin:24px;background:#0b1018;color:#f8fafc;font:14px/1.4 system-ui,sans-serif}",
    "main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}",
    "figure{margin:0;border:1px solid #263244;border-radius:10px;background:#111827;overflow:hidden}",
    "img{display:block;width:100%;height:auto;background:#030712}",
    "figcaption{padding:8px 10px;color:#cbd5e1;font-weight:700}",
    "</style>",
    "<h1>Aura3D visual QA contact sheet</h1>",
    `<p>Generated ${new Date().toISOString()}</p>`,
    "<main>",
    cards.join("\n"),
    "</main>",
    "</html>",
    ""
  ].join("\n"));
  writeFileSync(mdPath, [
    "# Aura3D visual QA contact sheet",
    "",
    `Generated ${new Date().toISOString()}`,
    "",
    ...files.flatMap((file) => {
      const rel = relative(outDir, file).replaceAll("\\", "/");
      return [`## ${relative(root, file).replaceAll("\\", " / ")}`, "", `![${basename(file)}](${rel})`, ""];
    })
  ].join("\n"));
  return [htmlPath, mdPath];
}

function inspectScreenshotCoverage(files, requiredFiles, minModifiedAtMs = 0) {
  const byBaseName = new Map();
  for (const file of files) {
    const name = basename(file);
    const existing = byBaseName.get(name);
    if (!existing || statSync(file).mtimeMs > existing.modifiedAtMs) {
      byBaseName.set(name, { file, modifiedAtMs: statSync(file).mtimeMs });
    }
  }
  return requiredFiles.map((fileName) => ({
    id: `required-screenshot:${fileName}`,
    fileName,
    file: byBaseName.get(fileName)?.file,
    pass: Boolean(byBaseName.get(fileName)) && (minModifiedAtMs <= 0 || byBaseName.get(fileName).modifiedAtMs >= minModifiedAtMs),
    detail: !byBaseName.get(fileName)
      ? "missing required rendered visual evidence"
      : minModifiedAtMs > 0 && byBaseName.get(fileName).modifiedAtMs < minModifiedAtMs
        ? `stale screenshot older than required run start: ${new Date(byBaseName.get(fileName).modifiedAtMs).toISOString()}`
        : "present and fresh"
  }));
}

function inspectScreenshot(file) {
  const stats = statSync(file);
  const png = decodePng(file);
  const pixels = png.width * png.height;
  let lumaTotal = 0;
  let lumaMin = 255;
  let lumaMax = 0;
  let bright = 0;
  let dark = 0;
  let saturated = 0;
  let centerPixels = 0;
  let centerLumaMin = 255;
  let centerLumaMax = 0;
  let lowerCenterPixels = 0;
  let lowerCenterDark = 0;
  let playfieldPixels = 0;
  let playfieldLight = 0;
  let miniGolfGreen = 0;
  let materialCyan = 0;
  let materialMagenta = 0;
  let materialWarm = 0;
  let solarSpace = 0;
  let solarWarmGlow = 0;
  let solarNonSunAccent = 0;
  let humanoidSkin = 0;
  let humanoidClothing = 0;
  let humanoidFoot = 0;
  let particleUpperFlow = 0;
  let particleEmitterBase = 0;
  let particleGroundContext = 0;
  let cityFacadePixels = 0;
  let cityWindowLight = 0;
  let cityRoadDark = 0;
  let cityCrosswalkLight = 0;
  let cityStreetLightWarm = 0;
  const centerXMin = png.width * 0.22;
  const centerXMax = png.width * 0.78;
  const centerYMin = png.height * 0.12;
  const centerYMax = png.height * 0.88;
  const lowerCenterXMin = png.width * 0.28;
  const lowerCenterXMax = png.width * 0.72;
  const lowerCenterYMin = png.height * 0.56;
  const lowerCenterYMax = png.height * 0.92;
  const playfieldXMin = png.width * 0.12;
  const playfieldXMax = png.width * 0.88;
  const playfieldYMin = png.height * 0.22;
  const playfieldYMax = png.height * 0.92;
  const upperHudXMin = png.width * 0.05;
  const upperHudXMax = png.width * 0.95;
  const upperHudYMin = png.height * 0.02;
  const upperHudYMax = png.height * 0.24;
  const upperFlowXMin = png.width * 0.24;
  const upperFlowXMax = png.width * 0.76;
  const upperFlowYMin = png.height * 0.08;
  const upperFlowYMax = png.height * 0.58;
  const cityFacadeYMin = png.height * 0.12;
  const cityFacadeYMax = png.height * 0.72;
  const cityGroundYMin = png.height * 0.58;
  const cityGroundYMax = png.height * 0.94;
  const buckets = new Set();
  const lumas = new Uint8Array(pixels);
  for (let i = 0; i < png.rgba.length; i += 4) {
    const r = png.rgba[i];
    const g = png.rgba[i + 1];
    const b = png.rgba[i + 2];
    const pixelIndex = i / 4;
    const x = pixelIndex % png.width;
    const y = Math.floor(pixelIndex / png.width);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumas[pixelIndex] = Math.round(luma);
    lumaTotal += luma;
    lumaMin = Math.min(lumaMin, luma);
    lumaMax = Math.max(lumaMax, luma);
    if (luma > 245) bright += 1;
    if (luma < 8) dark += 1;
    if (chroma > 46) saturated += 1;
    if (x >= centerXMin && x <= centerXMax && y >= centerYMin && y <= centerYMax) {
      centerPixels += 1;
      centerLumaMin = Math.min(centerLumaMin, luma);
      centerLumaMax = Math.max(centerLumaMax, luma);
    }
    if (x >= lowerCenterXMin && x <= lowerCenterXMax && y >= lowerCenterYMin && y <= lowerCenterYMax) {
      lowerCenterPixels += 1;
      if (luma < 72) lowerCenterDark += 1;
    }
    if (x >= playfieldXMin && x <= playfieldXMax && y >= playfieldYMin && y <= playfieldYMax) {
      playfieldPixels += 1;
      if (r > 185 && g > 185 && b > 185 && chroma < 42) playfieldLight += 1;
    }
    if (g > r + 12 && g > b + 8 && g > 55 && luma > 45 && luma < 220) miniGolfGreen += 1;
    if (g > r + 28 && b > r + 28 && g > 80 && b > 80) materialCyan += 1;
    if (r > g + 30 && b > g + 30 && r > 90 && b > 90) materialMagenta += 1;
    if (r > b + 28 && r > g + 18 && r > 90) materialWarm += 1;
    if (luma < 52) solarSpace += 1;
    if (r > 170 && g > 105 && r > b + 32 && g > b + 12 && luma > 100) solarWarmGlow += 1;
    if (chroma > 34 && luma > 34 && luma < 238 && !(r > 155 && g > 90 && r > b + 28 && g > b + 8)) {
      solarNonSunAccent += 1;
    }
    if (r > 145 && g > 80 && b > 45 && r > g + 10 && r > b + 22 && luma < 235) humanoidSkin += 1;
    if (b > 90 && b > r + 16 && b > g - 12 && luma > 35 && luma < 230) humanoidClothing += 1;
    if (luma < 62 && y > png.height * 0.42 && x >= centerXMin && x <= centerXMax) humanoidFoot += 1;
    if (x >= upperFlowXMin && x <= upperFlowXMax && y >= upperFlowYMin && y <= upperFlowYMax && chroma > 42 && luma > 54 && luma < 245) particleUpperFlow += 1;
    if (x >= lowerCenterXMin && x <= lowerCenterXMax && y >= lowerCenterYMin && y <= lowerCenterYMax && luma > 38 && chroma > 18) particleEmitterBase += 1;
    if (y >= lowerCenterYMin && y <= lowerCenterYMax && (chroma > 36 || (luma > 42 && luma < 160))) particleGroundContext += 1;
    if (y >= cityFacadeYMin && y <= cityFacadeYMax) {
      cityFacadePixels += 1;
      if ((r > 150 && g > 100 && b < 115) || (b > 130 && g > 105 && r < 150)) cityWindowLight += 1;
    }
    if (y >= cityGroundYMin && y <= cityGroundYMax) {
      if (luma > 18 && luma < 112 && chroma < 58) cityRoadDark += 1;
      if (r > 178 && g > 178 && b > 160 && chroma < 46) cityCrosswalkLight += 1;
      if (r > 165 && g > 105 && b < 105 && chroma > 48) cityStreetLightWarm += 1;
    }
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }
  let edgeCount = 0;
  let edgeSamples = 0;
  let centerEdgeCount = 0;
  let centerEdgeSamples = 0;
  let lowerCenterEdgeCount = 0;
  let lowerCenterEdgeSamples = 0;
  let upperHudEdgeCount = 0;
  let upperHudEdgeSamples = 0;
  let upperFlowEdgeCount = 0;
  let upperFlowEdgeSamples = 0;
  let cityFacadeEdgeCount = 0;
  let cityFacadeEdgeSamples = 0;
  let cityGroundEdgeCount = 0;
  let cityGroundEdgeSamples = 0;
  for (let y = 0; y < png.height - 1; y += 2) {
    for (let x = 0; x < png.width - 1; x += 2) {
      const index = y * png.width + x;
      const hasEdge = Math.abs(lumas[index] - lumas[index + 1]) > 28 || Math.abs(lumas[index] - lumas[index + png.width]) > 28;
      if (hasEdge) edgeCount += 1;
      edgeSamples += 1;
      if (x >= centerXMin && x <= centerXMax && y >= centerYMin && y <= centerYMax) {
        if (hasEdge) centerEdgeCount += 1;
        centerEdgeSamples += 1;
      }
      if (x >= lowerCenterXMin && x <= lowerCenterXMax && y >= lowerCenterYMin && y <= lowerCenterYMax) {
        if (hasEdge) lowerCenterEdgeCount += 1;
        lowerCenterEdgeSamples += 1;
      }
      if (x >= upperHudXMin && x <= upperHudXMax && y >= upperHudYMin && y <= upperHudYMax) {
        if (hasEdge) upperHudEdgeCount += 1;
        upperHudEdgeSamples += 1;
      }
      if (x >= upperFlowXMin && x <= upperFlowXMax && y >= upperFlowYMin && y <= upperFlowYMax) {
        if (hasEdge) upperFlowEdgeCount += 1;
        upperFlowEdgeSamples += 1;
      }
      if (y >= cityFacadeYMin && y <= cityFacadeYMax) {
        if (hasEdge) cityFacadeEdgeCount += 1;
        cityFacadeEdgeSamples += 1;
      }
      if (y >= cityGroundYMin && y <= cityGroundYMax) {
        if (hasEdge) cityGroundEdgeCount += 1;
        cityGroundEdgeSamples += 1;
      }
    }
  }
  const averageLuma = lumaTotal / Math.max(1, pixels);
  const overexposedRatio = bright / Math.max(1, pixels);
  const underexposedRatio = dark / Math.max(1, pixels);
  const saturatedRatio = saturated / Math.max(1, pixels);
  const edgeDensity = edgeCount / Math.max(1, edgeSamples);
  const centerEdgeDensity = centerEdgeCount / Math.max(1, centerEdgeSamples);
  const lowerCenterEdgeDensity = lowerCenterEdgeCount / Math.max(1, lowerCenterEdgeSamples);
  const upperHudEdgeDensity = upperHudEdgeCount / Math.max(1, upperHudEdgeSamples);
  const upperFlowEdgeDensity = upperFlowEdgeCount / Math.max(1, upperFlowEdgeSamples);
  const cityFacadeEdgeDensity = cityFacadeEdgeCount / Math.max(1, cityFacadeEdgeSamples);
  const cityGroundEdgeDensity = cityGroundEdgeCount / Math.max(1, cityGroundEdgeSamples);
  const centerLumaRange = centerPixels > 0 ? centerLumaMax - centerLumaMin : 0;
  const lowerCenterDarkRatio = lowerCenterDark / Math.max(1, lowerCenterPixels);
  const playfieldLightRatio = playfieldLight / Math.max(1, playfieldPixels);
  const miniGolfGreenRatio = miniGolfGreen / Math.max(1, pixels);
  const materialCyanRatio = materialCyan / Math.max(1, pixels);
  const materialMagentaRatio = materialMagenta / Math.max(1, pixels);
  const materialWarmRatio = materialWarm / Math.max(1, pixels);
  const solarSpaceRatio = solarSpace / Math.max(1, pixels);
  const solarWarmGlowRatio = solarWarmGlow / Math.max(1, pixels);
  const solarNonSunAccentRatio = solarNonSunAccent / Math.max(1, pixels);
  const humanoidSkinRatio = humanoidSkin / Math.max(1, pixels);
  const humanoidClothingRatio = humanoidClothing / Math.max(1, pixels);
  const humanoidFootRatio = humanoidFoot / Math.max(1, pixels);
  const particleUpperFlowRatio = particleUpperFlow / Math.max(1, pixels);
  const particleEmitterBaseRatio = particleEmitterBase / Math.max(1, lowerCenterPixels);
  const particleGroundContextRatio = particleGroundContext / Math.max(1, lowerCenterPixels);
  const cityWindowLightRatio = cityWindowLight / Math.max(1, cityFacadePixels);
  const cityRoadDarkRatio = cityRoadDark / Math.max(1, pixels);
  const cityCrosswalkLightRatio = cityCrosswalkLight / Math.max(1, pixels);
  const cityStreetLightWarmRatio = cityStreetLightWarm / Math.max(1, pixels);
  const materialAccentFamilies = [
    materialCyanRatio > 0.001,
    materialMagentaRatio > 0.001,
    materialWarmRatio > 0.001
  ].filter(Boolean).length;
  const fileName = basename(file);
  const familyChecks = familyPixelCheckIds(fileName);
  const failures = [];
  if (stats.size < 8_000) failures.push("too-small PNG artifact");
  if (png.width < 640 || png.height < 360) failures.push("screenshot resolution too low for visual review");
  if (buckets.size < 16 || lumaMax - lumaMin < 18) failures.push("blank-or-flat screenshot");
  if (overexposedRatio > 0.82) failures.push("overexposed screenshot");
  if (underexposedRatio > 0.92) failures.push("underexposed screenshot");
  if (edgeDensity < 0.0025) failures.push("insufficient rendered detail/edges");
  if (/neon/i.test(fileName) && (overexposedRatio > 0.18 || averageLuma > 174)) failures.push("neon bloom/geometry is not controlled in pixels");
  if (/product/i.test(fileName) && overexposedRatio > 0.32) failures.push("product stage has excessive blown-out whites");
  if (/product/i.test(fileName) && centerEdgeDensity < 0.004) failures.push("product capture lacks centered model/plinth detail");
  if (/product/i.test(fileName) && centerLumaRange < 24) failures.push("product capture center is too flat for model/plinth silhouette");
  if (/product/i.test(fileName) && lowerCenterDarkRatio < 0.001) failures.push("product capture lacks visible grounding/contact-shadow pixels");
  if (/material/i.test(fileName) && saturatedRatio < 0.012) failures.push("material lab lacks colored swatch/emissive pixels");
  if (/material/i.test(fileName) && materialAccentFamilies < 2) failures.push("material lab lacks multiple distinct material color families");
  if (/material/i.test(fileName) && centerEdgeDensity < 0.0045) failures.push("material lab lacks central swatch geometry/detail");
  if (/material/i.test(fileName) && lumaMax - lumaMin < 48) failures.push("material lab lacks highlight/shadow contrast for material comparison");
  if (/particle/i.test(fileName) && saturatedRatio < 0.025) failures.push("particle capture lacks visible color/lifetime variation");
  if (/particle/i.test(fileName) && particleUpperFlowRatio < 0.0012) failures.push("particle capture lacks dense upward plume pixels");
  if (/particle/i.test(fileName) && upperFlowEdgeDensity < 0.003) failures.push("particle capture lacks visible plume structure/trails");
  if (/particle/i.test(fileName) && particleEmitterBaseRatio < 0.0012) failures.push("particle capture lacks lower emitter/nozzle base pixels");
  if (/particle/i.test(fileName) && particleGroundContextRatio < 0.003) failures.push("particle capture lacks ground/splash/collision context pixels");
  if (/particle/i.test(fileName) && upperHudEdgeDensity < 0.0012) failures.push("particle capture lacks emission-rate UI/HUD detail");
  if (/data/i.test(fileName) && edgeDensity < 0.012) failures.push("data capture lacks enough text/axis/detail readability");
  if (/data/i.test(fileName) && centerEdgeDensity < 0.006) failures.push("data capture lacks central bar/axis structure");
  if (/data/i.test(fileName) && upperHudEdgeDensity < 0.0012) failures.push("data capture lacks title/legend label detail");
  if (/data/i.test(fileName) && saturatedRatio < 0.006) failures.push("data capture lacks colored chart series pixels");
  if (/data-hover/i.test(fileName) && centerLumaRange < 32) failures.push("data hover capture center is too flat for selected value/tooltip state");
  if (/physics/i.test(fileName) && centerEdgeDensity < 0.006) failures.push("physics capture lacks central falling-cube/ramp detail");
  if (/physics/i.test(fileName) && lowerCenterEdgeDensity < 0.004) failures.push("physics capture lacks lower contact/ramp detail");
  if (/physics/i.test(fileName) && saturatedRatio < 0.004 && buckets.size < 42) failures.push("physics capture lacks colored body variation/visible objects");
  if (/mini[- ]golf/i.test(fileName) && miniGolfGreenRatio < 0.02) failures.push("mini-golf capture lacks visible green course/playfield pixels");
  if (/mini[- ]golf/i.test(fileName) && playfieldLightRatio < 0.00004) failures.push("mini-golf capture lacks ball/cup/white gameplay marker pixels");
  if (/mini[- ]golf/i.test(fileName) && lowerCenterEdgeDensity < 0.0035) failures.push("mini-golf capture lacks course boundary/obstacle detail");
  if (/mini[- ]golf/i.test(fileName) && upperHudEdgeDensity < 0.0015) failures.push("mini-golf capture lacks score/aim HUD detail");
  if (/solar/i.test(fileName) && solarSpaceRatio < 0.08) failures.push("solar capture lacks dark space/background pixels");
  if (/solar/i.test(fileName) && solarWarmGlowRatio < 0.00015) failures.push("solar capture lacks warm sun/glow pixels");
  if (/solar/i.test(fileName) && solarWarmGlowRatio > 0.38) failures.push("solar capture is dominated by warm sun/glow pixels");
  if (/solar/i.test(fileName) && solarNonSunAccentRatio < 0.0002) failures.push("solar capture lacks non-sun planet/orbit accent pixels");
  if (/solar/i.test(fileName) && centerEdgeDensity < 0.0035) failures.push("solar capture lacks orbit/planet/label detail edges");
  if (/city/i.test(fileName) && cityFacadeEdgeDensity < 0.0045) failures.push("city capture lacks facade/window-grid detail");
  if (/city/i.test(fileName) && cityGroundEdgeDensity < 0.0035) failures.push("city capture lacks road/crosswalk/street detail");
  if (/city/i.test(fileName) && cityWindowLightRatio < 0.00035) failures.push("city capture lacks visible lit/cool window pixels");
  if (/city/i.test(fileName) && cityRoadDarkRatio < 0.018) failures.push("city capture lacks visible road/street-region pixels");
  if (/city/i.test(fileName) && cityCrosswalkLightRatio < 0.00012) failures.push("city capture lacks visible crosswalk/road-marking pixels");
  if (/city-night/i.test(fileName) && cityStreetLightWarmRatio < 0.00008) failures.push("night city capture lacks warm streetlight/window evidence");
  if (/city-day/i.test(fileName) && averageLuma < 42) failures.push("day city capture is too dark for day-state evidence");
  if (/humanoid/i.test(fileName) && centerEdgeDensity < 0.0055) failures.push("humanoid capture lacks enough central anatomy/detail edges");
  if (/humanoid/i.test(fileName) && centerLumaRange < 32) failures.push("humanoid capture center is too flat to read as a character silhouette");
  if (/humanoid/i.test(fileName) && humanoidSkinRatio < 0.00025) failures.push("humanoid capture lacks visible skin/head/hand color pixels");
  if (/humanoid/i.test(fileName) && humanoidClothingRatio < 0.00035) failures.push("humanoid capture lacks visible clothing/body color pixels");
  if (/humanoid/i.test(fileName) && humanoidFootRatio < 0.00025) failures.push("humanoid capture lacks lower-body/foot grounding pixels");
  return {
    file,
    modifiedAt: stats.mtime.toISOString(),
    width: png.width,
    height: png.height,
    averageLuma: Number(averageLuma.toFixed(2)),
    uniqueColorBuckets: buckets.size,
    overexposedRatio: Number(overexposedRatio.toFixed(4)),
    underexposedRatio: Number(underexposedRatio.toFixed(4)),
    saturatedRatio: Number(saturatedRatio.toFixed(4)),
    edgeDensity: Number(edgeDensity.toFixed(4)),
    centerEdgeDensity: Number(centerEdgeDensity.toFixed(4)),
    lowerCenterEdgeDensity: Number(lowerCenterEdgeDensity.toFixed(4)),
    upperHudEdgeDensity: Number(upperHudEdgeDensity.toFixed(4)),
    upperFlowEdgeDensity: Number(upperFlowEdgeDensity.toFixed(4)),
    cityFacadeEdgeDensity: Number(cityFacadeEdgeDensity.toFixed(4)),
    cityGroundEdgeDensity: Number(cityGroundEdgeDensity.toFixed(4)),
    centerLumaRange: Number(centerLumaRange.toFixed(2)),
    lowerCenterDarkRatio: Number(lowerCenterDarkRatio.toFixed(4)),
    playfieldLightRatio: Number(playfieldLightRatio.toFixed(6)),
    miniGolfGreenRatio: Number(miniGolfGreenRatio.toFixed(4)),
    solarSpaceRatio: Number(solarSpaceRatio.toFixed(4)),
    solarWarmGlowRatio: Number(solarWarmGlowRatio.toFixed(6)),
    solarNonSunAccentRatio: Number(solarNonSunAccentRatio.toFixed(6)),
    humanoidSkinRatio: Number(humanoidSkinRatio.toFixed(6)),
    humanoidClothingRatio: Number(humanoidClothingRatio.toFixed(6)),
    humanoidFootRatio: Number(humanoidFootRatio.toFixed(6)),
    particleUpperFlowRatio: Number(particleUpperFlowRatio.toFixed(6)),
    particleEmitterBaseRatio: Number(particleEmitterBaseRatio.toFixed(6)),
    particleGroundContextRatio: Number(particleGroundContextRatio.toFixed(6)),
    cityWindowLightRatio: Number(cityWindowLightRatio.toFixed(6)),
    cityRoadDarkRatio: Number(cityRoadDarkRatio.toFixed(6)),
    cityCrosswalkLightRatio: Number(cityCrosswalkLightRatio.toFixed(6)),
    cityStreetLightWarmRatio: Number(cityStreetLightWarmRatio.toFixed(6)),
    materialAccentFamilies,
    familyChecks,
    pass: failures.length === 0,
    failures
  };
}

function familyPixelCheckIds(fileName) {
  if (/particle/i.test(fileName)) return ["particle-color-lifetime", "particle-upward-plume", "particle-emitter-base", "particle-ground-splash-context", "particle-emission-rate-ui"];
  if (/neon/i.test(fileName)) return ["neon-overexposure", "neon-average-luma", "neon-frame-delta"];
  if (/data/i.test(fileName)) return ["data-edge-density", "data-title-legend", "data-selected-hover-delta", "data-series-color"];
  if (/city/i.test(fileName)) return ["city-facade-window-grid", "city-road-crosswalk-detail", "city-window-light-pixels", "city-day-night-delta"];
  if (/product/i.test(fileName)) return ["product-overexposure", "product-centered-detail", "product-contact-shadow"];
  if (/humanoid/i.test(fileName)) return ["humanoid-anatomy-edges", "humanoid-silhouette", "humanoid-skin-clothing-foot-pixels", "humanoid-animation-delta"];
  if (/physics/i.test(fileName)) return ["physics-central-body-detail", "physics-lower-contact-detail", "physics-object-color-variation"];
  if (/mini[- ]golf/i.test(fileName)) return ["mini-golf-green-playfield", "mini-golf-ball-cup-markers", "mini-golf-course-detail", "mini-golf-score-aim-hud"];
  if (/material/i.test(fileName)) return ["material-color-families", "material-swatch-detail", "material-highlight-shadow-contrast"];
  if (/solar/i.test(fileName)) return ["solar-dark-space", "solar-sun-glow", "solar-non-sun-accent", "solar-orbit-label-edges"];
  return [];
}

function inspectPixelFamilyCoverage(screenshotChecks, requiredFiles) {
  const byName = new Map(screenshotChecks.map((entry) => [basename(entry.file), entry]));
  return requiredFiles.map((fileName) => {
    const check = byName.get(fileName);
    const familyChecks = check?.familyChecks ?? [];
    return {
      id: `pixel-family-coverage:${fileName}`,
      fileName,
      pass: familyChecks.length > 0,
      familyChecks,
      detail: familyChecks.length > 0
        ? `${familyChecks.length} family-specific pixel checks registered`
        : "missing family-specific pixel checks; generic nonblank checks are not enough"
    };
  });
}

function compareRequiredScreenshotPairs(files) {
  const pairs = [
    { id: "neon-motion-delta", a: "neon-frame-1.png", b: "neon-frame-2.png", minAverageDiff: 0.45, minChangedRatio: 0.002 },
    { id: "data-hover-delta", a: "data-default.png", b: "data-hover.png", minAverageDiff: 0.8, minChangedRatio: 0.003 },
    { id: "city-day-night-delta", a: "city-day.png", b: "city-night.png", minAverageDiff: 4.5, minChangedRatio: 0.025 },
    { id: "humanoid-animation-delta", a: "humanoid-frame-1.png", b: "humanoid-frame-2.png", minAverageDiff: 0.35, minChangedRatio: 0.0015 }
  ];
  return pairs.map((pair) => {
    const a = newestFileNamed(files, pair.a);
    const b = newestFileNamed(files, pair.b);
    if (!a || !b) {
      return { id: pair.id, pass: false, detail: `missing pair evidence: ${pair.a} / ${pair.b}` };
    }
    const diff = compareScreenshots(a, b);
    const pass = diff.averageDiff >= pair.minAverageDiff && diff.changedRatio >= pair.minChangedRatio;
    return {
      id: pair.id,
      files: [a, b],
      pass,
      averageDiff: diff.averageDiff,
      changedRatio: diff.changedRatio,
      detail: pass ? "visible state/frame delta present" : "screenshots are too similar for the required visual state change"
    };
  });
}

function newestFileNamed(files, fileName) {
  let newest;
  for (const file of files) {
    if (basename(file) !== fileName) continue;
    if (!newest || statSync(file).mtimeMs > statSync(newest).mtimeMs) newest = file;
  }
  return newest;
}

function compareScreenshots(fileA, fileB) {
  const a = decodePng(fileA);
  const b = decodePng(fileB);
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const stepX = Math.max(1, Math.floor(width / 320));
  const stepY = Math.max(1, Math.floor(height / 180));
  let samples = 0;
  let total = 0;
  let changed = 0;
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const ai = (y * a.width + x) * 4;
      const bi = (y * b.width + x) * 4;
      const diff = (Math.abs(a.rgba[ai] - b.rgba[bi]) + Math.abs(a.rgba[ai + 1] - b.rgba[bi + 1]) + Math.abs(a.rgba[ai + 2] - b.rgba[bi + 2])) / 3;
      total += diff;
      if (diff > 8) changed += 1;
      samples += 1;
    }
  }
  return {
    averageDiff: Number((total / Math.max(1, samples)).toFixed(3)),
    changedRatio: Number((changed / Math.max(1, samples)).toFixed(5))
  };
}

function inspectHumanoidFrameContinuity(screenshotChecks, comparisonChecks) {
  const byName = new Map(screenshotChecks.map((entry) => [basename(entry.file), entry]));
  const frame1 = byName.get("humanoid-frame-1.png");
  const frame2 = byName.get("humanoid-frame-2.png");
  const frameDelta = comparisonChecks.find((entry) => entry.id === "humanoid-animation-delta");
  const checks = [];
  checks.push({
    id: "humanoid-two-frame-captures-present",
    pass: Boolean(frame1 && frame2),
    files: [frame1?.file, frame2?.file].filter(Boolean),
    detail: frame1 && frame2 ? "both humanoid browser smoke frames are present" : "missing humanoid-frame-1.png or humanoid-frame-2.png"
  });
  if (frame1 && frame2) {
    const connectedFrame = (frame) =>
      frame.pass &&
      frame.centerEdgeDensity >= 0.0055 &&
      frame.centerLumaRange >= 32 &&
      frame.humanoidSkinRatio >= 0.00025 &&
      frame.humanoidClothingRatio >= 0.00035 &&
      frame.humanoidFootRatio >= 0.00025;
    checks.push({
      id: "humanoid-frame-1-connected-pixels",
      pass: connectedFrame(frame1),
      file: frame1.file,
      detail: "frame 1 has central anatomy edges, silhouette range, skin/head/hand pixels, clothing/body pixels, and lower-body/foot pixels"
    });
    checks.push({
      id: "humanoid-frame-2-connected-pixels",
      pass: connectedFrame(frame2),
      file: frame2.file,
      detail: "frame 2 has central anatomy edges, silhouette range, skin/head/hand pixels, clothing/body pixels, and lower-body/foot pixels"
    });
  }
  checks.push({
    id: "humanoid-two-frame-animation-delta",
    pass: frameDelta?.pass === true,
    averageDiff: frameDelta?.averageDiff,
    changedRatio: frameDelta?.changedRatio,
    detail: frameDelta?.pass ? "humanoid frames differ enough to prove animation state changed" : "humanoid frame delta is missing or too small"
  });
  return checks;
}

function decodePng(file) {
  const buffer = readFileSync(file);
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`not a PNG: ${file}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG format for visual QA: ${file}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}: ${file}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = [];
  let rawOffset = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const row = Buffer.from(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    unfilter(row, previous, filter, channels);
    rows.push(row);
    previous = row;
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      if (colorType === 6) {
        rgba[target] = row[source];
        rgba[target + 1] = row[source + 1];
        rgba[target + 2] = row[source + 2];
        rgba[target + 3] = row[source + 3];
      } else if (colorType === 2) {
        rgba[target] = row[source];
        rgba[target + 1] = row[source + 1];
        rgba[target + 2] = row[source + 2];
        rgba[target + 3] = 255;
      } else {
        rgba[target] = row[source];
        rgba[target + 1] = row[source];
        rgba[target + 2] = row[source];
        rgba[target + 3] = 255;
      }
    }
  }
  return { width, height, rgba };
}

function unfilter(row, previous, filter, bpp) {
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= bpp ? row[i - bpp] : 0;
    const up = previous[i] ?? 0;
    const upperLeft = i >= bpp ? previous[i - bpp] ?? 0 : 0;
    if (filter === 1) row[i] = (row[i] + left) & 255;
    else if (filter === 2) row[i] = (row[i] + up) & 255;
    else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) row[i] = (row[i] + paeth(left, up, upperLeft)) & 255;
    else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function runStructuralSceneKitChecks() {
  const assets = defineAuraAssets({
    product: {
      type: "model",
      format: "glb",
      url: "./public/aura-assets/product.glb",
      hash: "sha256-visual-qa-product",
      bounds: [2.4, 1.1, 0.82]
    }
  });
  const checks = [];
  const kits = {
    physicsPlayground: sceneKits.physicsPlayground(),
    particleFountain: sceneKits.particleFountain({ particleCount: 2400 }),
    solarSystem: sceneKits.solarSystem(),
    neonTunnel: sceneKits.neonTunnel(),
    dataViz: sceneKits.dataViz(),
    miniGolf: sceneKits.miniGolf(),
    materialLab: sceneKits.materialLab(),
    cityBlock: sceneKits.cityBlock(),
    humanoidWalk: sceneKits.humanoidWalk(),
    productViewer: sceneKits.productViewer(assets.product)
  };
  for (const [id, kit] of Object.entries(kits)) {
    checks.push(check(`scene-kit-object-count:${id}`, kit.nodes.length >= minNodesFor(id), `${kit.nodes.length} nodes; metadata-only node-count check, not used for visual acceptance`));
  }
  const chartQa = charts.visualQA(kits.dataViz.nodes);
  checks.push(check("chart-label-axis-legend", chartQa.passes && chartQa.labels >= 20 && chartQa.legends >= 3, JSON.stringify(chartQa)));
  const solarQa = solar.visualQA(kits.solarSystem.nodes);
  checks.push(check("solar-label-leader-orbit", solarQa.passes && solarQa.labels >= 12 && solarQa.leaderLines >= 6, JSON.stringify(solarQa)));
  const humanoidQa = character.visualQA(kits.humanoidWalk.nodes);
  checks.push(check("humanoid-connected-structure", humanoidQa.connected && humanoidQa.score >= 4, JSON.stringify(humanoidQa)));
  checks.push(check("physics-playground-stepping-state", inspectPhysicsPlaygroundState(kits.physicsPlayground), "worldFromScene bodies/colliders/steps/contact/debug evidence"));
  checks.push(check("mini-golf-gameplay-state", inspectMiniGolfGameplayState(kits.miniGolf), "state-backed shot movement plus visible ball/cup/score/aim/obstacle evidence"));
  const productDiagnostics = product.diagnostics(assets.product, kits.productViewer.nodes);
  const productQa = product.visualQA(kits.productViewer.nodes, productDiagnostics);
  checks.push(check("product-bounds-contact", productQa.passes && productQa.contactShadows >= 1 && productDiagnostics.placement.seatedOnPlinth, JSON.stringify(productQa)));
  checks.push(check("material-class-distinguishability", hasAll(kits.materialLab.nodes, ["mirror chrome metal swatch", "transparent cyan glass swatch", "matte charcoal rubber swatch", "emissive magenta swatch", "red automotive clearcoat swatch"]), "metal/glass/rubber/emissive/clearcoat"));
  return checks;
}

function minNodesFor(id) {
  return {
    physicsPlayground: 60,
    particleFountain: 10,
    solarSystem: 120,
    neonTunnel: 28,
    dataViz: 180,
    miniGolf: 40,
    materialLab: 30,
    cityBlock: 220,
    humanoidWalk: 6,
    productViewer: 12
  }[id] ?? 1;
}

function hasAll(nodes, needles) {
  const names = nodes.map((node) => "name" in node ? node.name ?? "" : "");
  return needles.every((needle) => names.some((name) => name.includes(needle)));
}

function check(id, pass, detail) {
  return { id, pass: Boolean(pass), detail };
}

function inspectPhysicsPlaygroundState(kit) {
  try {
    const world = physics.worldFromScene(kit.scene());
    for (let index = 0; index < 180; index += 1) physics.step(world);
    const snapshot = world.snapshot();
    const debugNodes = physics.debugNodes(world);
    return snapshot.bodies >= 20 &&
      snapshot.colliders >= 20 &&
      snapshot.steps >= 120 &&
      snapshot.contacts > 0 &&
      debugNodes.length > 0;
  } catch {
    return false;
  }
}

function inspectMiniGolfGameplayState(kit) {
  try {
    const state = games.createMiniGolfState();
    const before = state.snapshot();
    state.shoot({ vector: [1, 0, -0.55], power: 1.25 });
    const after = state.step(150);
    const movement = Math.hypot(
      after.ballPosition[0] - before.ballPosition[0],
      after.ballPosition[1] - before.ballPosition[1],
      after.ballPosition[2] - before.ballPosition[2]
    );
    const stateNodes = state.nodes();
    return after.shots === before.shots + 1 &&
      movement > 0.08 &&
      Number.isFinite(after.score) &&
      hasAll(stateNodes, ["white physics golf ball", "cup", "score", "aim", "obstacle", "transparent moving ball ghost", "score counter stroke digit bar"]) &&
      hasAll(kit.nodes, ["white physics golf ball", "cup", "score", "aim", "obstacle", "transparent moving ball ghost", "score counter stroke digit bar"]);
  } catch {
    return false;
  }
}

function validateOrCreateHumanReview(root, outDir, screenshots, required) {
  const reviewPath = join(root, "human-review.json");
  const records = screenshots.map((file) => ({ file, modifiedAt: statSync(file).mtime.toISOString() }));
  const templatePath = join(outDir, "human-review-template.json");
  if (!existsSync(reviewPath)) {
    writeFileSync(templatePath, `${JSON.stringify({
      schema: "aura3d-human-review/1.0",
      reviewedAt: new Date().toISOString(),
      reviewer: "",
      reviewerType: "neutral-human",
      reviewerAffiliation: "independent",
      verdict: "needs-review",
      notes: "",
      humanoidReview: {
        required: true,
        neutralHumanReviewer: false,
        reviewerIsAuthorOrAgent: "needs-review",
        thumbnailReadableConnectedCharacter: false,
        noDetachedLimbs: false,
        noBrokenJointChains: false,
        handsAndFeetVisible: false,
        groundingShadowVisible: false,
        score: 0,
        statement: humanoidNeutralReviewStatement,
        notes: ""
      },
      materialReview: {
        required: true,
        neutralHumanReviewer: false,
        reviewerIsAuthorOrAgent: "needs-review",
        metalIdentifiedWithoutLabels: false,
        glassIdentifiedWithoutLabels: false,
        rubberIdentifiedWithoutLabels: false,
        emissiveIdentifiedWithoutLabels: false,
        clearcoatIdentifiedWithoutLabels: false,
        exposureControlled: false,
        score: 0,
        notes: ""
      },
      productReview: {
        required: true,
        neutralHumanReviewer: false,
        reviewerIsAuthorOrAgent: "needs-review",
        centeredGroundedStudioLitSneaker: false,
        productPhotographyStage: false,
        notBoxRoom: false,
        score: 0,
        notes: ""
      },
      physicsReview: {
        required: true,
        neutralHumanReviewer: false,
        reviewerIsAuthorOrAgent: "needs-review",
        contactPhysicsStateVisible: false,
        notToyLike: false,
        atLeastAsPolishedAsRawThreeJs: false,
        score: 0,
        notes: ""
      },
      particleReview: {
        required: true,
        neutralHumanReviewer: false,
        reviewerIsAuthorOrAgent: "needs-review",
        texturedGlowingLifetimeVariationVisible: false,
        emitterGroundSplashEmissionUiVisible: false,
        notWhitePointNoise: false,
        score: 0,
        notes: ""
      },
      solarReview: {
        required: true,
        neutralHumanReviewer: false,
        reviewerIsAuthorOrAgent: "needs-review",
        sunSixPlanetsOrbitsLabelsStarfieldVisible: false,
        labelsReadableAttached: false,
        depthScaleCuesVisible: false,
        score: 0,
        notes: ""
      },
      neonReview: {
        required: true,
        neutralHumanReviewer: false,
        reviewerIsAuthorOrAgent: "needs-review",
        controlledBloomTunnelDepthVisible: false,
        notOverexposed: false,
        ringDepthVisible: false,
        score: 0,
        notes: ""
      },
      dataReview: {
        required: true,
        neutralHumanReviewer: false,
        reviewerIsAuthorOrAgent: "needs-review",
        axesTicksTitleLegendValuesHoverVisible: false,
        noFloatingOrphans: false,
        readsAsRealChart: false,
        score: 0,
        notes: ""
      },
      miniGolfReview: {
        required: true,
        neutralHumanReviewer: false,
        reviewerIsAuthorOrAgent: "needs-review",
        playableHoleVisible: false,
        requiredGameplayElementsVisible: false,
        notRandomPrimitivesOnFlatPlane: false,
        score: 0,
        notes: ""
      },
      cityReview: {
        required: true,
        neutralHumanReviewer: false,
        reviewerIsAuthorOrAgent: "needs-review",
        buildingsRoadsWindowsCrosswalksLightsPropsVisible: false,
        dayNightStateEvidenceVisible: false,
        scaleCuesReadable: false,
        score: 0,
        notes: ""
      },
      screenshots: records.map((record) => ({
        ...record,
        verdict: "needs-review",
        score: 0,
        visiblePromptMatch: false,
        comparedToRawThreeJs: "not-reviewed",
        placeholderProgrammerArt: "needs-review",
        notes: ""
      }))
    }, null, 2)}\n`);
    return { pass: !required, required, reviewPath, templatePath, status: required ? "missing-required-review" : "template-written" };
  }
  const review = JSON.parse(readFileSync(reviewPath, "utf8"));
  const failures = [];
  if (required && records.length !== requiredScreenshotFiles.length) {
    failures.push(`human review screenshot count mismatch: expected ${requiredScreenshotFiles.length}, got ${records.length}`);
  }
  if (review.schema !== "aura3d-human-review/1.0") failures.push("invalid schema");
  if (!Date.parse(review.reviewedAt)) failures.push("invalid reviewedAt");
  if (!String(review.reviewer ?? "").trim()) failures.push("missing reviewer");
  if (required && review.reviewerType !== "neutral-human") failures.push("human review must identify reviewerType as neutral-human");
  if (required && review.reviewerAffiliation !== "independent") failures.push("human review must identify reviewerAffiliation as independent");
  if (!["pass", "fail", "needs-work"].includes(review.verdict)) failures.push("invalid verdict");
  if (required && review.verdict !== "pass") failures.push("global human review verdict is not pass");
  if (review.verdict === "pass" && hasDisqualifyingReviewLanguage(`${review.notes ?? ""}`)) {
    failures.push("passing global review notes contain toy/demo/placeholder rejection language");
  }
  const humanoidRecords = records.filter((record) => /humanoid/i.test(basename(record.file)));
  const materialRecords = records.filter((record) => /material/i.test(basename(record.file)));
  const productRecords = records.filter((record) => /product/i.test(basename(record.file)));
  const physicsRecords = records.filter((record) => /physics/i.test(basename(record.file)));
  const particleRecords = records.filter((record) => /particle/i.test(basename(record.file)));
  const solarRecords = records.filter((record) => /solar/i.test(basename(record.file)));
  const neonRecords = records.filter((record) => /neon/i.test(basename(record.file)));
  const dataRecords = records.filter((record) => /data/i.test(basename(record.file)));
  const miniGolfRecords = records.filter((record) => /mini[- ]golf/i.test(basename(record.file)));
  const cityRecords = records.filter((record) => /city/i.test(basename(record.file)));
  if (required && humanoidRecords.length > 0) {
    const humanoidReview = review.humanoidReview ?? {};
    const humanoidBooleanChecks = [
      ["neutralHumanReviewer", "humanoid neutral-human review was not confirmed"],
      ["thumbnailReadableConnectedCharacter", "humanoid thumbnail readability was not confirmed"],
      ["noDetachedLimbs", "humanoid detached-limb rejection was not confirmed"],
      ["noBrokenJointChains", "humanoid joint-chain continuity was not confirmed"],
      ["handsAndFeetVisible", "humanoid hands/feet visibility was not confirmed"],
      ["groundingShadowVisible", "humanoid grounding shadow was not confirmed"]
    ];
    for (const [field, message] of humanoidBooleanChecks) {
      if (humanoidReview[field] !== true) failures.push(message);
    }
    if (humanoidReview.reviewerIsAuthorOrAgent !== false) failures.push("humanoid review must be from a neutral human who is not the author or an agent");
    if (Number(humanoidReview.score ?? 0) < 4) failures.push("humanoid neutral human score below 4");
    const humanoidReviewText = `${humanoidReview.statement ?? ""} ${humanoidReview.notes ?? ""}`;
    if (!/no longer looks like placeholder programmer art/i.test(humanoidReviewText)) {
      failures.push(`humanoid neutral review is missing required statement: ${humanoidNeutralReviewStatement}`);
    }
    if (hasDisqualifyingReviewLanguage(`${humanoidReview.notes ?? ""}`)) {
      failures.push("passing humanoid neutral review notes contain toy/demo/placeholder rejection language");
    }
  }
  if (required && materialRecords.length > 0) {
    const materialReview = review.materialReview ?? {};
    const materialBooleanChecks = [
      ["neutralHumanReviewer", "material neutral-human review was not confirmed"],
      ["metalIdentifiedWithoutLabels", "material review did not confirm metal is identifiable without labels"],
      ["glassIdentifiedWithoutLabels", "material review did not confirm glass is identifiable without labels"],
      ["rubberIdentifiedWithoutLabels", "material review did not confirm rubber is identifiable without labels"],
      ["emissiveIdentifiedWithoutLabels", "material review did not confirm emissive material is identifiable without labels"],
      ["clearcoatIdentifiedWithoutLabels", "material review did not confirm clearcoat is identifiable without labels"],
      ["exposureControlled", "material review did not confirm controlled exposure"]
    ];
    for (const [field, message] of materialBooleanChecks) {
      if (materialReview[field] !== true) failures.push(message);
    }
    if (materialReview.reviewerIsAuthorOrAgent !== false) failures.push("material review must be from a neutral human who is not the author or an agent");
    if (Number(materialReview.score ?? 0) < 4) failures.push("material neutral human score below 4");
    if (hasDisqualifyingMaterialReviewLanguage(`${materialReview.notes ?? ""}`)) {
      failures.push("passing material neutral review notes contain washed-out/indistinguishable rejection language");
    }
  }
  if (required && productRecords.length > 0) {
    const productReview = review.productReview ?? {};
    const productBooleanChecks = [
      ["neutralHumanReviewer", "product neutral-human review was not confirmed"],
      ["centeredGroundedStudioLitSneaker", "product review did not confirm a centered, grounded, studio-lit sneaker"],
      ["productPhotographyStage", "product review did not confirm product-photography staging"],
      ["notBoxRoom", "product review did not reject box-room staging"]
    ];
    for (const [field, message] of productBooleanChecks) {
      if (productReview[field] !== true) failures.push(message);
    }
    if (productReview.reviewerIsAuthorOrAgent !== false) failures.push("product review must be from a neutral human who is not the author or an agent");
    if (Number(productReview.score ?? 0) < 4) failures.push("product neutral human score below 4");
    if (hasDisqualifyingProductReviewLanguage(`${productReview.notes ?? ""}`)) {
      failures.push("passing product neutral review notes contain box-room/unreadable rejection language");
    }
  }
  failures.push(...validateSceneFamilyReview(review, required, physicsRecords, "physicsReview", "physics", [
    ["contactPhysicsStateVisible", "physics review did not confirm visible contact/physics state"],
    ["notToyLike", "physics review did not reject toy-like output"],
    ["atLeastAsPolishedAsRawThreeJs", "physics review did not confirm parity with the raw Three.js reference"]
  ], hasDisqualifyingPhysicsReviewLanguage));
  failures.push(...validateSceneFamilyReview(review, required, particleRecords, "particleReview", "particle", [
    ["texturedGlowingLifetimeVariationVisible", "particle review did not confirm textured/glowing/lifetime-varied particles"],
    ["emitterGroundSplashEmissionUiVisible", "particle review did not confirm emitter, ground/splash context, and emission UI"],
    ["notWhitePointNoise", "particle review did not reject white point-noise output"]
  ], hasDisqualifyingParticleReviewLanguage));
  failures.push(...validateSceneFamilyReview(review, required, solarRecords, "solarReview", "solar", [
    ["sunSixPlanetsOrbitsLabelsStarfieldVisible", "solar review did not confirm sun, six planets, orbits, labels, and starfield"],
    ["labelsReadableAttached", "solar review did not confirm readable attached labels"],
    ["depthScaleCuesVisible", "solar review did not confirm scale/depth cues"]
  ], hasDisqualifyingSolarReviewLanguage));
  failures.push(...validateSceneFamilyReview(review, required, neonRecords, "neonReview", "neon", [
    ["controlledBloomTunnelDepthVisible", "neon review did not confirm controlled bloom and tunnel depth"],
    ["notOverexposed", "neon review did not reject overexposure"],
    ["ringDepthVisible", "neon review did not confirm foreground/mid/background ring depth"]
  ], hasDisqualifyingNeonReviewLanguage));
  failures.push(...validateSceneFamilyReview(review, required, dataRecords, "dataReview", "data", [
    ["axesTicksTitleLegendValuesHoverVisible", "data review did not confirm axes, ticks, title, legend, values, and hover state"],
    ["noFloatingOrphans", "data review did not reject floating orphan geometry"],
    ["readsAsRealChart", "data review did not confirm the output reads as a real chart"]
  ], hasDisqualifyingDataReviewLanguage));
  failures.push(...validateSceneFamilyReview(review, required, miniGolfRecords, "miniGolfReview", "mini-golf", [
    ["playableHoleVisible", "mini-golf review did not confirm a playable hole"],
    ["requiredGameplayElementsVisible", "mini-golf review did not confirm ball, cup, obstacle, rail, score, aim/power, and shot state"],
    ["notRandomPrimitivesOnFlatPlane", "mini-golf review did not reject random primitives on a flat green plane"]
  ], hasDisqualifyingMiniGolfReviewLanguage));
  failures.push(...validateSceneFamilyReview(review, required, cityRecords, "cityReview", "city", [
    ["buildingsRoadsWindowsCrosswalksLightsPropsVisible", "city review did not confirm buildings, roads, windows, crosswalks, lights, and props"],
    ["dayNightStateEvidenceVisible", "city review did not confirm day/night state evidence"],
    ["scaleCuesReadable", "city review did not confirm readable scale cues"]
  ], hasDisqualifyingCityReviewLanguage));
  const reviewed = new Map((review.screenshots ?? []).map((entry) => [entry.file, entry]));
  for (const record of records) {
    const entry = reviewed.get(record.file);
    if (!entry) failures.push(`missing screenshot review: ${record.file}`);
    else if (entry.modifiedAt !== record.modifiedAt) failures.push(`stale screenshot timestamp: ${record.file}`);
    else if (entry.verdict !== "pass") failures.push(`screenshot review verdict is not pass: ${record.file}`);
    else if (Number(entry.score ?? 0) < 4) failures.push(`screenshot human score below 4: ${record.file}`);
    else if (entry.visiblePromptMatch !== true) failures.push(`screenshot prompt match was not confirmed: ${record.file}`);
    else if (!["better", "at-least-as-good", "not-applicable"].includes(entry.comparedToRawThreeJs)) failures.push(`missing raw Three.js comparison result: ${record.file}`);
    else if (entry.comparedToRawThreeJs === "not-applicable" && !/asset audit|context|not comparable/i.test(`${entry.notes ?? ""}`)) failures.push(`raw Three.js comparison marked not-applicable without justification: ${record.file}`);
    else if (/humanoid/i.test(basename(record.file)) && entry.placeholderProgrammerArt !== false) failures.push(`humanoid review did not explicitly reject placeholder/programmer-art status: ${record.file}`);
    else if (/humanoid/i.test(basename(record.file)) && !/no longer looks like placeholder programmer art/i.test(`${entry.notes ?? ""}`)) failures.push(`humanoid review is missing required acceptance sentence: ${record.file}`);
    else if (entry.verdict === "pass" && hasDisqualifyingReviewLanguage(`${entry.notes ?? ""}`)) {
      failures.push(`passing screenshot review notes contain rejection language: ${record.file}`);
    }
  }
  return { pass: failures.length === 0, required, reviewPath, status: failures.length === 0 ? "review-valid" : "review-invalid", failures };
}

function validateSceneFamilyReview(review, required, records, sectionName, label, booleanChecks, disqualifier) {
  if (!required || records.length === 0) return [];
  const failures = [];
  const section = review[sectionName] ?? {};
  if (section.neutralHumanReviewer !== true) failures.push(`${label} neutral-human review was not confirmed`);
  if (section.reviewerIsAuthorOrAgent !== false) failures.push(`${label} review must be from a neutral human who is not the author or an agent`);
  if (Number(section.score ?? 0) < 4) failures.push(`${label} neutral human score below 4`);
  for (const [field, message] of booleanChecks) {
    if (section[field] !== true) failures.push(message);
  }
  if (disqualifier(`${section.notes ?? ""}`)) failures.push(`passing ${label} neutral review notes contain rejection language`);
  return failures;
}

function hasDisqualifyingReviewLanguage(value) {
  const text = String(value ?? "");
  if (/\b(toy|demo)\b/i.test(text)) return true;
  if (/\bstill\s+(looks?\s+)?like\s+placeholder\b/i.test(text)) return true;
  return /\bplaceholder\b/i.test(text) && !/no longer looks like placeholder programmer art/i.test(text);
}

function hasDisqualifyingMaterialReviewLanguage(value) {
  return /\b(washed[- ]?out|blown[- ]?out|overexposed|indistinguishable|identical|invisible)\b/i.test(String(value ?? ""));
}

function hasDisqualifyingProductReviewLanguage(value) {
  return /\b(box[- ]?room|unreadable|floating|not grounded|toy|demo)\b/i.test(String(value ?? ""));
}

function hasDisqualifyingPhysicsReviewLanguage(value) {
  return /\b(toy[- ]?like|toy|demo|no contact|floating|not polished|worse than raw)\b/i.test(String(value ?? ""));
}

function hasDisqualifyingParticleReviewLanguage(value) {
  return /\b(white point noise|point noise|no emitter|no ground|no splash|invisible|washed[- ]?out)\b/i.test(String(value ?? ""));
}

function hasDisqualifyingSolarReviewLanguage(value) {
  return /\b(stray boxes|stray bars|unreadable labels|detached labels|missing planet|missing orbit|flat)\b/i.test(String(value ?? ""));
}

function hasDisqualifyingNeonReviewLanguage(value) {
  return /\b(white screen|blown[- ]?out|overexposed|no tunnel|flat portal|missing rings)\b/i.test(String(value ?? ""));
}

function hasDisqualifyingDataReviewLanguage(value) {
  return /\b(decorative bars|generic pastel|floating orphan|orphan geometry|unreadable|not a chart)\b/i.test(String(value ?? ""));
}

function hasDisqualifyingMiniGolfReviewLanguage(value) {
  return /\b(random primitives|flat green plane|not playable|missing ball|missing cup|missing score|toy|demo)\b/i.test(String(value ?? ""));
}

function hasDisqualifyingCityReviewLanguage(value) {
  return /\b(no streets|missing roads|missing windows|missing crosswalks|no day.?night|toy|demo|unreadable)\b/i.test(String(value ?? ""));
}

function parseTimestampArg(value) {
  if (value === undefined) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    parsed[key] = value;
  }
  return parsed;
}

#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "../..");
const baselineRoot = resolve(repoRoot, "tests/reports/final-competitive-baseline");
const outputRelativeRoot = "tests/reports/flagship-visual-comparison";
const outputRoot = resolve(repoRoot, outputRelativeRoot);
const verifyOnly = process.argv.includes("--verify");

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function allFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = join(root, entry.name);
    if (entry.isDirectory()) files.push(...allFiles(child));
    else files.push(child);
  }
  return files.sort();
}

function imageDimensions(path) {
  const value = execFileSync("magick", ["identify", "-format", "%w %h", path], {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();
  const [width, height] = value.split(/\s+/).map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Cannot read dimensions for ${relative(repoRoot, path)}`);
  }
  return { width, height };
}

function ocrRegions(path, dimensions) {
  const tsv = execFileSync("tesseract", [path, "stdout", "--psm", "11", "tsv"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"]
  });
  return tsv
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((cells) => cells.length >= 12)
    .flatMap((cells) => {
      const confidence = Number(cells[10]);
      const text = cells.slice(11).join("\t").trim();
      if (!text || confidence < 20) return [];
      const left = Number(cells[6]);
      const top = Number(cells[7]);
      const width = Number(cells[8]);
      const height = Number(cells[9]);
      if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return [];
      const margin = Math.max(3, Math.ceil(height * 0.2));
      const x = Math.max(0, left - margin);
      const y = Math.max(0, top - margin);
      return [{
        x,
        y,
        width: Math.min(dimensions.width - x, width + margin * 2),
        height: Math.min(dimensions.height - y, height + margin * 2),
        source: "after-ocr",
        confidence,
        textSha256: sha256Buffer(Buffer.from(text))
      }];
    });
}

function writeUnionMask(path, dimensions, regions) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">`,
    `<rect width="${dimensions.width}" height="${dimensions.height}" fill="white"/>`,
    ...regions.map((region) => `<rect x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" rx="3" fill="black"/>`),
    "</svg>"
  ].join("\n");
  writeFileSync(path, svg);
}

function applyMask(source, mask, destination) {
  execFileSync("magick", [
    source,
    mask,
    "-alpha", "off",
    "-compose", "copy_opacity",
    "-composite",
    "-background", "#050709",
    "-alpha", "remove",
    "-alpha", "off",
    "-strip",
    destination
  ], { cwd: repoRoot });
}

function comparisonMetric(metric, before, after, extraArgs = []) {
  const result = spawnSync("magick", ["compare", "-metric", metric, ...extraArgs, before, after, "null:"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`ImageMagick ${metric} failed: ${result.stderr || result.stdout}`);
  }
  const raw = `${result.stderr}${result.stdout}`.trim();
  const match = raw.match(/^([0-9.eE+-]+)(?:\s+\(([0-9.eE+-]+)\))?/);
  if (!match) throw new Error(`Cannot parse ImageMagick ${metric}: ${raw}`);
  return { absolute: Number(match[1]), normalized: match[2] === undefined ? null : Number(match[2]), raw };
}

function unmaskedPixels(mask, dimensions) {
  const mean = Number(execFileSync("magick", [mask, "-colorspace", "Gray", "-format", "%[fx:mean]", "info:"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim());
  if (!Number.isFinite(mean)) throw new Error(`Cannot measure ${mask}`);
  return Math.round(dimensions.width * dimensions.height * mean);
}

function generateDiff(before, after, destination) {
  const result = spawnSync("magick", [
    "compare",
    "-metric", "AE",
    "-fuzz", "3%",
    "-highlight-color", "#ff3565",
    "-lowlight-color", "#10151b",
    before,
    after,
    destination
  ], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`Cannot generate diff: ${result.stderr || result.stdout}`);
  }
}

function verify() {
  const manifestPath = join(outputRoot, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Missing ${relative(repoRoot, manifestPath)}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const failures = [];
  for (const artifact of manifest.artifacts ?? []) {
    const absolute = resolve(outputRoot, artifact.path);
    if (!existsSync(absolute)) failures.push(`missing:${artifact.path}`);
    else if (sha256File(absolute) !== artifact.sha256) failures.push(`hash:${artifact.path}`);
  }
  if (failures.length > 0) throw new Error(`Comparison verification failed: ${failures.join(", ")}`);
  console.log(JSON.stringify({ pass: true, artifacts: manifest.artifacts.length, manifest: `${outputRelativeRoot}/manifest.json` }, null, 2));
}

function generate() {
  if (existsSync(outputRoot)) {
    throw new Error(`${outputRelativeRoot} already exists. Verify it with --verify; remove only this generated directory before an intentional recapture.`);
  }
  const baselineManifestPath = join(baselineRoot, "manifest.json");
  if (!existsSync(baselineManifestPath)) throw new Error("Immutable final competitive baseline is missing");
  const baseline = JSON.parse(readFileSync(baselineManifestPath, "utf8"));
  const scratchRoot = mkdtempSync(resolve(repoRoot, "tests/reports/.flagship-visual-comparison-"));
  try {
    const stagedRoot = join(scratchRoot, "output");
    mkdirSync(join(stagedRoot, "routes"), { recursive: true });
    const records = [];

    for (const baselineImage of baseline.images) {
      const routeId = baselineImage.routeId;
      const receiptPath = resolve(repoRoot, `tests/reports/showcase-interaction-audit/${routeId}.json`);
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      const desktop = receipt.viewportVariants?.find((entry) => entry.label === "desktop");
      if (!desktop) throw new Error(`${routeId} has no desktop viewport receipt`);
      const before = resolve(baselineRoot, baselineImage.beforePath);
      const after = resolve(repoRoot, desktop.path);
      if (desktop.sha256 !== `sha256-${sha256File(after)}`) throw new Error(`${desktop.path} differs from its audit receipt`);
      const beforeDimensions = imageDimensions(before);
      const afterDimensions = imageDimensions(after);
      if (beforeDimensions.width !== afterDimensions.width || beforeDimensions.height !== afterDimensions.height) {
        throw new Error(`${routeId} dimensions differ: ${JSON.stringify({ beforeDimensions, afterDimensions })}`);
      }

      const routeRoot = join(stagedRoot, "routes", routeId);
      mkdirSync(routeRoot, { recursive: true });
      const regions = [
        ...baselineImage.mask.regions.map((region) => ({ ...region, source: `before-${region.source}` })),
        ...ocrRegions(after, afterDimensions)
      ];
      const maskPath = join(routeRoot, "union-text-hud-mask.svg");
      writeUnionMask(maskPath, afterDimensions, regions);
      const beforeMasked = join(routeRoot, "before-masked.png");
      const afterMasked = join(routeRoot, "after-masked.png");
      applyMask(before, maskPath, beforeMasked);
      applyMask(after, maskPath, afterMasked);
      const scenePixels = unmaskedPixels(maskPath, afterDimensions);
      const ae = comparisonMetric("AE", beforeMasked, afterMasked, ["-fuzz", "3%"]);
      const mae = comparisonMetric("MAE", beforeMasked, afterMasked);
      const rmse = comparisonMetric("RMSE", beforeMasked, afterMasked);
      const changedScenePixels = Math.round(ae.absolute);
      const diff = join(routeRoot, "diff-3pct.png");
      generateDiff(beforeMasked, afterMasked, diff);
      const sideBySide = join(routeRoot, "before-after-masked.png");
      execFileSync("magick", [beforeMasked, afterMasked, "+append", "-strip", sideBySide], { cwd: repoRoot });
      const originalAfter = join(routeRoot, "after-desktop.png");
      copyFileSync(after, originalAfter);

      records.push({
        routeId,
        source: {
          beforePath: relative(repoRoot, before),
          beforeSha256: sha256File(before),
          afterPath: desktop.path,
          afterSha256: sha256File(after),
          routeSourceFingerprint: receipt.sourceFingerprint,
          configurationFingerprint: receipt.configurationFingerprint,
          generatedAt: receipt.generatedAt
        },
        mask: {
          policy: "The same union of immutable-before HUD/OCR regions and current-after OCR regions is applied to both images.",
          dimensions: afterDimensions,
          regions: regions.length,
          beforeRegionCount: baselineImage.mask.regions.length,
          afterOcrRegionCount: regions.filter((region) => region.source === "after-ocr").length,
          unmaskedScenePixels: scenePixels
        },
        metrics: {
          tolerance: "3% ImageMagick fuzz for changed-pixel count",
          changedScenePixels,
          changedScenePixelRatio: scenePixels === 0 ? 0 : changedScenePixels / scenePixels,
          meanAbsoluteError: mae,
          rootMeanSquareError: rmse,
          interpretation: "Difference magnitude only. It proves material visual change after common masking; manual review determines whether the change is an improvement."
        },
        artifacts: {
          mask: relative(stagedRoot, maskPath),
          beforeMasked: relative(stagedRoot, beforeMasked),
          afterMasked: relative(stagedRoot, afterMasked),
          diff: relative(stagedRoot, diff),
          sideBySide: relative(stagedRoot, sideBySide),
          afterDesktop: relative(stagedRoot, originalAfter)
        }
      });
    }

    const manifest = {
      schema: "aura3d.flagship-visual-comparison/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tools/flagship-visual-comparison/index.mjs",
      claimBoundary: "Common-mask before/after visual-change evidence only. Metrics do not prove aesthetic improvement, current Three.js parity, independent approval, or release readiness.",
      baseline: {
        manifestPath: relative(repoRoot, baselineManifestPath),
        manifestSha256: sha256File(baselineManifestPath),
        candidateCommit: baseline.repository.candidateCommit,
        immutable: baseline.immutable === true
      },
      currentCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(),
      routes: records
    };
    writeFileSync(join(stagedRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    manifest.artifacts = allFiles(stagedRoot)
      .filter((path) => basename(path) !== "manifest.json")
      .map((path) => ({ path: relative(stagedRoot, path), sha256: sha256File(path), bytes: statSync(path).size }));
    writeFileSync(join(stagedRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(stagedRoot, outputRoot);
    console.log(JSON.stringify({ pass: true, routes: records.length, artifacts: manifest.artifacts.length, manifest: `${outputRelativeRoot}/manifest.json` }, null, 2));
  } finally {
    if (existsSync(scratchRoot)) rmSync(scratchRoot, { recursive: true });
  }
}

if (verifyOnly) verify();
else generate();

#!/usr/bin/env node

import { execFileSync } from "node:child_process";
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
const outputRelativeRoot = "tests/reports/final-competitive-baseline";
const outputRoot = resolve(repoRoot, outputRelativeRoot);
const verifyOnly = process.argv.includes("--verify");
const candidateCommit = "48fc6b87bdcffd15ee17d2221243bb9dc102ee65";
const executionPrdCommit = "6f233c1be8c953102c735ebc26383d78bfb25a61";
const artifactSourceCommit = "f83d6edcc334fb6a8a6b64d0fc0a30b65c03e338";
const routes = [
  {
    id: "showcase-product-configurator",
    hudRegions: [
      { x: 12, y: 12, width: 360, height: 390 },
      { x: 1050, y: 12, width: 378, height: 285 },
      { x: 170, y: 748, width: 1100, height: 140 }
    ]
  },
  {
    id: "showcase-smart-city-control",
    hudRegions: [
      { x: 0, y: 0, width: 1440, height: 82 },
      { x: 0, y: 650, width: 420, height: 250 },
      { x: 1040, y: 520, width: 400, height: 380 }
    ]
  },
  {
    id: "showcase-cinematic-architecture",
    hudRegions: [
      { x: 1060, y: 0, width: 380, height: 900 }
    ]
  },
  {
    id: "showcase-digital-twin-ops",
    hudRegions: [
      { x: 0, y: 0, width: 1440, height: 105 },
      { x: 1080, y: 0, width: 360, height: 900 }
    ]
  }
];
const snapshotInputs = [
  "tests/reports/package-graph.json",
  "tests/reports/exports.json",
  "tests/reports/public-api-contract.json",
  "tests/reports/negative-complexity.json",
  "tests/reports/route-tiers/report.json",
  "tests/reports/bundle-scenarios.json",
  "tests/reports/bundle-size.json",
  "tests/reports/production-path-benchmark.json",
  "docs/project/showcase-visual-review.json",
  ...routes.map((route) => `tests/reports/showcase-interaction-audit/${route.id}.json`)
];

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function gitBytes(commit, path) {
  return execFileSync("git", ["show", `${commit}:${path}`], { cwd: repoRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
}

function trackedRouteSources(commit, routeId) {
  const root = `apps/${routeId}`;
  const paths = git("ls-tree", "-r", "--name-only", commit, "--", root)
    .split("\n")
    .filter(Boolean)
    .filter((path) => !path.includes("/dist/") && !path.includes("/node_modules/"));
  return paths.map((path) => ({ path, sha256: sha256Buffer(gitBytes(commit, path)) }));
}

function executableVersion(command, args) {
  return execFileSync(command, args, { cwd: repoRoot, encoding: "utf8" }).split("\n")[0].trim();
}

function imageDimensions(path) {
  const value = execFileSync("magick", ["identify", "-format", "%w %h", path], { cwd: repoRoot, encoding: "utf8" }).trim();
  const [width, height] = value.split(/\s+/).map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error(`Cannot read dimensions for ${path}`);
  return { width, height };
}

function ocrRegions(path, dimensions) {
  const tsv = execFileSync("tesseract", [path, "stdout", "--psm", "11", "tsv"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"]
  });
  return tsv.split("\n").slice(1).map((line) => line.split("\t")).filter((cells) => cells.length >= 12).flatMap((cells) => {
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
      source: "ocr",
      confidence,
      textSha256: sha256Buffer(Buffer.from(text))
    }];
  });
}

function maskImage(source, destination, route, scratchRoot) {
  const dimensions = imageDimensions(source);
  const regions = [
    ...route.hudRegions.map((region) => ({ ...region, source: "known-hud" })),
    ...ocrRegions(source, dimensions)
  ];
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">`,
    ...regions.map((region) => `<rect x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" rx="3" fill="#050709" fill-opacity="0.985"/>`),
    "</svg>"
  ].join("\n");
  const maskPath = join(scratchRoot, `${route.id}-mask.svg`);
  writeFileSync(maskPath, svg);
  execFileSync("magick", [source, "(", "-background", "none", maskPath, ")", "-compose", "over", "-composite", "-strip", "-define", "png:color-type=6", destination], { cwd: repoRoot });
  return {
    dimensions,
    regionCount: regions.length,
    knownHudRegionCount: route.hudRegions.length,
    ocrRegionCount: regions.filter((region) => region.source === "ocr").length,
    regions
  };
}

function summarizeJson(relativePath) {
  const value = JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
  return {
    schema: value.schema ?? null,
    pass: value.pass ?? value.ok ?? null,
    generatedAt: value.generatedAt ?? null,
    failures: Array.isArray(value.failures) ? value.failures.length : null,
    checks: Array.isArray(value.checks) ? value.checks.length : null
  };
}

function copySnapshot(relativePath, targetRoot) {
  const source = resolve(repoRoot, relativePath);
  if (!existsSync(source)) throw new Error(`Missing baseline input: ${relativePath}`);
  const destination = join(targetRoot, "snapshot", relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return {
    sourcePath: relativePath,
    snapshotPath: relative(targetRoot, destination),
    sha256: sha256File(destination),
    bytes: statSync(destination).size,
    summary: relativePath.endsWith(".json") ? summarizeJson(relativePath) : null
  };
}

function allFiles(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = join(root, entry.name);
    if (entry.isDirectory()) result.push(...allFiles(child));
    else result.push(child);
  }
  return result.sort();
}

function verify() {
  const manifestPath = join(outputRoot, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Missing ${relative(repoRoot, manifestPath)}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const failures = [];
  for (const artifact of manifest.artifacts) {
    const absolute = resolve(outputRoot, artifact.path);
    if (!existsSync(absolute)) failures.push(`missing:${artifact.path}`);
    else if (sha256File(absolute) !== artifact.sha256) failures.push(`hash:${artifact.path}`);
  }
  if (failures.length > 0) throw new Error(`Baseline verification failed: ${failures.join(", ")}`);
  console.log(JSON.stringify({ pass: true, artifacts: manifest.artifacts.length, manifest: `${outputRelativeRoot}/manifest.json` }, null, 2));
}

function generate() {
  if (existsSync(outputRoot)) {
    throw new Error(`${outputRelativeRoot} already exists. Verify it with --verify; the immutable before baseline is never overwritten.`);
  }
  for (const commit of [candidateCommit, executionPrdCommit, artifactSourceCommit]) git("cat-file", "-e", `${commit}^{commit}`);
  const scratchRoot = mkdtempSync(resolve(repoRoot, "tests/reports/.final-competitive-baseline-"));
  try {
    const stagedRoot = join(scratchRoot, "output");
    mkdirSync(join(stagedRoot, "before"), { recursive: true });
    const review = JSON.parse(readFileSync(resolve(repoRoot, "docs/project/showcase-visual-review.json"), "utf8"));
    const reviewById = new Map(review.routes.map((route) => [route.id, route]));
    const imageRecords = [];
    const sourceFiles = [];
    for (const route of routes) {
      const reviewRoute = reviewById.get(route.id);
      if (!reviewRoute) throw new Error(`Visual review does not contain ${route.id}`);
      const desktop = reviewRoute.screenshots.find((screenshot) => screenshot.kind === "desktop");
      if (!desktop) throw new Error(`Visual review has no desktop screenshot for ${route.id}`);
      const source = resolve(repoRoot, desktop.path);
      const sourceHash = sha256File(source);
      if (desktop.sha256 !== `sha256-${sourceHash}`) throw new Error(`${desktop.path} differs from the hash-bound visual review`);
      const beforePath = join(stagedRoot, "before", `${route.id}-desktop.png`);
      const maskedPath = join(stagedRoot, "before", `${route.id}-desktop-text-hud-masked.png`);
      copyFileSync(source, beforePath);
      const mask = maskImage(source, maskedPath, route, scratchRoot);
      imageRecords.push({
        routeId: route.id,
        sourcePath: desktop.path,
        sourceProvenance: "generated evidence bound by docs/project/showcase-visual-review.json; the PNG is intentionally not Git source",
        reviewSha256: desktop.sha256,
        sourceSha256: sourceHash,
        beforePath: relative(stagedRoot, beforePath),
        beforeSha256: sha256File(beforePath),
        maskedPath: relative(stagedRoot, maskedPath),
        maskedSha256: sha256File(maskedPath),
        mask
      });
      sourceFiles.push(...trackedRouteSources(candidateCommit, route.id));
    }
    const snapshots = snapshotInputs.map((path) => copySnapshot(path, stagedRoot));
    const negative = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/negative-complexity.json"), "utf8"));
    const packageGraph = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/package-graph.json"), "utf8"));
    const exportsReport = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/exports.json"), "utf8"));
    const routeTiers = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/route-tiers/report.json"), "utf8"));
    const manifest = {
      schema: "aura3d.final-competitive-before-baseline/1.0",
      generatedAt: new Date().toISOString(),
      immutable: true,
      claimBoundary: "Rejected before-state and technical baseline only. These artifacts do not approve visual quality or prove current Three.js parity.",
      repository: {
        candidateCommit,
        executionPrdCommit,
        artifactSourceCommit,
        branchAtCapture: "main",
        implementationStartClean: true,
        implementationStartCleanEvidence: "Immediately after commit 6f233c1b, git status --short emitted zero lines before Phase 0 implementation edits began."
      },
      metrics: {
        packageCount: packageGraph.packageCount,
        packageGraphEdges: packageGraph.edges.length,
        publicPackageCount: exportsReport.packages.length,
        packageSourceLines: negative.current.packageSourceLines,
        templateScaffoldLines: negative.current.templateScaffoldLines,
        r12DuplicateOwnershipViolations: negative.current.duplicateOwnershipViolations,
        routes: negative.current.routes,
        classifiedRoutes: routeTiers.rows?.length ?? routeTiers.routes?.length ?? null,
        rootExportSubpaths: negative.current.rootExportSubpaths,
        engineBarrelExports: negative.current.engineBarrelExports
      },
      images: imageRecords,
      sourceFiles: sourceFiles.sort((left, right) => left.path.localeCompare(right.path)),
      snapshots,
      tools: {
        imageMagick: executableVersion("magick", ["--version"]),
        tesseract: executableVersion("tesseract", ["--version"]),
        maskPolicy: "Known HUD panels plus Tesseract word boxes at confidence >=20; masks remove text/UI evidence so later visual comparison must stand on rendered scene content."
      }
    };
    writeFileSync(join(stagedRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    manifest.artifacts = allFiles(stagedRoot)
      .filter((path) => basename(path) !== "manifest.json")
      .map((path) => ({ path: relative(stagedRoot, path), sha256: sha256File(path), bytes: statSync(path).size }));
    writeFileSync(join(stagedRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(stagedRoot, outputRoot);
    console.log(JSON.stringify({ pass: true, routes: imageRecords.length, sourceFiles: sourceFiles.length, snapshots: snapshots.length, artifacts: manifest.artifacts.length, manifest: `${outputRelativeRoot}/manifest.json` }, null, 2));
  } finally {
    if (existsSync(scratchRoot)) rmSync(scratchRoot, { recursive: true });
  }
}

if (verifyOnly) verify();
else generate();

#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const tarball = resolve(args.tarball ?? "");
const roundRoot = args.roundRoot ? resolve(args.roundRoot) : null;
const writeReport = args.writeReport !== "false";

if (!tarball || !existsSync(tarball)) {
  console.error("Usage: node benchmark/runner/tarball-audit.mjs --tarball=<package.tgz> [--round-root=<round-dir>]");
  process.exit(2);
}

const requiredFiles = [
  "package/dist/engine/index.js",
  "package/dist/engine/index.d.ts",
  "package/dist/engine/agent-api/index.js",
  "package/dist/engine/agent-api/index.d.ts",
  "package/dist/engine/agent-api/assets/player-fixture.glb"
];

const helperMarkers = [
  "createAuraApp",
  "collectAuraSceneEvidence",
  "definePromptPlan",
  "compilePromptPlan",
  "promptPlanToScene",
  "prefabs",
  "physicsPlayground",
  "particleFountain",
  "solarSystem",
  "neonTunnel",
  "dataBars3D",
  "miniGolfHole",
  "miniGolfCourse",
  "materialSwatches",
  "cityBlock",
  "lowPolyHumanoid",
  "builtInHumanoidAsset",
  "primitiveHumanoid",
  "productStage",
  "character",
  "charts",
  "particles",
  "neon",
  "product",
  "solar",
  "sceneKits",
  "games",
  "ui",
  "lights",
  "material",
  "effects",
  "environments",
  "physics"
];

const startedAt = new Date();
const extractRoot = mkdtempSync(join(tmpdir(), "aura3d-tarball-audit-"));
const checks = [];

try {
  execFileSync("tar", ["-xzf", tarball, "-C", extractRoot], { stdio: "pipe" });

  for (const file of requiredFiles) {
    checks.push({
      id: `required-file:${file}`,
      pass: existsSync(join(extractRoot, file)),
      detail: existsSync(join(extractRoot, file)) ? "present" : "missing"
    });
  }

  const agentApiDistPath = join(extractRoot, "package/dist/engine/agent-api/index.js");
  const agentApiText = existsSync(agentApiDistPath) ? readFileSync(agentApiDistPath, "utf8") : "";
  for (const marker of helperMarkers) {
    checks.push({
      id: `helper-marker:${marker}`,
      pass: agentApiText.includes(marker),
      detail: agentApiText.includes(marker)
        ? `found in package/dist/engine/agent-api/index.js`
        : `missing from package/dist/engine/agent-api/index.js`
    });
  }

  const sourcePath = join(repoRoot, "packages/engine/src/agent-api/index.ts");
  const repoDistPath = join(repoRoot, "dist/engine/agent-api/index.js");
  const sourceStat = statSync(sourcePath);
  const repoDistStat = existsSync(repoDistPath) ? statSync(repoDistPath) : null;
  const distStat = existsSync(agentApiDistPath) ? statSync(agentApiDistPath) : null;
  const repoDistHash = existsSync(repoDistPath) ? sha256File(repoDistPath) : null;
  const packedDistHash = existsSync(agentApiDistPath) ? sha256File(agentApiDistPath) : null;
  const staleRepoDist = repoDistStat ? sourceStat.mtimeMs > repoDistStat.mtimeMs + 1000 : true;
  const packedDistMismatch = Boolean(repoDistHash && packedDistHash && repoDistHash !== packedDistHash);
  checks.push({
    id: "agent-api-dist-not-stale",
    pass: !staleRepoDist && !packedDistMismatch,
    detail: [
      `source mtime=${sourceStat.mtime.toISOString()}`,
      `repo dist mtime=${repoDistStat?.mtime.toISOString() ?? "missing"}`,
      `packed dist mtime=${distStat?.mtime.toISOString() ?? "missing"}`,
      `repo dist hash=${repoDistHash ? `sha256-${repoDistHash}` : "missing"}`,
      `packed dist hash=${packedDistHash ? `sha256-${packedDistHash}` : "missing"}`,
      "note=npm pack normalizes tar entry mtimes, so freshness is proven by repo dist mtime plus packed-vs-repo hash equality"
    ].join(", ")
  });

  const contextManifestHash = hashMany([
    join(repoRoot, "benchmark/context/aura3d/manifest.sha256"),
    join(repoRoot, "benchmark/context/threejs/manifest.sha256")
  ]);
  const git = gitMetadata();
  const report = {
    schema: "a3d-benchmark-tarball-audit/1.0",
    generatedAt: startedAt.toISOString(),
    repoRoot,
    tarball,
    pass: checks.every((check) => check.pass),
    checks,
    metadata: {
      gitSha: git.sha,
      gitDirty: git.dirty,
      gitStatus: git.status,
      buildTimestamp: startedAt.toISOString(),
      packageTarballHash: `sha256-${sha256File(tarball)}`,
      distHelperHash: packedDistHash ? `sha256-${packedDistHash}` : null,
      contextManifestHash: `sha256-${contextManifestHash}`,
      agentApiSourceMtime: sourceStat.mtime.toISOString(),
      agentApiRepoDistMtime: repoDistStat?.mtime.toISOString() ?? null,
      agentApiPackedDistMtime: distStat?.mtime.toISOString() ?? null,
      agentApiRepoDistHash: repoDistHash ? `sha256-${repoDistHash}` : null,
      agentApiPackedDistHash: packedDistHash ? `sha256-${packedDistHash}` : null
    }
  };

  if (writeReport) {
    const reportPath = roundRoot
      ? join(roundRoot, "package-tarball-audit.json")
      : join(dirname(tarball), "package-tarball-audit.json");
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    if (roundRoot) {
      const metadataPath = join(roundRoot, "round-metadata.json");
      writeFileSync(
        metadataPath,
        `${JSON.stringify({
          schema: "a3d-benchmark-round-metadata/1.0",
          generatedAt: report.generatedAt,
          releaseValidation: process.env.AURA3D_NON_RELEASE_VALIDATION === "1" ? false : true,
          packageAudit: report.metadata,
          packageAuditReport: "package-tarball-audit.json"
        }, null, 2)}\n`
      );
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
} finally {
  rmSync(extractRoot, { recursive: true, force: true });
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) parsed[toCamel(match[1])] = match[2];
  }
  return parsed;
}

function toCamel(value) {
  return value.replaceAll(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function hashMany(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function gitMetadata() {
  const rev = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
  return {
    sha: rev.status === 0 ? rev.stdout.trim() : null,
    dirty: status.status === 0 ? status.stdout.trim().length > 0 : null,
    status: status.status === 0 ? status.stdout.trim().split("\n").filter(Boolean) : []
  };
}

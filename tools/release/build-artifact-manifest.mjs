#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadValidatedReleasePlan } from "./exact-release-plan.mjs";

export function buildReleaseArtifactManifest(
  root = process.cwd(),
  planPath = process.env.A3D_RELEASE_PLAN ?? "tests/reports/release-tarballs/release-plan.json"
) {
  const plan = loadValidatedReleasePlan(root, planPath);
  const unpublishedDryRun = plan.dryRun === true
    && plan.packOnly === false
    && plan.targetVersionUnpublished === true
    && plan.packages.every((entry) => entry.unpublished === true);
  const exactPackOnce = plan.packOnly === true
    && plan.dryRun === false
    && plan.targetVersionUnpublished === null;
  if (!unpublishedDryRun && !exactPackOnce) {
    throw new Error("Candidate artifact manifest requires either an unpublished dry-run plan or the exact pack-once plan used for package acceptance.");
  }
  if (plan.schema !== "aura3d-release-plan/1.0" || plan.version !== "3.0.1") {
    throw new Error(`Expected canonical Aura3D 3.0.1 release plan, received ${plan.schema ?? "missing schema"}/${plan.version ?? "missing version"}.`);
  }
  if (plan.packageCount !== 29 || plan.expectedPackageCount !== 29 || plan.packages.length !== 29) {
    throw new Error(`Release plan package count mismatch: ${plan.packages.length}/${plan.expectedPackageCount}.`);
  }

  return {
    schema: "aura3d-release-artifacts/3.0",
    version: plan.version,
    status: "candidate-packed-not-published",
    scope: `Aura3D ${plan.version} exact package rehearsal artifacts; registry, GitHub tag/release, and production website entries are added only after publication succeeds.`,
    createdAt: plan.generatedAt,
    sourceCommit: plan.source.commit,
    sourceFingerprint: plan.source.fingerprint,
    source: plan.source,
    releasePlan: plan.reference,
    artifacts: plan.packages.map((entry) => ({
      type: "tarball",
      name: entry.name,
      version: entry.version,
      pathOrUrl: entry.tarball,
      sha256: entry.sha256,
      integrity: entry.integrity,
      createdAt: plan.generatedAt,
      source: exactPackOnce
        ? "node tools/release/publish-all.mjs --pack-only"
        : "node tools/release/publish-all.mjs --dry-run"
    }))
  };
}

export function writeReleaseArtifactManifest(
  root = process.cwd(),
  planPath = process.env.A3D_RELEASE_PLAN ?? "tests/reports/release-tarballs/release-plan.json",
  outputPath = process.env.A3D_RELEASE_ARTIFACT_MANIFEST ?? "docs/project/release-artifacts.json"
) {
  const manifest = buildReleaseArtifactManifest(root, planPath);
  const output = resolve(root, outputPath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { manifest, output } = writeReleaseArtifactManifest();
  console.log(`Wrote ${manifest.artifacts.length} Aura3D ${manifest.version} candidate artifacts to ${output}`);
}

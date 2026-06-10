#!/usr/bin/env node
// Aura3D release publisher — the checked-in version of the pnpm-pack publish flow.
//
// Why this exists: plain `npm publish` from a package directory ships `workspace:*`
// dependency specifiers verbatim (the bug that broke the 1.3.2 publish until it was
// re-done via `pnpm pack`, which rewrites workspace:* to the real versions). Always
// publish through this script.
//
// Known traps this script handles:
//  1. workspace:* rewriting     — packs with `pnpm pack`, never `npm publish` from the dir.
//  2. create-aura3d tarball     — templates/animation-studio/node_modules is a pnpm
//     symlink farm that `pack` would dereference into a ~722MB tarball; it is moved
//     aside during packing and restored afterwards.
//  3. last-line loss            — package list is built in-process (no `while read`
//     over a file that can silently drop a final line without trailing newline,
//     which left @aura3d/workflows unpublished in 1.3.0).
//  4. registry verification     — after publishing, every package is checked against
//     the registry; the expected count is asserted (26).
//
// Usage:
//   NPM_CONFIG_USERCONFIG=/path/outside/repo/.npmrc node tools/release/publish-all.mjs [--dry-run]
//
// The npm token must live in an .npmrc OUTSIDE the repo (the repo .npmrc is tracked).

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DRY_RUN = process.argv.includes("--dry-run");
const PACK_DIR = join(ROOT, "tests", "reports", "release-tarballs");
const EXPECTED_PUBLIC_COUNT = 26;

function sh(command, options = {}) {
  return execSync(command, { stdio: "pipe", encoding: "utf8", cwd: ROOT, ...options }).trim();
}

function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

// Build the publish list in-process: root @aura3d/engine + every non-private packages/* package.
function collectPublishablePackages() {
  const packages = [{ dir: ROOT, manifest: readManifest(ROOT) }];
  for (const entry of readdirSync(join(ROOT, "packages"))) {
    const dir = join(ROOT, "packages", entry);
    if (!existsSync(join(dir, "package.json"))) continue;
    const manifest = readManifest(dir);
    if (manifest.private === true) continue;
    packages.push({ dir, manifest });
  }
  return packages;
}

const packages = collectPublishablePackages();
if (packages.length !== EXPECTED_PUBLIC_COUNT) {
  console.error(`Expected exactly ${EXPECTED_PUBLIC_COUNT} publishable packages, found ${packages.length}:`);
  for (const { manifest } of packages) console.error(`  - ${manifest.name}@${manifest.version}`);
  process.exit(1);
}

const version = packages[0].manifest.version;
const mismatched = packages.filter(({ manifest }) => manifest.name !== "@aura3d/asset-index" && manifest.version !== version);
if (mismatched.length > 0) {
  console.error(`Version lockstep violated (root is ${version}):`);
  for (const { manifest } of mismatched) console.error(`  - ${manifest.name}@${manifest.version}`);
  process.exit(1);
}

rmSync(PACK_DIR, { recursive: true, force: true });
mkdirSync(PACK_DIR, { recursive: true });

// Trap 2: move the animation-studio template node_modules aside while packing.
const STUDIO_NODE_MODULES = join(ROOT, "packages", "create-aura3d", "templates", "animation-studio", "node_modules");
const STUDIO_NODE_MODULES_ASIDE = `${STUDIO_NODE_MODULES}.publish-aside`;
const hadStudioNodeModules = existsSync(STUDIO_NODE_MODULES);
if (hadStudioNodeModules) renameSync(STUDIO_NODE_MODULES, STUDIO_NODE_MODULES_ASIDE);

const failures = [];
try {
  for (const { dir, manifest } of packages) {
    const label = `${manifest.name}@${manifest.version}`;
    try {
      // Trap 1: pnpm pack rewrites workspace:* to concrete versions.
      const packOutput = sh(`pnpm pack --pack-destination ${JSON.stringify(PACK_DIR)}`, { cwd: dir });
      const tarball = packOutput.split("\n").pop();
      if (!tarball || !existsSync(tarball)) throw new Error(`pack produced no tarball (output: ${packOutput})`);
      if (DRY_RUN) {
        console.log(`[dry-run] packed ${label} -> ${tarball}`);
      } else {
        sh(`npm publish ${JSON.stringify(tarball)} --access public`, { cwd: dir });
        console.log(`published ${label}`);
      }
    } catch (error) {
      failures.push({ label, error: String(error?.message ?? error) });
      console.error(`FAILED ${label}: ${error?.message ?? error}`);
    }
  }
} finally {
  if (hadStudioNodeModules && existsSync(STUDIO_NODE_MODULES_ASIDE)) {
    renameSync(STUDIO_NODE_MODULES_ASIDE, STUDIO_NODE_MODULES);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} package(s) failed to publish. Re-run after fixing; already-published packages will conflict harmlessly.`);
  process.exit(1);
}

// Trap 4: verify against the registry (skipped on dry runs).
if (!DRY_RUN) {
  let verified = 0;
  for (const { dir, manifest } of packages) {
    const expectedVersion = manifest.version;
    try {
      const latest = sh(`npm view ${manifest.name} version`, { cwd: dir });
      if (latest === expectedVersion) {
        verified += 1;
      } else {
        console.error(`registry mismatch: ${manifest.name} latest=${latest}, expected ${expectedVersion}`);
      }
    } catch (error) {
      console.error(`registry check failed for ${manifest.name}: ${error?.message ?? error}`);
    }
  }
  console.log(`\nregistry verification: ${verified}/${EXPECTED_PUBLIC_COUNT} packages at expected versions`);
  if (verified !== EXPECTED_PUBLIC_COUNT) process.exit(1);
}

console.log(DRY_RUN ? "\ndry-run complete." : "\npublish complete.");

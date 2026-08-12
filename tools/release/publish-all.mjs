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
//     the registry; the expected count is asserted (29).
//
// Usage:
//   NPM_CONFIG_USERCONFIG=/path/outside/repo/.npmrc node tools/release/publish-all.mjs [--dry-run]
//
// The npm token must live in an .npmrc OUTSIDE the repo (the repo .npmrc is tracked).
//
//  5. two-factor publishing     — an account with 2FA enforced on publish returns
//     `EOTP` and the whole run halts on the first package. Pass a one-time password
//     through the environment:
//
//       NPM_OTP=123456 node tools/release/publish-all.mjs
//
//     A single OTP is accepted for a short window, which is normally long enough for
//     all 29 packages; if it expires mid-run, re-run with a fresh code and the
//     "already published" branch below skips whatever already landed. The OTP is read
//     from the environment and never logged: `--otp` is appended to the argv of the
//     child process only.

import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DRY_RUN = process.argv.includes("--dry-run");
// Never hardcode or log this. It is a short-lived one-time password, not a token.
const NPM_OTP = process.env.NPM_OTP?.trim() ?? "";
const OTP_ARG = NPM_OTP ? ` --otp ${JSON.stringify(NPM_OTP)}` : "";
const PACK_DIR = join(ROOT, "tests", "reports", "release-tarballs");
const EXPECTED_PUBLIC_COUNT = 29;

function sh(command, options = {}) {
  // 64MB buffer: `pnpm pack` of the engine prints thousands of npm-notice lines,
  // which overflows execSync's 1MB default and kills the publish mid-pack.
  return execSync(command, { stdio: "pipe", encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...options }).trim();
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

function internalDependencies(manifest, packageNames) {
  return Object.keys({
    ...(manifest.dependencies ?? {}),
    ...(manifest.optionalDependencies ?? {})
  }).filter((name) => packageNames.has(name)).sort();
}

function dependencyOrder(unorderedPackages) {
  const byName = new Map(unorderedPackages.map((entry) => [entry.manifest.name, entry]));
  const packageNames = new Set(byName.keys());
  const pendingDependencies = new Map();
  const dependents = new Map([...packageNames].map((name) => [name, []]));
  for (const entry of unorderedPackages) {
    const dependencies = internalDependencies(entry.manifest, packageNames);
    pendingDependencies.set(entry.manifest.name, new Set(dependencies));
    for (const dependency of dependencies) dependents.get(dependency).push(entry.manifest.name);
  }
  const ready = [...packageNames]
    .filter((name) => pendingDependencies.get(name).size === 0)
    .sort();
  const ordered = [];
  while (ready.length > 0) {
    const name = ready.shift();
    ordered.push(byName.get(name));
    for (const dependent of dependents.get(name).sort()) {
      const pending = pendingDependencies.get(dependent);
      pending.delete(name);
      if (pending.size === 0 && !ordered.some((entry) => entry.manifest.name === dependent) && !ready.includes(dependent)) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  if (ordered.length !== unorderedPackages.length) {
    const blocked = [...pendingDependencies]
      .filter(([, dependencies]) => dependencies.size > 0)
      .map(([name, dependencies]) => `${name} <- ${[...dependencies].join(", ")}`);
    throw new Error(`Internal package dependency cycle: ${blocked.join("; ")}`);
  }
  return ordered;
}

function publishedRegistryVersion(name, version) {
  try {
    const result = execFileSync("npm", ["view", `${name}@${version}`, "version", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 4 * 1024 * 1024
    }).trim();
    return result ? JSON.parse(result) : null;
  } catch (error) {
    const diagnostic = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`;
    if (/E404|is not in this registry|No match found for version/i.test(diagnostic)) return null;
    throw new Error(`Registry availability check failed for ${name}@${version}: ${diagnostic.trim()}`);
  }
}

const packages = dependencyOrder(collectPublishablePackages());
if (packages.length !== EXPECTED_PUBLIC_COUNT) {
  console.error(`Expected exactly ${EXPECTED_PUBLIC_COUNT} publishable packages, found ${packages.length}:`);
  for (const { manifest } of packages) console.error(`  - ${manifest.name}@${manifest.version}`);
  process.exit(1);
}

const version = packages[0].manifest.version;
const mismatched = packages.filter(({ manifest }) => manifest.version !== version);
if (mismatched.length > 0) {
  console.error(`Version lockstep violated (root is ${version}):`);
  for (const { manifest } of mismatched) console.error(`  - ${manifest.name}@${manifest.version}`);
  process.exit(1);
}

const unpublishedChecks = [];
if (DRY_RUN) {
  for (const { manifest } of packages) {
    const publishedVersion = publishedRegistryVersion(manifest.name, manifest.version);
    unpublishedChecks.push({
      name: manifest.name,
      version: manifest.version,
      unpublished: publishedVersion === null
    });
  }
  const alreadyPublished = unpublishedChecks.filter((entry) => !entry.unpublished);
  if (alreadyPublished.length > 0) {
    console.error(`Target version is already published for ${alreadyPublished.length} package(s):`);
    for (const entry of alreadyPublished) console.error(`  - ${entry.name}@${entry.version}`);
    process.exit(1);
  }
}

rmSync(PACK_DIR, { recursive: true, force: true });
mkdirSync(PACK_DIR, { recursive: true });

// Trap 2: move the animation-studio template node_modules aside while packing.
const STUDIO_NODE_MODULES = join(ROOT, "packages", "create-aura3d", "templates", "animation-studio", "node_modules");
const STUDIO_NODE_MODULES_ASIDE = `${STUDIO_NODE_MODULES}.publish-aside`;
const hadStudioNodeModules = existsSync(STUDIO_NODE_MODULES);
if (hadStudioNodeModules) renameSync(STUDIO_NODE_MODULES, STUDIO_NODE_MODULES_ASIDE);

const failures = [];
const packedPackages = new Map();
try {
  for (const { dir, manifest } of packages) {
    const label = `${manifest.name}@${manifest.version}`;
    try {
      // Trap 1: pnpm pack rewrites workspace:* to concrete versions.
      const packOutput = sh(`pnpm pack --pack-destination ${JSON.stringify(PACK_DIR)}`, { cwd: dir });
      const tarball = packOutput.split("\n").pop();
      if (!tarball || !existsSync(tarball)) throw new Error(`pack produced no tarball (output: ${packOutput})`);
      const tarballBytes = readFileSync(tarball);
      const integrity = `sha512-${createHash("sha512").update(tarballBytes).digest("base64")}`;
      const sha256 = createHash("sha256").update(tarballBytes).digest("hex");
      packedPackages.set(manifest.name, { tarball, integrity, sha256 });
      if (DRY_RUN) {
        console.log(`[dry-run] packed ${label} -> ${tarball}`);
      } else {
        sh(`npm publish ${JSON.stringify(tarball)} --access public${OTP_ARG}`, { cwd: dir });
        console.log(`published ${label}`);
      }
    } catch (error) {
      const message = String(error?.message ?? error);
      // Re-runs after a partial publish hit "cannot publish over" conflicts for
      // packages that already made it — that is success, not failure.
      if (/cannot publish over|previously published/i.test(message)) {
        console.log(`already published ${label} (skipping)`);
      } else if (/EOTP|one-time password/i.test(message)) {
        failures.push({ label, error: "EOTP: publishing requires a 2FA one-time password" });
        console.error(`FAILED ${label}: this account enforces 2FA on publish.`);
        console.error("Re-run with a fresh code from your authenticator:");
        console.error("  NPM_OTP=<6-digit-code> node tools/release/publish-all.mjs");
        break;
      } else {
        failures.push({ label, error: message });
        console.error(`FAILED ${label}: ${message}`);
      }
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

writeFileSync(
  join(PACK_DIR, "release-plan.json"),
  `${JSON.stringify({
    schema: "aura3d-release-plan/1.0",
    generatedAt: new Date().toISOString(),
    commit: sh("git rev-parse HEAD"),
    lockfileSha256: createHash("sha256").update(readFileSync(join(ROOT, "pnpm-lock.yaml"))).digest("hex"),
    version,
    dryRun: DRY_RUN,
    expectedPackageCount: EXPECTED_PUBLIC_COUNT,
    packageCount: packages.length,
    targetVersionUnpublished: DRY_RUN ? unpublishedChecks.every((entry) => entry.unpublished) : null,
    packages: packages.map(({ manifest }) => {
      const packed = packedPackages.get(manifest.name);
      return {
        name: manifest.name,
        version: manifest.version,
        internalDependencies: internalDependencies(manifest, new Set(packages.map((entry) => entry.manifest.name))),
        tarball: packed?.tarball ? packed.tarball.replace(`${ROOT}/`, "") : null,
        sha256: packed?.sha256 ?? null,
        integrity: packed?.integrity ?? null,
        unpublished: DRY_RUN ? unpublishedChecks.find((entry) => entry.name === manifest.name)?.unpublished ?? false : null
      };
    })
  }, null, 2)}\n`,
  "utf8"
);

// Trap 4: verify against the registry (skipped on dry runs).
if (!DRY_RUN) {
  let verified = 0;
  const registryResults = [];
  for (const { dir, manifest } of packages) {
    const expectedVersion = manifest.version;
    const packed = packedPackages.get(manifest.name);
    try {
      const latest = sh(`npm view ${manifest.name} version`, { cwd: dir });
      const registryIntegrity = sh(`npm view ${manifest.name}@${expectedVersion} dist.integrity`, { cwd: dir });
      const versionMatches = latest === expectedVersion;
      const integrityMatches = Boolean(packed) && registryIntegrity === packed.integrity;
      registryResults.push({
        name: manifest.name,
        version: expectedVersion,
        latest,
        tarball: packed?.tarball ? packed.tarball.replace(`${ROOT}/`, "") : null,
        localIntegrity: packed?.integrity ?? null,
        registryIntegrity,
        versionMatches,
        integrityMatches
      });
      if (versionMatches && integrityMatches) {
        verified += 1;
      } else {
        console.error(
          `registry mismatch: ${manifest.name} latest=${latest}, expected=${expectedVersion}, integrity=${integrityMatches ? "match" : "MISMATCH"}`
        );
      }
    } catch (error) {
      registryResults.push({
        name: manifest.name,
        version: expectedVersion,
        latest: null,
        tarball: packed?.tarball ? packed.tarball.replace(`${ROOT}/`, "") : null,
        localIntegrity: packed?.integrity ?? null,
        registryIntegrity: null,
        versionMatches: false,
        integrityMatches: false,
        error: String(error?.message ?? error)
      });
      console.error(`registry check failed for ${manifest.name}: ${error?.message ?? error}`);
    }
  }
  writeFileSync(
    join(PACK_DIR, "registry-verification.json"),
    `${JSON.stringify({
      schema: "aura3d-npm-registry-verification/1.0",
      generatedAt: new Date().toISOString(),
      commit: sh("git rev-parse HEAD"),
      version,
      expectedPackageCount: EXPECTED_PUBLIC_COUNT,
      verifiedPackageCount: verified,
      ok: verified === EXPECTED_PUBLIC_COUNT,
      packages: registryResults
    }, null, 2)}\n`,
    "utf8"
  );
  console.log(`\nregistry verification: ${verified}/${EXPECTED_PUBLIC_COUNT} packages at expected versions and matching SHA-512 integrity`);
  if (verified !== EXPECTED_PUBLIC_COUNT) process.exit(1);
}

console.log(DRY_RUN ? "\ndry-run complete." : "\npublish complete.");

#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const reportPath = resolve(repoRoot, "tests/reports/external-candidate-package-audit.json");
const candidates = {
  "@dimforge/rapier3d": "0.20.0",
  "@dimforge/rapier3d-compat": "0.20.0",
  "recast-navigation": "0.43.1",
  howler: "2.2.4",
  yuka: "0.7.8",
  bitecs: "0.4.0",
  miniplex: "2.0.0"
};

function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function jsonCommand(command, args, options = {}) {
  return JSON.parse(execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options }));
}

const scratch = mkdtempSync(join(tmpdir(), "aura3d-external-candidates-"));
try {
  const dependencySpec = Object.fromEntries(Object.entries(candidates).map(([name, version]) => [name, version]));
  writeFileSync(join(scratch, "package.json"), `${JSON.stringify({ private: true, type: "module", dependencies: dependencySpec }, null, 2)}\n`);
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: scratch, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const auditRun = spawnSync("npm", ["audit", "--json"], { cwd: scratch, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const securityAudit = JSON.parse(auditRun.stdout || "{}");
  const packages = [];
  const tarballDir = join(scratch, "packs");
  mkdirSync(tarballDir, { recursive: true });
  for (const [name, version] of Object.entries(candidates)) {
    const pack = jsonCommand("npm", ["pack", `${name}@${version}`, "--json", "--pack-destination", tarballDir], { cwd: scratch })[0];
    const entryPath = join(scratch, `entry-${name.replace(/[^a-z0-9]/gi, "-")}.mjs`);
    const bundlePath = join(scratch, `bundle-${name.replace(/[^a-z0-9]/gi, "-")}.mjs`);
    writeFileSync(entryPath, `import * as candidate from ${JSON.stringify(name)};\nglobalThis.__candidateExports = Object.keys(candidate);\n`);
    const bundleRun = spawnSync(resolve(repoRoot, "node_modules/.bin/esbuild"), [entryPath, "--bundle", "--format=esm", "--platform=browser", `--outfile=${bundlePath}`, "--log-level=error"], { cwd: scratch, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const bundle = bundleRun.status === 0 ? readFileSync(bundlePath) : null;
    const packageAudit = securityAudit.vulnerabilities?.[name] ?? null;
    packages.push({
      name, version,
      tarball: { filename: pack.filename, packageBytes: pack.size, unpackedBytes: pack.unpackedSize, fileCount: pack.entryCount, integrity: pack.integrity, shasum: pack.shasum, sha256: sha256(join(tarballDir, pack.filename)) },
      allExportBrowserBundle: bundle ? { pass: true, rawBytes: bundle.length, gzipBytes: gzipSync(bundle).length, brotliBytes: brotliCompressSync(bundle).length } : { pass: false, error: (bundleRun.stderr || bundleRun.stdout).trim() },
      security: packageAudit ? { vulnerable: true, severity: packageAudit.severity, via: packageAudit.via, range: packageAudit.range, fixAvailable: packageAudit.fixAvailable } : { vulnerable: false }
    });
  }
  const metadata = securityAudit.metadata?.vulnerabilities ?? {};
  const report = {
    schema: "aura3d.external-candidate-package-audit/1.0",
    generatedAt: new Date().toISOString(),
    pass: packages.length === Object.keys(candidates).length && packages.every((entry) => entry.tarball.integrity && entry.security.vulnerable === false),
    claimBoundary: "Install/package/security and all-export bundle evidence only. It does not select an engine or replace Phase 2 browser workload bake-offs.",
    environment: { node: process.version, npm: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(), platform: `${process.platform}-${process.arch}` },
    lockfileVersion: JSON.parse(readFileSync(join(scratch, "package-lock.json"), "utf8")).lockfileVersion,
    auditExitCode: auditRun.status,
    auditTotals: metadata,
    packages,
    failures: packages.filter((entry) => entry.security.vulnerable).map((entry) => `${entry.name}:security-${entry.security.severity}`)
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ pass: report.pass, auditTotals: report.auditTotals, packages: packages.map((entry) => ({ name: entry.name, tarballBytes: entry.tarball.packageBytes, browserBundle: entry.allExportBrowserBundle })) }, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

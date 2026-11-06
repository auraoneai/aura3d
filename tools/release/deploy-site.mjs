#!/usr/bin/env node
// Cloudflare Pages deploy from a clean RELEASE TREE (never from main). Prints the plan with --dry-run.
//   node tools/release/deploy-site.mjs --version 5.0.2 --freeze <sha> --mode preview|production [--dist marketing/dist] [--fixtures-from https://aura3d.auraone.ai] [--dry-run]
// Steps: tree guard, required files, small-fixture fixup (24 MiB), verify-asset-urls, wrangler pages deploy.
// Run tools/release/render-gate against the preview URL BEFORE running with --mode production.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { oversizeFiles, pagesDeployArgs, previewBranch } from "./release-helpers.mjs";

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const dry = args.includes("--dry-run");
const [version, freeze, mode] = [arg("--version"), arg("--freeze"), arg("--mode")];
if (!version || !freeze || !["preview", "production"].includes(mode)) { console.error("usage: deploy-site.mjs --version V --freeze SHA --mode preview|production [--dist D] [--fixtures-from URL] [--dry-run]"); process.exit(2); }
const root = resolve(import.meta.dirname, "../..");
const dist = resolve(root, arg("--dist", "marketing/dist"));
const fixturesFrom = arg("--fixtures-from", "https://aura3d.auraone.ai");
// Files over the Pages limit are replaced by the optimized copy the live site already serves (hash pinned where known).
const SMALL_FIXTURES = [
  { file: "fixtures/asset-corpus/boom-box.glb", sha256: "10d1de0e7699c79de597ac6d813e8505abf126b1a2c2e5dcc621a19d3e081cab" },
  { file: "fixtures/asset-corpus/antique-camera.glb" }
];
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [{ path: join(d, e.name), size: statSync(join(d, e.name)).size }]));
const run = (cmd, a) => (dry ? console.log("DRY", cmd, a.join(" ")) : execFileSync(cmd, a, { stdio: "inherit", cwd: root }));

if (!dry) {
  if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) throw new Error("release tree is not clean");
  if (execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() !== freeze) throw new Error("HEAD is not the freeze commit: deploy from the release worktree");
  for (const f of ["_headers", "_redirects", "docs/migration/4-to-5.html"]) if (!existsSync(join(dist, f))) throw new Error(`dist is missing ${f}`);
  for (const { file, sha256 } of SMALL_FIXTURES) {
    const target = join(dist, file);
    if (!existsSync(target) || statSync(target).size <= 24 * 1024 * 1024) continue;
    const res = await fetch(`${fixturesFrom}/${file}`);
    if (!res.ok) throw new Error(`cannot fetch ${file} from ${fixturesFrom}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha256 && createHash("sha256").update(buf).digest("hex") !== sha256) throw new Error(`${file} hash differs from the pinned optimized copy`);
    writeFileSync(target, buf);
  }
  const big = oversizeFiles(walk(dist));
  if (big.length) throw new Error(`files over the Pages limit: ${big.join(", ")}`);
}
run("node", ["tools/verify-asset-urls/index.mjs", "--dist", dist]);
const branch = mode === "production" ? "main" : previewBranch(version);
const message = `release: Aura3D ${version}${mode === "preview" ? " (preview)" : ""}`;
run("wrangler", pagesDeployArgs({ project: "aura3d", dist, branch, freeze, message }));
if (mode === "preview") console.log(`preview URL: https://${branch}.aura3d.pages.dev  -> now run tools/release/render-gate against it`);

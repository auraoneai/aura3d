/**
 * PRD-05 §6.3 — asset-optimize pipeline runner.
 *
 *   weld → dedup → prune → join/palette → resize → tangents(MikkTSpace)
 *   → quantize → meshopt|draco → KTX2 (UASTC/ETC1S) → checks → measurements
 *
 * Writes `public/aura-assets/<id>.<derivedHash8>.glb` (+ `.mobile.glb`),
 * updates the manifest `derived` block, and refuses KTX2/bake work outside
 * CI unless `--allow-local-small` and the source is < 5 MB.
 *
 * CLI: `tsx --tsconfig tsconfig.base.json tools/asset-optimize/index.ts
 *        [--ids a,b] [--profile id] [--geometry meshopt|draco|none]
 *        [--dry-run] [--allow-local-small] [--ktx <path>] [--report <path>]
 *        [--manifest <dir-with-aura.assets.json>]`
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ASSET_OPTIMIZE_PROFILES, profileForRole, type AssetOptimizeProfileId } from "./profiles.js";
import { optimizeGLB } from "./pipeline.js";
import type { AssetBudgetMeasurement } from "./measure.js";
import type { AssetQualityCheck } from "../../packages/aura3d-cli/src/contracts/assetManifest.js";
import { readAssetManifest, writeAssetManifest } from "../../packages/aura3d-cli/src/asset-manifest.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DERIVED_DIR = join(repoRoot, "public", "aura-assets");
const LOCAL_KTX2_MAX_SOURCE_BYTES = 5 * 1024 * 1024;

interface OptimizeRow {
  readonly id: string;
  readonly budget?: AssetBudgetMeasurement;
  readonly checks: readonly AssetQualityCheck[];
  readonly error?: string;
}

export interface OptimizeFileSpec {
  readonly path: string;
  readonly profile: string;
}

export interface OptimizeAssetsOptions {
  readonly ids?: readonly string[];
  /** Optimize explicit GLB paths (bypasses the manifest — benchmark fixtures). */
  readonly files?: readonly OptimizeFileSpec[];
  /** Output dir for --files mode (default public/aura-assets). */
  readonly outDir?: string;
  readonly dryRun?: boolean;
  readonly profile?: string;
  readonly geometry?: "meshopt" | "draco" | "none";
  readonly allowLocalSmall?: boolean;
  readonly ktxBinary?: string;
  /** §6.5: run the remesh/bake generated-asset pre-stage before §6.3 steps. */
  readonly fromGenerated?: boolean;
  /** Runs the pre-stage Blender steps — true only on the remote worker. */
  readonly remote?: boolean;
  readonly blenderBinary?: string;
  readonly reportPath?: string;
  readonly writeManifest?: boolean;
  /** Directory holding the aura.assets.json to read/update (default: repo root).
   *  Set it to a template/app dir so its manifest entries can earn `derived`
   *  records — the default repo-root manifest cannot carry template assets. */
  readonly manifestDir?: string;
  readonly log?: (line: string) => void;
}

function findKtxBinary(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const env = process.env.A3D_KTX_BINARY;
  if (env && existsSync(env)) return env;
  // tool-versions.json layout: .ktx/<archive-root>/bin/ktx (lib/ sibling keeps
  // libktx.so.4 reachable — copying the binary alone orphans it).
  try {
    const tv = JSON.parse(readFileSync(join(repoRoot, "tools", "asset-optimize", "tool-versions.json"), "utf8"));
    const local = join(repoRoot, "tools", "asset-optimize", ".ktx", tv.tools?.ktx?.binary ?? "");
    if (existsSync(local)) return local;
  } catch { /* no tool-versions.json */ }
  const bin = join(repoRoot, "tools", "asset-optimize", "bin", "ktx");
  if (existsSync(bin)) return bin;
  return undefined;
}

/** §6.4 G1 on the derived doc + step flags → AssetQualityCheck rows. */
function gateChecks(
  tris: number,
  profile: { triangles: { floor: number; target: number; ceiling: number } },
  flags: readonly string[]
): AssetQualityCheck[] {
  const checks: AssetQualityCheck[] = [];
  const { floor, ceiling } = profile.triangles;
  const inBand = tris >= floor && tris <= ceiling;
  checks.push({
    gate: "G1",
    verdict: floor === 0 || inBand ? "pass" : "fail",
    measured: { triangles: tris, floor, ceiling },
    message: inBand ? `LOD0 ${tris} tris in [${floor}, ${ceiling}]` : `LOD0 ${tris} tris outside [${floor}, ${ceiling}]`
  });
  for (const flag of flags) {
    if (flag === "texture-waste") {
      checks.push({ gate: "G8", verdict: "fail", measured: { flag }, message: "texture larger than profile max on below-floor geometry" });
    }
    if (flag === "G8:missing-texcoord0") {
      checks.push({ gate: "G8", verdict: "fail", measured: { flag }, message: "normal-mapped primitive without TEXCOORD_0" });
    }
  }
  return checks;
}

export async function optimizeAssets(options: OptimizeAssetsOptions): Promise<{ rows: OptimizeRow[] }> {
  const log = options.log ?? ((line: string) => console.log(line));
  const inCi = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  const ktxBinary = findKtxBinary(options.ktxBinary);
  const manifestDir = resolve(options.manifestDir ?? repoRoot);
  const manifest = readAssetManifest(manifestDir);
  const rows: OptimizeRow[] = [];

  if (options.files?.length) {
    for (const file of options.files) {
      const sourcePath = join(repoRoot, file.path);
      if (!existsSync(sourcePath)) {
        log(`skip ${file.path}: missing source`);
        continue;
      }
      const profile = ASSET_OPTIMIZE_PROFILES[file.profile as AssetOptimizeProfileId];
      if (!profile) {
        log(`skip ${file.path}: unknown profile "${file.profile}"`);
        continue;
      }
      const sourceBytes = readFileSync(sourcePath);
      const result = await optimizeGLB(new Uint8Array(sourceBytes), {
        profile,
        geometry: options.geometry,
        ktxBinary,
        requireKtx2: inCi,
        mobileCap: 0,
        fromGenerated: options.fromGenerated,
        remote: options.remote,
        blenderBinary: options.blenderBinary,
        log
      });
      const hash = createHash("sha256").update(result.glb).digest("hex");
      const slug = file.path.split("/").pop()!.replace(/\.glb$/i, "").replace(/\.[0-9a-f]{8}$/i, "");
      const outDir = join(repoRoot, options.outDir ?? "public/aura-assets");
      if (!options.dryRun) {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, `${slug}.${hash.slice(0, 8)}.glb`), Buffer.from(result.glb));
        if (result.collisionGlb) {
          writeFileSync(join(outDir, `${slug}.${hash.slice(0, 8)}.collision.glb`), Buffer.from(result.collisionGlb));
        }
      }
      const checks = gateChecks(result.budget.triangles, profile, result.flags);
      rows.push({ id: slug, budget: result.budget, checks });
      log(`${slug} [${profile.id}]: tris=${result.budget.triangles} sha256=${hash} checks=${checks.map((c) => `${c.gate}:${c.verdict}`).join(",")}`);
    }
    return { rows };
  }

  const modelEntries = manifest.assets.filter(
    (e) => (e.type === "model" || e.format === "glb" || e.format === "gltf") &&
      (!options.ids?.length || options.ids.includes(e.id))
  );

  for (const entry of modelEntries) {
    const rel = (entry as { source?: string }).source ?? entry.outputPath;
    const sourcePath = join(manifestDir, rel);
    if (!existsSync(sourcePath)) {
      log(`skip ${entry.id}: missing source ${rel}`);
      continue;
    }
    const sourceBytes = readFileSync(sourcePath);
    const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
    const profile = options.profile ? ASSET_OPTIMIZE_PROFILES[options.profile as AssetOptimizeProfileId] : profileForRole(entry.role, entry.bounds);
    if (!profile) {
      log(`skip ${entry.id}: unknown profile "${options.profile}"`);
      continue;
    }

    const heavy = profile.textures.baseColor !== "none" || profile.collider !== "none";
    if (heavy && !inCi && !options.dryRun && !(options.allowLocalSmall && sourceBytes.byteLength < LOCAL_KTX2_MAX_SOURCE_BYTES)) {
      throw new Error(
        `${entry.id}: KTX2/bake steps run in CI (asset-optimize.yml); pass --allow-local-small for sources < 5 MB`
      );
    }

    const mobileCap = profile.id === "hero-character" || profile.id === "hero-vehicle" ? 1024 : 512;
    let result;
    try {
      result = await optimizeGLB(new Uint8Array(sourceBytes), {
        profile,
        geometry: options.geometry,
        ktxBinary,
        requireKtx2: inCi && heavy,
        mobileCap,
        fromGenerated: options.fromGenerated,
        remote: options.remote ?? inCi,
        blenderBinary: options.blenderBinary,
        log
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`${entry.id} [${profile.id}]: ERROR ${message}`);
      rows.push({ id: entry.id, checks: [], error: message });
      continue;
    }

    const derivedHash = createHash("sha256").update(result.glb).digest("hex");
    const hash8 = derivedHash.slice(0, 8);
    const url = `/aura-assets/${entry.id}.${hash8}.glb`;
    const outputPath = `public/aura-assets/${entry.id}.${hash8}.glb`;
    const checks = gateChecks(result.budget.triangles, profile, result.flags);
    const derivedDir = options.outDir
      ? join(manifestDir, options.outDir)
      : join(manifestDir, "public", "aura-assets");

    if (!options.dryRun) {
      mkdirSync(derivedDir, { recursive: true });
      writeFileSync(join(derivedDir, `${entry.id}.${hash8}.glb`), Buffer.from(result.glb));
      let mobileUrl: string | undefined;
      if (result.mobile) {
        const mobileHash = createHash("sha256").update(result.mobile).digest("hex").slice(0, 8);
        writeFileSync(join(derivedDir, `${entry.id}.${mobileHash}.mobile.glb`), Buffer.from(result.mobile));
        mobileUrl = `/aura-assets/${entry.id}.${mobileHash}.mobile.glb`;
      }
      let collisionUrl: string | undefined;
      if (result.collisionGlb) {
        writeFileSync(join(derivedDir, `${entry.id}.${hash8}.collision.glb`), Buffer.from(result.collisionGlb));
        collisionUrl = `/aura-assets/${entry.id}.${hash8}.collision.glb`;
      }

      if (options.writeManifest !== false) {
        const fresh = readAssetManifest(manifestDir);
        const target = fresh.assets.find((a) => a.id === entry.id);
        if (target) {
          (target as { derived?: unknown }).derived = {
            url,
            hash: `sha256:${derivedHash}`,
            mobileUrl,
            collisionUrl,
            profile: profile.id,
            steps: result.steps,
            sourceHash: `sha256:${sourceHash}`,
            outputPath,
            extensionsUsed: result.extensionsUsed,
            requiredDecoders: result.requiredDecoders,
            lods: [],
            measurements: { before: result.budgetBefore, after: result.budget }
          };
          writeAssetManifest(manifestDir, fresh);
        }
      }
    }
    rows.push({ id: entry.id, budget: result.budget, checks });
    log(`${entry.id} [${profile.id}]: tris=${result.budget.triangles} draws=${result.budget.drawCalls} bytes=${result.budget.downloadBytes} checks=${checks.map((c) => `${c.gate}:${c.verdict}`).join(",")}`);
  }
  return { rows };
}

// ---------- CLI ----------

function readFlag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : undefined;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const ids = readFlag(argv, "--ids")?.split(",").filter(Boolean);
  const reportPath = readFlag(argv, "--report");
  const files = readFlag(argv, "--files")?.split(",").filter(Boolean).map((spec) => {
    const [path, profile] = spec.split(":");
    return { path: path.trim(), profile: (profile ?? "prop-large").trim() };
  });
  const result = await optimizeAssets({
    ids,
    files,
    outDir: readFlag(argv, "--out-dir"),
    dryRun,
    profile: readFlag(argv, "--profile"),
    geometry: readFlag(argv, "--geometry") as "meshopt" | "draco" | "none" | undefined,
    allowLocalSmall: argv.includes("--allow-local-small"),
    fromGenerated: argv.includes("--from-generated"),
    remote: argv.includes("--remote") ? (readFlag(argv, "--remote") !== "false") : undefined,
    blenderBinary: readFlag(argv, "--blender"),
    writeManifest: !argv.includes("--no-manifest"),
    manifestDir: readFlag(argv, "--manifest"),
    ktxBinary: readFlag(argv, "--ktx"),
    log: (line) => console.log(line)
  });
  if (reportPath) {
    const out = resolve(repoRoot, reportPath);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), dryRun, rows: result.rows }, null, 2) + "\n");
    console.log(`wrote ${reportPath}`);
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((code) => process.exit(code), (err) => { console.error(err); process.exit(1); });
}

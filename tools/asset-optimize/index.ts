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
 *        [--dry-run] [--allow-local-small] [--ktx <path>] [--report <path>]`
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

const GLB_MAGIC = 0x46546c67;
const GLB_CHUNK_JSON = 0x4e4f534a;
const GLB_CHUNK_BIN = 0x004e4942;
const MIME_BY_EXT: Readonly<Record<string, string>> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * Re-embeds GLB image references that use external `uri` (non-spec-compliant
 * but shipped by some exports, e.g. showcaseRunnerGirl's `Textures/*.png`).
 * gltf-transform's `binaryToJSON` cannot resolve them, so the optimize pass
 * would die on the entry — here we read each file relative to the GLB's own
 * directory, append it to the BIN chunk, and rewrite the JSON chunk. Returns
 * the original bytes when the GLB needs no repair.
 */
function embedExternalGlbImages(bytes: Buffer, glbDir: string, log: (l: string) => void): Buffer {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC) return bytes;
  const jsonLen = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== GLB_CHUNK_JSON) return bytes;
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLen).toString("utf8")) as {
    images?: { uri?: string; bufferView?: number; mimeType?: string }[];
    bufferViews?: { buffer: number; byteOffset: number; byteLength: number }[];
    buffers?: { byteLength: number }[];
  };
  const external = (json.images ?? []).filter((i) => i.uri !== undefined && !i.uri.startsWith("data:"));
  if (external.length === 0) return bytes;

  let binOffset = 20 + jsonLen;
  let bin = Buffer.alloc(0);
  while (binOffset + 8 <= bytes.length) {
    const len = bytes.readUInt32LE(binOffset);
    if (bytes.readUInt32LE(binOffset + 4) === GLB_CHUNK_BIN) {
      bin = Buffer.from(bytes.subarray(binOffset + 8, binOffset + 8 + len));
      break;
    }
    binOffset += 8 + len;
  }
  if (bin.length === 0) throw new Error("GLB has external images but no BIN chunk");

  const bufferViews = (json.bufferViews ??= []);
  for (const image of external) {
    const rel = decodeURIComponent(image.uri!).replace(/\\/g, "/");
    const file = resolve(glbDir, rel);
    if (!file.startsWith(resolve(glbDir))) throw new Error(`image uri escapes source dir: ${image.uri}`);
    if (!existsSync(file)) throw new Error(`external image not found beside GLB: ${rel}`);
    const imgBytes = readFileSync(file);
    const pad = (4 - (bin.length % 4)) % 4;
    if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
    bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: imgBytes.length });
    image.bufferView = bufferViews.length - 1;
    image.mimeType = MIME_BY_EXT[rel.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
    delete image.uri;
    bin = Buffer.concat([bin, imgBytes]);
    log(`  embedded external image ${rel} (${(imgBytes.length / 1024).toFixed(0)} KB)`);
  }
  if (json.buffers?.[0]) json.buffers[0].byteLength = bin.length;

  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad)]);
  const out = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binChunk.length);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(GLB_CHUNK_JSON, 16);
  jsonChunk.copy(out, 20);
  out.writeUInt32LE(binChunk.length, 20 + jsonChunk.length);
  out.writeUInt32LE(GLB_CHUNK_BIN, 20 + jsonChunk.length + 4);
  binChunk.copy(out, 20 + jsonChunk.length + 8);
  return out;
}

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
  const manifest = readAssetManifest(repoRoot);
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
      const sourceBytes = embedExternalGlbImages(readFileSync(sourcePath), dirname(sourcePath), log);
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
    const sourcePath = join(repoRoot, rel);
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
      // Skip rather than abort: a local pass should still derive everything it
      // can locally and report the heavy entries it could not, so the ≤80MB
      // aggregate + report stay useful without waiting on the CI run.
      log(`skip ${entry.id}: KTX2/bake steps run in CI (asset-optimize.yml); source ${(sourceBytes.byteLength / 1048576).toFixed(1)} MB ≥ ${(LOCAL_KTX2_MAX_SOURCE_BYTES / 1048576).toFixed(0)} MB local cap`);
      rows.push({ id: entry.id, checks: [], error: `skipped-locally: heavy source ≥ ${(LOCAL_KTX2_MAX_SOURCE_BYTES / 1048576).toFixed(0)} MB needs CI run` });
      continue;
    }

    const mobileCap = profile.id === "hero-character" || profile.id === "hero-vehicle" ? 1024 : 512;
    const glbBytes = embedExternalGlbImages(sourceBytes, dirname(sourcePath), log);
    let result;
    try {
      result = await optimizeGLB(new Uint8Array(glbBytes), {
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
    const derivedDir = options.outDir ? join(repoRoot, options.outDir) : DERIVED_DIR;

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
        const fresh = readAssetManifest(repoRoot);
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
          writeAssetManifest(repoRoot, fresh);
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

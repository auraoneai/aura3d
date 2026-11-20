/**
 * 5.6.0 command group `asset-post` (see artifacts/cli-gaps/REPORT.md A4): `assets normalize`, `assets slim`,
 * `assets preview` and `assets thumbnail`. Registered with registerCliCommand; this barrel is imported by ../registry.ts.
 *
 * Shared API (other command groups import these): normalizeGlb, slimGlb, renderPreview.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { registerCliCommand } from "../../contracts/commands.js";
import { readAssetManifest } from "../../asset-manifest.js";
import { normalizeGlb, normalizeUsage, type NormalizeSize } from "./normalize.js";
import { slimGlb, slimUsage, type SlimGlbResult } from "./slim.js";
import { parsePreviewViews, renderPreview, previewUsage } from "./preview.js";
import { createAssetThumbnailsAsync, thumbnailUsage } from "./thumbnail.js";

export { normalizeGlb, normalizeUsage, NORMALIZE_FRONT_YAW } from "./normalize.js";
export type { NormalizeFront, NormalizeGlbOptions, NormalizeGlbResult, NormalizeSize } from "./normalize.js";
export { slimGlb, slimUsage, SLIM_DEFAULT_QUALITY } from "./slim.js";
export type { SlimGlbOptions, SlimGlbResult, SlimSkip } from "./slim.js";
export { renderPreview, renderPreviewPng, parsePreviewViews, previewUsage, DEFAULT_PREVIEW_VIEWS, PREVIEW_KIND, PREVIEW_NOTE, PREVIEW_VIEWS } from "./preview.js";
export type { PreviewPng, PreviewView, RenderPreviewOptions, RenderPreviewResult } from "./preview.js";
export { createAssetThumbnailsAsync, thumbnailUsage } from "./thumbnail.js";
export type { AssetThumbnailRecord, AssetThumbnailsResult, CreateAssetThumbnailsOptions } from "./thumbnail.js";

type Io = Parameters<Parameters<typeof registerCliCommand>[0]["run"]>[1];

class UsageError extends Error {}

function wantsHelp(argv: readonly string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

function option(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new UsageError(`${name} needs a value.`);
  return value;
}

function numberOption(argv: readonly string[], name: string, check: (n: number) => boolean = (n) => Number.isFinite(n)): number | undefined {
  const raw = option(argv, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!check(value)) throw new UsageError(`${name} got "${raw}", which is not a valid value.`);
  return value;
}

function positionals(argv: readonly string[], valueFlags: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (valueFlags.includes(arg)) { i += 1; continue; }
    if (arg.startsWith("-")) continue;
    out.push(arg);
  }
  return out;
}

function unknownFlags(argv: readonly string[], valueFlags: readonly string[], boolFlags: readonly string[]): string[] {
  const known = new Set([...valueFlags, ...boolFlags, "--json", "--help", "-h"]);
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (valueFlags.includes(arg)) { i += 1; continue; }
    if (arg.startsWith("-") && !known.has(arg)) out.push(arg);
  }
  return out;
}

/** Run a verb body with the shared help / usage-error (2) / failure (1) / JSON conventions. */
async function runVerb(argv: readonly string[], io: Io, usage: string, valueFlags: readonly string[], boolFlags: readonly string[], body: () => Promise<{ ok: boolean; json: unknown; lines: readonly string[] }>): Promise<number> {
  if (wantsHelp(argv)) {
    io.stdout(`Usage: ${usage}`);
    return 0;
  }
  const json = argv.includes("--json");
  try {
    const unknown = unknownFlags(argv, valueFlags, boolFlags);
    if (unknown.length > 0) throw new UsageError(`Unknown flag(s): ${unknown.join(", ")}.`);
    const result = await body();
    if (json) io.stdout(JSON.stringify(result.json, null, 2));
    else for (const line of result.lines) io.stdout(line);
    return result.ok ? 0 : 1;
  } catch (error) {
    const message = (error as Error).message;
    if (error instanceof UsageError) {
      if (json) io.stdout(JSON.stringify({ ok: false, error: message, usage }, null, 2));
      else io.stderr(`${message}\nUsage: ${usage}`);
      return 2;
    }
    if (json) io.stdout(JSON.stringify({ ok: false, error: message }, null, 2));
    else io.stderr(message);
    return 1;
  }
}

const positive = (n: number): boolean => Number.isFinite(n) && n > 0;
const MB = (bytes: number): string => (bytes / 1e6).toFixed(2);

const NORMALIZE_VALUES = ["--out", "--front", "--yaw", "--height", "--length", "--width", "--max-dim"] as const;
registerCliCommand({
  name: "assets normalize",
  owner: "asset-post",
  summary: "Turn a GLB to face +Z, scale it to a size target and ground it at y = 0 (bakes static transforms; records aura3d.orientation).",
  usage: normalizeUsage(),
  run: (argv, io) => runVerb(argv, io, normalizeUsage(), NORMALIZE_VALUES, ["--keep-scale"], async () => {
    const [input, ...extra] = positionals(argv, NORMALIZE_VALUES);
    const out = option(argv, "--out");
    if (!input || !out) throw new UsageError("assets normalize needs <in.glb> and --out <out.glb>.");
    if (extra.length > 0) throw new UsageError(`Unexpected argument(s): ${extra.join(" ")}.`);
    const sizeFlags: [keyof NormalizeSize, string][] = [["height", "--height"], ["length", "--length"], ["width", "--width"], ["maxDim", "--max-dim"]];
    const given = sizeFlags.filter(([, flag]) => argv.includes(flag));
    if (given.length > 1) throw new UsageError(`Give one size target, not ${given.map(([, flag]) => flag).join(" and ")}.`);
    const size: Record<string, number> = {};
    for (const [key, flag] of given) size[key] = numberOption(argv, flag, positive)!;
    const front = option(argv, "--front") ?? "+z";
    if (!["+z", "-z", "+x", "-x"].includes(front.toLowerCase())) throw new UsageError(`--front must be +z, -z, +x or -x (got "${front}").`);
    const yawDeg = numberOption(argv, "--yaw") ?? 0;
    const inputPath = resolve(io.cwd, input);
    const outputPath = resolve(io.cwd, out);
    const result = await normalizeGlb(inputPath, outputPath, { front, yawDeg, keepScale: argv.includes("--keep-scale"), projectDir: io.cwd, ...(given.length ? { size } : {}) });
    return {
      ok: true,
      json: { ok: true, input: inputPath, output: outputPath, ...result },
      lines: [`wrote ${out}: ${result.size.join(" x ")} m (x width, y height, z length), yaw ${result.yawDeg} deg, scale ${result.scale}${result.sceneScale !== undefined ? `, sceneScale ${result.sceneScale} (apply on the scene node)` : ""}, faces +Z, grounded at y = ${result.minY}`]
    };
  })
});

const SLIM_VALUES = ["--quality", "--slots", "--out"] as const;
registerCliCommand({
  name: "assets slim",
  owner: "asset-post",
  summary: "Re-encode PNG normal maps (or other slots) in GLBs as JPEG q92 (shrinks files 40-60%); normal maps on glossy materials stay PNG unless --allow-glossy.",
  usage: slimUsage(),
  run: (argv, io) => runVerb(argv, io, slimUsage(), SLIM_VALUES, ["--allow-glossy"], async () => {
    const files = positionals(argv, SLIM_VALUES);
    if (files.length === 0) throw new UsageError("assets slim needs at least one <file.glb>.");
    const out = option(argv, "--out");
    if (out && files.length > 1) throw new UsageError("--out works with a single input; omit it to rewrite several files in place.");
    const quality = numberOption(argv, "--quality", (n) => Number.isInteger(n) && n >= 1 && n <= 100);
    const slotsRaw = option(argv, "--slots");
    const slots = slotsRaw?.split(",").map((s) => s.trim()).filter(Boolean);
    const results: SlimGlbResult[] = [];
    for (const file of files) {
      results.push(await slimGlb(resolve(io.cwd, file), { projectDir: io.cwd, allowGlossy: argv.includes("--allow-glossy"), ...(quality !== undefined ? { quality } : {}), ...(slots ? { slots } : {}), ...(out ? { out: resolve(io.cwd, out) } : {}) }));
    }
    const describe = (r: SlimGlbResult): string => {
      if (r.written) return r.reencoded > 0 ? ` (${r.reencoded} texture(s) re-encoded)` : " (copied; nothing re-encoded)";
      if (r.reencoded > 0) return " (unchanged: JPEG was not smaller)";
      return r.skipped.length > 0 ? " (unchanged: every candidate is on a glossy material)" : " (no PNG textures in the selected slots)";
    };
    return {
      ok: true,
      json: { ok: true, files: results, before: results.reduce((s, r) => s + r.before, 0), after: results.reduce((s, r) => s + r.after, 0) },
      lines: results.flatMap((r) => [
        `${r.output}: ${MB(r.before)} -> ${MB(r.after)} MB${describe(r)}`,
        ...r.skipped.map((skip) => `  skipped ${skip.texture} (material ${skip.material}): ${skip.reason}`)
      ])
    };
  })
});

const PREVIEW_VALUES = ["--out", "--views", "--size"] as const;
registerCliCommand({
  name: "assets preview",
  owner: "asset-post",
  summary: "CPU base-colour preview PNG of a GLB or admitted asset (front/side/back/three-quarter; Node only, not a render).",
  usage: previewUsage(),
  run: (argv, io) => runVerb(argv, io, previewUsage(), PREVIEW_VALUES, ["--no-label"], async () => {
    const [target, ...extra] = positionals(argv, PREVIEW_VALUES);
    const out = option(argv, "--out");
    if (!target || !out) throw new UsageError("assets preview needs <file.glb|asset-id> and --out <views.png>.");
    if (extra.length > 0) throw new UsageError(`Unexpected argument(s): ${extra.join(" ")}.`);
    const viewsRaw = option(argv, "--views");
    let views;
    try { views = viewsRaw ? parsePreviewViews(viewsRaw) : undefined; } catch (error) { throw new UsageError((error as Error).message); }
    const size = numberOption(argv, "--size", (n) => Number.isInteger(n) && n >= 32 && n <= 2048);
    const glb = resolvePreviewTarget(io.cwd, target);
    const result = await renderPreview(glb, resolve(io.cwd, out), { projectDir: io.cwd, label: !argv.includes("--no-label"), ...(views ? { views } : {}), ...(size ? { size } : {}) });
    return {
      ok: true,
      json: { ok: true, ...result },
      lines: [
        `wrote ${out} (${result.width}x${result.height}, ${result.views.join(", ")}; ${result.triangles} tris, ${result.texturedTriangles} textured)`,
        result.note,
        ...result.warnings.map((w) => `warning: ${w}`)
      ]
    };
  })
});

const THUMBNAIL_VALUES = ["--asset", "--size"] as const;
registerCliCommand({
  name: "assets thumbnail",
  owner: "asset-post",
  summary: "Write PNG thumbnails (CPU base-colour previews) for admitted GLB models and point the manifest at them.",
  usage: thumbnailUsage(),
  run: (argv, io) => runVerb(argv, io, thumbnailUsage(), THUMBNAIL_VALUES, [], async () => {
    const extra = positionals(argv, THUMBNAIL_VALUES);
    if (extra.length > 0) throw new UsageError(`Unexpected argument(s): ${extra.join(" ")}. Select assets with --asset id.`);
    const assetIds = argv.flatMap((arg, i) => (arg === "--asset" ? (option(argv.slice(i), "--asset") ?? "").split(",").map((s) => s.trim()).filter(Boolean) : []));
    const size = numberOption(argv, "--size", (n) => Number.isInteger(n) && n >= 32 && n <= 2048);
    const result = await createAssetThumbnailsAsync({ projectDir: io.cwd, ...(assetIds.length ? { assetIds } : {}), ...(size ? { size } : {}) });
    const { manifest: _manifest, ...summary } = result;
    return { ok: result.ok, json: summary, lines: [...result.thumbnails.map((t) => `${t.id} -> ${t.thumbnailUrl}`), ...result.messages] };
  })
});

/** A preview target is a file path, or an admitted asset id whose outputPath is used. */
function resolvePreviewTarget(cwd: string, target: string): string {
  const asFile = resolve(cwd, target);
  if (existsSync(asFile) && statSync(asFile).isFile()) return asFile;
  if (!/[\\/]/.test(target) && !/\.(glb|gltf)$/i.test(target)) {
    const asset = readAssetManifest(cwd).assets.find((entry) => entry.id === target);
    if (asset) {
      if (asset.type !== "model") throw new Error(`Asset "${target}" is a ${asset.type}, not a model.`);
      return resolve(cwd, asset.outputPath);
    }
    throw new Error(`"${target}" is neither a file nor an asset id in aura.assets.json. List ids with: aura3d assets list`);
  }
  throw new Error(`File not found: ${target}`);
}

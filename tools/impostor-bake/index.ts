/**
 * PRD-10 T3.6 §9.6 — `tools/impostor-bake` (offline impostor atlas baker).
 *
 * `aura3d assets bake-impostor --asset <id> --views 8 --size 256`:
 *   1. resolves `<id>` from `aura.assets.json` (read-only; the file is
 *      generated and owned by PRD 05),
 *   2. computes the deterministic bake plan (hemi-octahedral view grid, tile
 *      layout, output names),
 *   3. `--execute` renders the atlas in a WebGL2 bake page (remote macos-14
 *      runner only — Playwright + ANGLE Metal; same code path as the CI bake
 *      job) and writes `<id>.impostor.albedo.ktx2` +
 *      `<id>.impostor.normaldepth.ktx2` + `<id>.impostor.json`,
 *   4. merges the record into `packages/engine/assets/world/manifest.json`
 *      (manifest 1.1 shape; binary paths are LFS-tracked per Q-12-1).
 *
 * Determinism contract: `impostorBakePlan` and `impostorManifestEntry` are
 * pure functions of `(assetId, views, size)`; the same GLB hash produces the
 * same atlas hash (asserted by the remote-runner determinism test).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

export interface ImpostorBakeArgs {
  readonly asset: string;
  readonly views: number;   // views² tiles on the hemisphere grid (8 → 64)
  readonly size: number;    // tile size px (256)
  readonly outDir: string;
  readonly execute: boolean;
  readonly manifestPath: string;
}

export interface ImpostorTile {
  readonly view: number;                    // frame index 0..views²-1
  readonly dir: readonly [number, number, number]; // unit view direction (object space)
  readonly tileX: number;
  readonly tileY: number;
}

export interface ImpostorBakePlan {
  readonly asset: string;
  readonly views: number;
  readonly tileSize: number;
  readonly atlasSize: number;               // views * tileSize
  readonly albedoOut: string;
  readonly normalDepthOut: string;
  readonly jsonOut: string;
  readonly tiles: readonly ImpostorTile[];
  readonly planHash: string;                // sha256 of the tile layout
}

/**
 * Hemi-octahedral view grid: views² directions evenly spaced over the upper
 * hemisphere in octahedral space, row-major frame order. Pure function of
 * `views` — this ordering is frozen by §8.4/§9.6 (runtime samples it).
 */
export function impostorViewGrid(views: number): readonly ImpostorTile[] {
  const tiles: ImpostorTile[] = [];
  for (let ty = 0; ty < views; ty += 1) {
    for (let tx = 0; tx < views; tx += 1) {
      // cell centre in octahedral space, then unproject to the hemisphere
      const ox = ((tx + 0.5) / views) * 2 - 1;
      const oy = ((ty + 0.5) / views) * 2 - 1;
      const z = 1 - Math.abs(ox) - Math.abs(oy);       // hemi fold: up positive
      const len = Math.hypot(ox, Math.max(z, 0), oy) || 1;
      tiles.push({
        view: ty * views + tx,
        dir: [ox / len, Math.max(z, 0) / len, oy / len],
        tileX: tx,
        tileY: ty
      });
    }
  }
  return tiles;
}

export function impostorBakePlan(args: Pick<ImpostorBakeArgs, "asset" | "views" | "size" | "outDir">): ImpostorBakePlan {
  const tiles = impostorViewGrid(args.views);
  const hash = createHash("sha256");
  for (const t of tiles) {
    hash.update(`${t.view}:${t.dir.map((v) => v.toFixed(9)).join(",")}@${t.tileX},${t.tileY}\n`);
  }
  return {
    asset: args.asset,
    views: args.views,
    tileSize: args.size,
    atlasSize: args.views * args.size,
    albedoOut: join(args.outDir, `${args.asset}.impostor.albedo.ktx2`),
    normalDepthOut: join(args.outDir, `${args.asset}.impostor.normaldepth.ktx2`),
    jsonOut: join(args.outDir, `${args.asset}.impostor.json`),
    tiles,
    planHash: hash.digest("hex")
  };
}

export interface ImpostorManifestEntry {
  readonly albedoAtlas: string;             // repo-relative ktx2 path
  readonly normalDepthAtlas: string;
  readonly views: number;
  readonly tileSize: number;
  readonly boundingSphere: { readonly center: readonly [number, number, number]; readonly radius: number };
  readonly sourceAsset: string;
  readonly planHash: string;
  readonly atlasHash: string | null;        // filled at --execute time
}

/** Manifest 1.1 record writer — merges `entry` under `assets.<id>.impostor`. */
export function impostorManifestEntry(entry: ImpostorManifestEntry, manifestPath: string): void {
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as { assets?: Record<string, unknown> })
    : {};
  const assets = (manifest.assets ??= {});
  const key = entry.sourceAsset;
  const prev = (assets[key] ?? {}) as Record<string, unknown>;
  assets[key] = { ...prev, impostor: {
    albedoAtlas: entry.albedoAtlas,
    normalDepthAtlas: entry.normalDepthAtlas,
    views: entry.views,
    tileSize: entry.tileSize,
    boundingSphere: entry.boundingSphere,
    planHash: entry.planHash,
    atlasHash: entry.atlasHash
  } };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Locate an asset file in `aura.assets.json` (generated, owner PRD 05 — read only). */
export function resolveAssetFile(assetId: string, cwd: string): string | null {
  for (const candidate of [join(cwd, "aura.assets.json"), join(cwd, "packages/engine/aura.assets.json")]) {
    if (!existsSync(candidate)) continue;
    const data = JSON.parse(readFileSync(candidate, "utf8")) as { assets?: Record<string, { file?: string; url?: string }> };
    const a = data.assets?.[assetId];
    if (a?.file) return a.file;
    if (a?.url) return a.url;
  }
  return null;
}

export function parseImpostorBakeArgs(argv: readonly string[], cwd: string): ImpostorBakeArgs {
  const opt = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const asset = opt("--asset");
  if (!asset) throw new Error("assets bake-impostor: --asset <id> is required");
  const views = Number(opt("--views") ?? 8);
  const size = Number(opt("--size") ?? 256);
  if (!Number.isInteger(views) || views < 2 || views > 16) throw new Error("--views must be an integer 2..16");
  if (!Number.isInteger(size) || size < 32 || size > 2048) throw new Error("--size must be an integer 32..2048");
  return {
    asset,
    views,
    size,
    outDir: opt("--out") ?? join(cwd, "packages/engine/assets/world/foliage"),
    execute: argv.includes("--execute"),
    manifestPath: join(cwd, "packages/engine/assets/world/manifest.json")
  };
}

/**
 * `aura3d assets bake-impostor` — plan + manifest update always; `--execute`
 * additionally runs the WebGL2 bake (remote macos-14 runner: ANGLE Metal).
 * Without --execute the command prints the plan and writes the manifest entry
 * with `atlasHash: null` (pending bake) — the pixel bake is the CI job's job.
 */
export async function runImpostorBake(argv: readonly string[], io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }): Promise<number> {
  try {
    const args = parseImpostorBakeArgs(argv, io.cwd);
    const plan = impostorBakePlan(args);
    const source = resolveAssetFile(args.asset, io.cwd);
    if (!source) {
      io.stderr(`assets bake-impostor: asset "${args.asset}" not found in aura.assets.json`);
      return 2;
    }
    mkdirSync(args.outDir, { recursive: true });
    if (!args.execute) {
      impostorManifestEntry({
        albedoAtlas: plan.albedoOut,
        normalDepthAtlas: plan.normalDepthOut,
        views: plan.views,
        tileSize: plan.tileSize,
        boundingSphere: { center: [0, 0, 0], radius: 1 }, // placeholder until bake measures it
        sourceAsset: args.asset,
        planHash: plan.planHash,
        atlasHash: null
      }, args.manifestPath);
      io.stdout(JSON.stringify({ plan, manifest: args.manifestPath }, null, 2));
      io.stderr(`assets bake-impostor: plan written; pass --execute on the macos-14 runner to render the atlas`);
      return 0;
    }
    // Remote-runner path: Playwright WebGL2 bake (ANGLE Metal). Implemented by
    // tools/impostor-bake/bake-page.mjs — imported lazily so plan mode has no
    // browser dependency.
    const { bakeImpostorPage } = await import("./bake-page.mjs");
    const result = await bakeImpostorPage({ plan, source });
    impostorManifestEntry({
      albedoAtlas: plan.albedoOut,
      normalDepthAtlas: plan.normalDepthOut,
      views: plan.views,
      tileSize: plan.tileSize,
      boundingSphere: result.boundingSphere,
      sourceAsset: args.asset,
      planHash: plan.planHash,
      atlasHash: result.atlasHash
    }, args.manifestPath);
    io.stdout(JSON.stringify({ plan, ...result, manifest: args.manifestPath }, null, 2));
    return 0;
  } catch (e) {
    io.stderr(`assets bake-impostor: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

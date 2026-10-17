import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
function impostorViewGrid(views) {
  const tiles = [];
  for (let ty = 0; ty < views; ty += 1) {
    for (let tx = 0; tx < views; tx += 1) {
      const ox = (tx + 0.5) / views * 2 - 1;
      const oy = (ty + 0.5) / views * 2 - 1;
      const z = 1 - Math.abs(ox) - Math.abs(oy);
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
function impostorBakePlan(args) {
  const tiles = impostorViewGrid(args.views);
  const hash = createHash("sha256");
  for (const t of tiles) {
    hash.update(`${t.view}:${t.dir.map((v) => v.toFixed(9)).join(",")}@${t.tileX},${t.tileY}
`);
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
function impostorManifestEntry(entry, manifestPath) {
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  const assets = manifest.assets ??= {};
  const key = entry.sourceAsset;
  const prev = assets[key] ?? {};
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
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}
`);
}
function resolveAssetFile(assetId, cwd) {
  for (const candidate of [join(cwd, "aura.assets.json"), join(cwd, "packages/engine/aura.assets.json")]) {
    if (!existsSync(candidate)) continue;
    const data = JSON.parse(readFileSync(candidate, "utf8"));
    const a = data.assets?.[assetId];
    if (a?.file) return a.file;
    if (a?.url) return a.url;
  }
  return null;
}
function parseImpostorBakeArgs(argv, cwd) {
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : void 0;
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
async function runImpostorBake(argv, io) {
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
        boundingSphere: { center: [0, 0, 0], radius: 1 },
        // placeholder until bake measures it
        sourceAsset: args.asset,
        planHash: plan.planHash,
        atlasHash: null
      }, args.manifestPath);
      io.stdout(JSON.stringify({ plan, manifest: args.manifestPath }, null, 2));
      io.stderr(`assets bake-impostor: plan written; pass --execute on the macos-14 runner to render the atlas`);
      return 0;
    }
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
export {
  impostorBakePlan,
  impostorManifestEntry,
  impostorViewGrid,
  parseImpostorBakeArgs,
  resolveAssetFile,
  runImpostorBake
};

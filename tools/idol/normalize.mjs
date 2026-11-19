// Thin wrapper over `aura3d assets normalize` (packages/aura3d-cli/src/commands/asset-post/normalize.ts): scale, ground
// and turn a generated GLB so it faces +Z with +Y up, and record aura3d.orientation in asset extras.
// size: { height } | { length } (along +Z after turning) | { width } (X) | { maxDim }. Default keeps the source scale.
// Idol GLBs face +X, so this wrapper keeps `front = "+x"` as its default (the CLI defaults to +z = no turn).
// Loads the CLI source through tsx when available (in-repo, no build needed), else the built packages/aura3d-cli/dist.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../packages/aura3d-cli");

async function load() {
  const tsx = await import("tsx/esm/api").catch(() => null);
  if (tsx) return tsx.tsImport(pathToFileURL(resolve(cliRoot, "src/commands/asset-post/normalize.ts")).href, import.meta.url);
  return import(pathToFileURL(resolve(cliRoot, "dist/commands/asset-post/normalize.js")).href);
}

export async function normalizeGlb(input, output, { front = "+x", size, yawDeg = 0, keepScale = false, provenance = {} } = {}) {
  const impl = await load();
  return impl.normalizeGlb(input, output, { front, size, yawDeg, keepScale, provenance });
}

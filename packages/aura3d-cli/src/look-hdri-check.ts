// Scaffold/deploy-time check for LOOK_HDRI_MISSING: `looks.preset("golden-hour")` (and every other HDRI-backed
// preset) loads /hdri/<file>.hdr at runtime. When that file is absent from public/hdri (or is an unsmudged git-LFS
// pointer) the engine now degrades to a procedural probe and logs LOOK_HDRI_MISSING; this check warns before that.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Preset id -> HDRI file stem (mirrors packages/engine/src/agent-api/looks/lookPresets.ts `v0.hdri`; null presets need none). */
export const LOOK_PRESET_HDRI: Readonly<Record<string, string | null>> = {
  "outdoor-day": "autumn_field_puresky_1k",
  "golden-hour": "kloppenheim_06_puresky_1k",
  overcast: "autumn_field_puresky_1k",
  "night-city": null,
  "polar-night": null,
  "alpine-snow": "autumn_field_puresky_1k",
  "interior-warm": "studio_small_08_1k",
  "interior-neutral": "studio_small_08_1k",
  "interior-industrial": "studio_small_08_1k",
  space: null,
  underwater: null,
  "product-studio": "studio_small_08_1k",
  "character-showcase": "studio_small_08_1k",
  "arena-fight": "studio_small_08_1k",
  "neon-arcade": null
};

function* sourceFiles(dir: string, depth = 0): Generator<string> {
  if (depth > 6 || !existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path, depth + 1);
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) yield path;
  }
}

/** The HDRI stems the project's source asks for: `looks.preset("id")` / `look: "id"` presets and literal `/hdri/<stem>.hdr` urls. */
export function usedLookHdris(projectDir: string): ReadonlyMap<string, string> {
  const used = new Map<string, string>();
  for (const file of sourceFiles(join(projectDir, "src"))) {
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    const label = file.slice(projectDir.length + 1);
    for (const match of text.matchAll(/looks\.(?:preset|describe|resolve)\(\s*["'`]([a-z0-9-]+)["'`]|\blook\s*:\s*["'`]([a-z0-9-]+)["'`]/g)) {
      const stem = LOOK_PRESET_HDRI[match[1] ?? match[2] ?? ""];
      if (stem && !used.has(stem)) used.set(stem, `looks.preset("${match[1] ?? match[2]}") in ${label}`);
    }
    for (const match of text.matchAll(/["'`]\/hdri\/([A-Za-z0-9_.-]+?)\.hdr["'`]/g)) {
      if (!used.has(match[1]!)) used.set(match[1]!, `"/hdri/${match[1]}.hdr" in ${label}`);
    }
  }
  return used;
}

function isUsableHdr(path: string): boolean {
  if (!existsSync(path)) return false;
  const size = statSync(path).size;
  if (size < 1024) {
    const head = readFileSync(path, "utf8").slice(0, 64);
    if (head.startsWith("version https://git-lfs") || !head.startsWith("#?")) return false;
  }
  return true;
}

/** Warnings for every used HDRI that is not under public/hdri (or dist/hdri after a build) or is an LFS pointer. */
export function lookHdriWarnings(projectDir: string, distDir = "dist"): string[] {
  const root = resolve(projectDir);
  const warnings: string[] = [];
  for (const [stem, where] of usedLookHdris(root)) {
    const file = `${stem}.hdr`;
    const inPublic = isUsableHdr(join(root, "public", "hdri", file));
    const inDist = isUsableHdr(join(root, distDir, "hdri", file));
    if (inPublic || inDist) continue;
    warnings.push(
      `LOOK_HDRI_MISSING: ${where} loads /hdri/${file}, but public/hdri/${file} is missing or a git-LFS pointer. ` +
        `At runtime the engine falls back to a procedural probe (lighting will differ) and logs LOOK_HDRI_MISSING. ` +
        `Fix: copy fixtures/environment-corpus/hdri/${file} into public/hdri/ (scaffolded templates ship it) and run \`git lfs pull\`.`
    );
  }
  return warnings;
}

/**
 * PRD-10 §6.6 / T6.7 — `BiomeEnvironmentRegistry`.
 *
 * Maps the §6.3 biome ids that take an HDRI source to asset ids under
 * `engine/assets/world/hdri/` (admitted through C-17, CC0/MIT only — §6.6
 * HDRIs row). Load checks enforce the lane's own floors: ≥ 2k for High,
 * RGBE/EXR source only, and a distinct SHA-256 per id (an aliased file is a
 * load failure, never silent).
 *
 * Biomes whose rig's `environmentSpec.source` isn't `"hdri"` have no entry
 * here — `sky-capture`/`space-bake`/`room` resolve procedurally.
 * Unadmitted ids report `pending-admission` and the resolver falls back to
 * the rig's sky-capture path rather than failing.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/** Biome id → the HDRI asset id expected under `assets/world/hdri/` (§6.6). */
export const BIOME_HDRI_IDS: Readonly<Record<string, string>> = {
  "outdoor-day": "world/hdri/outdoor-day-meadow-2k",
  "golden-hour": "world/hdri/golden-hour-sunset-2k",
  overcast: "world/hdri/overcast-sky-2k",
  "night-city": "world/hdri/night-city-lights-2k",
  "polar-night": "world/hdri/polar-night-sky-2k",
  "interior-warm": "world/hdri/interior-warm-loft-2k",
  "interior-industrial": "world/hdri/interior-industrial-hall-2k"
  // interior-neutral is procedural (no file, §6.6); sky-capture rigs don't list here
};

export type BiomeHdriStatus = "ok" | "pending-admission" | "invalid";

export interface BiomeHdriCheck {
  readonly biome: string;
  readonly assetId: string;
  readonly status: BiomeHdriStatus;
  readonly failures: readonly string[];
}

export interface BiomeHdriAssetFile {
  readonly path: string;      // resolved disk path
  readonly format: "hdr" | "exr" | "ktx2"; // RGBE (.hdr) or EXR only (§6.6/C-16)
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

/**
 * Load checks for one admitted HDRI file (T6.7): RGBE/EXR source only,
 * `≥ 2k` width at High/Ultra tiers (1k fallbacks allowed at Medium/Low), and a
 * SHA-256 that must differ from every other admitted id.
 */
export function checkBiomeHdri(
  file: BiomeHdriAssetFile,
  tier: "low" | "medium" | "high" | "ultra",
  otherHashes: readonly string[]
): readonly string[] {
  const failures: string[] = [];
  if (file.format !== "hdr" && file.format !== "exr") {
    failures.push(`${file.path}: source must be RGBE (.hdr) or EXR (.exr); got .${file.format} (C-16 transcode targets are produced by assets optimize, not shipped as sources)`);
  }
  if ((tier === "high" || tier === "ultra") && file.width < 2048) {
    failures.push(`${file.path}: High tier requires ≥ 2k equirect width; got ${file.width}px`);
  }
  if (file.height * 2 !== file.width) {
    failures.push(`${file.path}: equirect must be 2:1; got ${file.width}×${file.height}`);
  }
  if (otherHashes.includes(file.sha256)) {
    failures.push(`${file.path}: SHA-256 ${file.sha256} duplicates another admitted biome HDRI (aliasing is not allowed)`);
  }
  return failures;
}

/**
 * Inspect the world asset manifest (engine/assets/world/manifest.json) and
 * report every biome HDRI's status. Missing files are `pending-admission`
 * (resolver falls back to sky-capture), present files run `checkBiomeHdri`.
 */
export function auditBiomeHdris(
  manifestPath: string,
  tier: "low" | "medium" | "high" | "ultra" = "high",
  readFile: (path: string) => Uint8Array = (p) => new Uint8Array(readFileSync(p)),
  fileExists: (path: string) => boolean = existsSync
): readonly BiomeHdriCheck[] {
  const manifest = fileExists(manifestPath)
    ? (JSON.parse(new TextDecoder().decode(readFile(manifestPath))) as {
        readonly assets?: Record<string, { readonly file: string; readonly format?: string; readonly width?: number; readonly height?: number; readonly hash?: string }>;
      })
    : { assets: {} };
  const seenHashes: string[] = [];
  const checks: BiomeHdriCheck[] = [];
  for (const [biome, assetId] of Object.entries(BIOME_HDRI_IDS)) {
    const entry = manifest.assets?.[assetId];
    if (!entry) {
      checks.push({ biome, assetId, status: "pending-admission", failures: [] });
      continue;
    }
    const format = (entry.format ?? (entry.file.endsWith(".exr") ? "exr" : entry.file.endsWith(".hdr") ? "hdr" : "ktx2")) as BiomeHdriAssetFile["format"];
    const sha = entry.hash ?? "";
    const failures: string[] = [...checkBiomeHdri(
      {
        path: entry.file,
        format,
        width: entry.width ?? 0,
        height: entry.height ?? 0,
        sha256: sha
      },
      tier,
      seenHashes
    )];
    // manifest hash must match the file on disk when the file is present
    const base = manifestPath.replace(/manifest\.json$/, "");
    const diskPath = `${base}${entry.file}`;
    if (failures.length === 0 && fileExists(diskPath)) {
      const actual = `sha256:${createHash("sha256").update(readFile(diskPath)).digest("hex")}`;
      if (actual !== sha) failures.push(`${entry.file}: manifest hash ${sha} ≠ file ${actual}`);
    } else if (!fileExists(diskPath)) {
      failures.push(`${entry.file}: manifest entry exists but file is missing`);
    }
    if (sha) seenHashes.push(sha);
    checks.push({ biome, assetId, status: failures.length === 0 ? "ok" : "invalid", failures });
  }
  return checks;
}

/**
 * Resolve a biome → admitted HDRI asset id, or `undefined` (pending admission
 * or non-HDRI rig — caller falls back to the rig's procedural capture).
 */
export function resolveBiomeHdriId(
  biome: string,
  manifestPath: string,
  tier: "low" | "medium" | "high" | "ultra" = "high"
): string | undefined {
  const check = auditBiomeHdris(manifestPath, tier).find((c) => c.biome === biome);
  return check && check.status === "ok" ? check.assetId : undefined;
}

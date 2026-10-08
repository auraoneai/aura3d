import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";
import type { AuraLibraryEntryShape, AuraLibraryManifestShape } from "@aura3d/asset-index";
import type { AuraCliAssetEntry } from "./asset-core-types.js";

/**
 * PRD-05 §6.6 curated library.
 *
 * `aura.library.json` at the project root declares kits (the §6.6 table:
 * characters/humanoid-pbr, vehicles/road, hdri, …) and entries. Each entry is
 * an admitted asset whose bytes live under `assets/library/<kit>/`; a library
 * member outranks every remote candidate in `assets search`/`resolve` (the
 * `library` membership + `lookDevApproved` + `artDirection` terms in
 * scoring.ts) and resolves by local copy instead of a network pull.
 */

export const LIBRARY_SCHEMA = "aura3d.library/1.0";
export const LIBRARY_MANIFEST_FILE = "aura.library.json";
export const LIBRARY_DIR = "assets/library";

export interface AuraLibraryKit {
  readonly id: string;
  readonly artDirection?: string;
  /** Human description of the kit contract (the §6.6 table row). */
  readonly contents?: string;
  readonly consumers?: readonly string[];
}

/**
 * Library entry: the manifest-1.1 fields curated intake needs plus the
 * adapter-facing shape (`AuraLibraryEntryShape`) it must satisfy. Kept as a
 * standalone interface — `AuraCliAssetEntry` and the adapter shape disagree
 * on a few field types, and satisfying both structurally is enough.
 */
export interface AuraLibraryEntry extends AuraLibraryEntryShape {
  readonly kit: string;
  readonly sha256?: string;
  readonly url?: string;
  readonly hash?: string;
  readonly outputPath?: string;
  readonly role?: AuraCliAssetEntry["role"];
  readonly quality?: AuraCliAssetEntry["quality"];
  readonly admission?: AuraCliAssetEntry["admission"];
  readonly lookDev?: AuraCliAssetEntry["lookDev"];
  readonly derived?: AuraCliAssetEntry["derived"];
  readonly provenance?: AuraCliAssetEntry["provenance"];
  readonly gameplayCamera?: AuraCliAssetEntry["gameplayCamera"];
  /** §6.7 HDRI environment entries: dominant-light direction (unit, equirect centroid of p99.9 luminance). */
  readonly sunDirection?: readonly [number, number, number];
  /** §6.7 HDRI: 99th-percentile relative luminance. */
  readonly luminanceP99?: number;
  /** §6.7 HDRI: estimated scene white balance (McCamy CCT). */
  readonly whiteBalanceK?: number;
  /**
   * §6.6 intake record: the §6.2 optimize profile this entry is admitted under
   * and where it stands (`pending` = optimize not yet run; `done` = derived
   * written; `not-needed` = non-model formats like .hdr/.zip texture sets).
   */
  readonly optimizePlan?: {
    readonly profile?: string;
    readonly state: "pending" | "done" | "not-needed";
    readonly notes?: string;
  };
}

export interface AuraLibraryManifest extends AuraLibraryManifestShape {
  readonly kits: readonly AuraLibraryKit[];
  readonly entries: readonly AuraLibraryEntry[];
}

export function libraryManifestPath(projectDir: string): string {
  return join(projectDir, LIBRARY_MANIFEST_FILE);
}

export function readAuraLibrary(projectDir: string): AuraLibraryManifest | undefined {
  const path = libraryManifestPath(projectDir);
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as AuraLibraryManifest;
  if (parsed.schema !== LIBRARY_SCHEMA) {
    throw new Error(`aura.library.json: unsupported schema "${parsed.schema}" (expected ${LIBRARY_SCHEMA})`);
  }
  return parsed;
}

export function writeAuraLibrary(projectDir: string, manifest: AuraLibraryManifest): void {
  const path = libraryManifestPath(projectDir);
  const out = {
    ...manifest,
    schema: LIBRARY_SCHEMA,
    kits: [...manifest.kits],
    entries: [...manifest.entries],
  };
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
}

export interface LibraryAddOptions {
  readonly projectDir: string;
  readonly kit: string;
  readonly entryId: string;
  readonly sourceFile: string;
  readonly entry: Omit<AuraLibraryEntry, "id" | "kit" | "libraryPath">;
  /** Absolute target dir override (defaults to assets/library/<kit>/). */
  readonly targetDir?: string;
}

export function addLibraryEntry(options: LibraryAddOptions): AuraLibraryEntry {
  const manifest = readAuraLibrary(options.projectDir) ?? {
    schema: LIBRARY_SCHEMA,
    kits: [],
    entries: [],
  };
  const kit = manifest.kits.find((k) => k.id === options.kit);
  if (!kit) {
    throw new Error(
      `aura.library.json has no kit "${options.kit}" — declare it in kits[] first (§6.6 table).`,
    );
  }
  if (manifest.entries.some((e) => e.kit === options.kit && e.id === options.entryId)) {
    throw new Error(`library entry "${options.entryId}" already exists in kit "${options.kit}"`);
  }
  const ext = extname(options.sourceFile);
  const targetDir = options.targetDir ?? join(options.projectDir, LIBRARY_DIR, options.kit);
  mkdirSync(targetDir, { recursive: true });
  const fileName = `${options.entryId}${ext}`;
  const dest = join(targetDir, fileName);
  copyFileSync(resolve(options.sourceFile), dest);
  const libraryPath = `${LIBRARY_DIR}/${options.kit}/${fileName}`;
  const bytes = statSync(dest).size;
  const sha256 = createHash("sha256").update(readFileSync(dest)).digest("hex");
  const entry: AuraLibraryEntry = {
    ...options.entry,
    id: options.entryId,
    kit: options.kit,
    libraryPath,
    sizeBytes: bytes,
    sha256,
  };
  writeAuraLibrary(options.projectDir, {
    ...manifest,
    entries: [...manifest.entries, entry],
  });
  return entry;
}

export interface LibrarySyncIssue {
  readonly entryId: string;
  readonly kit: string;
  readonly issue: string;
}

/** Verify every entry's bytes exist and hash-match; returns the issue list (empty = clean). */
export function syncAuraLibrary(projectDir: string): { readonly manifest: AuraLibraryManifest; readonly issues: readonly LibrarySyncIssue[] } {
  const manifest = readAuraLibrary(projectDir);
  if (!manifest) throw new Error(`no ${LIBRARY_MANIFEST_FILE} found under ${projectDir}`);
  const issues: LibrarySyncIssue[] = [];
  for (const entry of manifest.entries) {
    const file = join(projectDir, entry.libraryPath);
    if (!existsSync(file)) {
      issues.push({ entryId: entry.id, kit: entry.kit, issue: `missing file ${entry.libraryPath}` });
      continue;
    }
    const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (entry.sha256 && sha !== entry.sha256) {
      issues.push({ entryId: entry.id, kit: entry.kit, issue: `sha256 drift: manifest ${entry.sha256.slice(0, 12)}… vs file ${sha.slice(0, 12)}…` });
    }
  }
  return { manifest, issues };
}

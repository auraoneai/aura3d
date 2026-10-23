/**
 * Isolated `aura3d assets import-meshy --into <dir> --prefix <game>`.
 *
 * Importing from a monorepo root rewrites shared files (aura.assets.json, src/aura-assets.ts through typegen,
 * public/aura-assets/*, aura-evidence/meshy/*), so many games importing at once race and pollute one commit. The
 * isolated mode runs the same admission in a throw-away project, validates there, and copies only the hashed GLB plus
 * its rights and metadata evidence into the game's own folder. Nothing in the invoking project is touched.
 */

import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { importMeshyAsset } from "../../meshy/import.js";
import type { AuraAssetQuality, AuraCliAssetRole } from "../../asset-core-types.js";
import type { MeshyAssetProfile } from "../../meshy/admission.js";
import { validateAssets } from "../../index.js";
import { assertGameTag } from "../meshyLedger.js";

export interface IsolatedImportOptions {
  /** Meshy download directory (model.glb, meta.json, ...). */
  readonly input: string;
  /** The game's own asset folder; receives models/<key>.glb and provenance/<key>.{rights,meta}.json. */
  readonly into: string;
  /** Game/project tag; becomes the typed-key prefix so two games can never share a name. */
  readonly prefix: string;
  /** Role name inside the game: "lamp", "hero". */
  readonly name: string;
  readonly rightsEvidence?: string;
  readonly file?: string;
  readonly thumbnail?: string;
  readonly quality?: AuraAssetQuality;
  readonly role?: AuraCliAssetRole;
  readonly profile?: MeshyAssetProfile;
  readonly cwd?: string;
  /** Replace an existing different model of the same key. */
  readonly overwrite?: boolean;
  readonly keepTemp?: boolean;
}

export interface IsolatedImportResult {
  readonly ok: boolean;
  readonly typedKey: string;
  readonly model?: string;
  readonly sha256?: string;
  readonly bytes?: number;
  readonly rights?: string;
  readonly meta?: string;
  readonly tempProject?: string;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
  readonly messages: readonly string[];
}

/** `last-train` + `lamp` -> `last_train_lamp` (a safe TypeScript key); a name that already carries the prefix is kept. */
export function isolatedTypedKey(prefix: string, name: string): string {
  assertGameTag(prefix);
  const clean = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const tag = clean(prefix);
  const role = clean(name);
  if (!role) throw new Error(`Asset name "${name}" has no usable characters.`);
  const key = role === tag || role.startsWith(`${tag}_`) ? role : `${tag}_${role}`;
  return /^[A-Za-z_$]/.test(key) ? key : `_${key}`;
}

/** True for the Aura3D monorepo root, where a plain import would rewrite shared manifests. */
export function isAuraMonorepoRoot(dir: string): boolean {
  return existsSync(join(dir, "pnpm-workspace.yaml")) && existsSync(join(dir, "packages", "aura3d-cli", "package.json"));
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function importMeshyIsolated(options: IsolatedImportOptions): IsolatedImportResult {
  const cwd = resolve(options.cwd ?? process.cwd());
  const key = isolatedTypedKey(options.prefix, options.name);
  const input = isAbsolute(options.input) ? options.input : resolve(cwd, options.input);
  if (!existsSync(input)) throw new Error(`Meshy download directory not found: ${options.input}`);
  const rightsSource = options.rightsEvidence ? (isAbsolute(options.rightsEvidence) ? options.rightsEvidence : resolve(cwd, options.rightsEvidence)) : join(input, "rights.json");
  if (!existsSync(rightsSource)) throw new Error(`Rights evidence not found: ${rightsSource} (pass --rights-evidence <rights.json>).`);
  const into = isAbsolute(options.into) ? options.into : resolve(cwd, options.into);
  const modelOut = join(into, "models", `${key}.glb`);
  const rightsOut = join(into, "provenance", `${key}.rights.json`);
  const metaOut = join(into, "provenance", `${key}.meta.json`);

  const temp = mkdtempSync(join(tmpdir(), "aura3d-meshy-admit-"));
  try {
    mkdirSync(join(temp, "artifacts", "meshy"), { recursive: true });
    writeFileSync(join(temp, "package.json"), JSON.stringify({ name: "aura3d-meshy-admit", private: true, type: "module" }));
    const staged = join(temp, "artifacts", "meshy", key);
    // Sidecar texture PNGs and raw models are redundant with the embedded GLB textures and trip the single-GLB selection.
    cpSync(input, staged, {
      recursive: true,
      filter: (source) => !/^texture_.*\.png$/i.test(basename(source)) && !/\.raw\.glb$/i.test(basename(source))
    });
    copyFileSync(rightsSource, join(staged, "rights.json"));

    const imported = importMeshyAsset({
      projectDir: temp,
      input: `artifacts/meshy/${key}`,
      name: key,
      rightsEvidence: `artifacts/meshy/${key}/rights.json`,
      ...(options.file ? { file: options.file } : {}),
      ...(options.thumbnail ? { thumbnail: options.thumbnail } : {}),
      ...(options.quality ? { quality: options.quality } : {}),
      ...(options.role ? { role: options.role } : {}),
      ...(options.profile ? { profile: options.profile } : {})
    });
    const validation = validateAssets({ projectDir: temp, assetIds: [key], requireLicense: true });
    const failures = [...validation.failures];
    const warnings = [...validation.warnings];
    if (failures.length > 0) {
      return { ok: false, typedKey: key, failures, warnings, messages: [`${key}: validation failed in the isolated project; nothing was copied.`, ...imported.messages], ...(options.keepTemp ? { tempProject: temp } : {}) };
    }
    const publicDir = join(temp, "public", "aura-assets");
    const hashed = existsSync(publicDir) ? readdirSync(publicDir).find((entry) => entry.startsWith(`${key}.`) && entry.endsWith(".glb")) : undefined;
    if (!hashed) throw new Error(`Isolated import produced no ${key}.<hash>.glb under public/aura-assets.`);
    const produced = join(publicDir, hashed);
    const producedHash = sha256(produced);
    if (existsSync(modelOut) && sha256(modelOut) !== producedHash && options.overwrite !== true) {
      throw new Error(`${modelOut} already exists with different bytes: another game/asset may be using the name "${key}". Pick a different --name or pass --overwrite.`);
    }
    mkdirSync(join(into, "models"), { recursive: true });
    mkdirSync(join(into, "provenance"), { recursive: true });
    copyFileSync(produced, modelOut);
    copyFileSync(rightsSource, rightsOut);
    const metaSource = join(temp, imported.metadataFile);
    copyFileSync(existsSync(metaSource) ? metaSource : join(staged, "meta.json"), metaOut);
    return {
      ok: true,
      typedKey: key,
      model: modelOut,
      sha256: producedHash,
      bytes: readFileSync(modelOut).byteLength,
      rights: rightsOut,
      meta: metaOut,
      failures,
      warnings,
      messages: [`${key}: admitted in an isolated project and copied to ${modelOut}`, ...imported.messages],
      ...(options.keepTemp ? { tempProject: temp } : {})
    };
  } finally {
    if (options.keepTemp !== true) rmSync(temp, { recursive: true, force: true });
  }
}

export function importMeshyIsolatedUsage(): string {
  return "aura3d assets import-meshy <download-dir> --into <game-assets-dir> --prefix <game> --name <role> [--rights-evidence rights.json] [--profile prop|environment|vehicle|humanoid] [--role prop] [--overwrite] [--keep-temp]";
}

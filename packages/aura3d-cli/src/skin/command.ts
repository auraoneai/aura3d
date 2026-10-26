/** CLI glue for the skin tools: `assets validate --skin`, `assets repair-skin`, the release gate and the allow-list. */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { readAssetManifest } from "../asset-manifest.js";
import { analyzeSkin, DEFAULT_SKIN_THRESHOLDS, SKIN_BIND_MISMATCH, SKIN_FLAP, SKIN_JOINT_RANGE, SKIN_NO_SKIN, SKIN_STRETCH, SKIN_WEIGHT_DISTANT, SKIN_WEIGHT_SUM, type SkinAnalysisOptions, type SkinCode, type SkinReport, type SkinThresholds } from "./analysis.js";
import { readGlbFile, writeGlbFile } from "./gltf.js";
import { repairSkin, type RepairSkinOptions } from "./repair.js";
import { rebuildLimbs, RebuildLimbsUnsupported, type RebuildLimbsOptions } from "./rebuildLimbs.js";

export const SKIN_ALLOW_FILE = "aura.skin-allow.json";
export const ALL_SKIN_CODES: readonly SkinCode[] = [SKIN_STRETCH, SKIN_FLAP, SKIN_WEIGHT_SUM, SKIN_WEIGHT_DISTANT, SKIN_BIND_MISMATCH, SKIN_JOINT_RANGE, SKIN_NO_SKIN];

export interface SkinAllowEntry { readonly allow: readonly SkinCode[]; readonly reason: string }
/** `aura.skin-allow.json`: `{ "<assetId>": { "allow": ["SKIN_STRETCH"], "reason": "why this known defect ships" } }`. A reason is required. */
export function readSkinAllowlist(projectDir: string): Record<string, SkinAllowEntry> {
  const path = resolve(projectDir, SKIN_ALLOW_FILE);
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, { allow?: string[]; reason?: string }>;
  const out: Record<string, SkinAllowEntry> = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (id.startsWith("$")) continue;
    if (!entry.reason || entry.reason.trim().length < 8) throw new Error(`${SKIN_ALLOW_FILE}: "${id}" needs a reason (what is wrong, where it is tracked).`);
    out[id] = { allow: (entry.allow ?? []) as SkinCode[], reason: entry.reason };
  }
  return out;
}

export function isRiggedGlb(path: string): boolean {
  if (!existsSync(path) || extname(path).toLowerCase() !== ".glb") return false;
  try {
    const buf = readFileSync(path);
    if (buf.length < 24 || buf.readUInt32LE(0) !== 0x46546c67) return false;
    return buf.toString("utf8", 20, 20 + buf.readUInt32LE(12)).includes('"skins"');
  } catch {
    return false;
  }
}

export interface SkinCliOptions {
  readonly file?: string;
  readonly assetIds?: readonly string[];
  readonly clips?: readonly string[];
  readonly samples?: number;
  readonly stretchLimit?: number;
  readonly strict?: boolean;
  readonly warnOnly?: readonly SkinCode[];
  readonly ignoreMaterials?: RegExp;
  readonly json?: boolean;
}

export interface SkinAssetResult { readonly id: string; readonly file: string; readonly report: SkinReport; readonly allowed: readonly SkinCode[]; readonly allowReason?: string; readonly ok: boolean }
export interface SkinProjectReport {
  readonly ok: boolean;
  readonly messages: readonly string[];
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
  readonly assets: readonly SkinAssetResult[];
}

function analysisOptions(options: SkinCliOptions): SkinAnalysisOptions {
  const thresholds: Partial<SkinThresholds> = options.stretchLimit !== undefined ? { stretchLimit: options.stretchLimit } : {};
  return { clips: options.clips, samples: options.samples, thresholds, strict: options.strict, warnOnly: options.warnOnly, ignoreMaterials: options.ignoreMaterials };
}

/** Skin check of one asset, with its allow-list entry applied (allowed codes become warnings that carry the reason). */
export function checkAssetSkin(id: string, file: string, options: SkinCliOptions, allow: Record<string, SkinAllowEntry>): SkinAssetResult {
  const report = analyzeSkin(readGlbFile(file), analysisOptions(options));
  const entry = allow[id];
  const allowed = entry?.allow ?? [];
  const blocking = report.findings.filter((f) => f.severity === "error" && !allowed.includes(f.code));
  return { id, file, report, allowed, ...(entry ? { allowReason: entry.reason } : {}), ok: blocking.length === 0 };
}

export function checkProjectSkins(projectDir: string, options: SkinCliOptions = {}): SkinProjectReport {
  const allow = readSkinAllowlist(projectDir);
  const targets: { id: string; file: string }[] = [];
  if (options.file) {
    targets.push({ id: basename(options.file, extname(options.file)), file: resolve(projectDir, options.file) });
  } else {
    const manifest = readAssetManifest(projectDir);
    for (const asset of manifest.assets) {
      if (options.assetIds && !options.assetIds.includes(asset.id)) continue;
      if (asset.format !== "glb" || !(asset.derived?.outputPath ?? asset.outputPath)) continue;
      const file = resolve(projectDir, asset.derived?.outputPath ?? asset.outputPath);
      if (isRiggedGlb(file)) targets.push({ id: asset.id, file });
    }
  }
  const assets = targets.map((t) => checkAssetSkin(t.id, t.file, options, allow));
  const failures: string[] = [];
  const warnings: string[] = [];
  for (const a of assets) {
    for (const f of a.report.findings) {
      const allowed = a.allowed.includes(f.code);
      if (f.severity === "error" && !allowed) failures.push(`${a.id}: ${f.message}`);
      else warnings.push(`${a.id}: ${f.message}${allowed ? ` [allowed: ${a.allowReason}]` : ""}`);
    }
  }
  return {
    ok: failures.length === 0, failures, warnings, assets,
    messages: failures.length === 0 ? [`Skin check: ${assets.length} rigged asset(s) passed${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`] : failures
  };
}

/** Release gate for `validateAssets` / `check-deploy --release`: failures only, with the allow-list applied. */
export function skinReleaseFailures(projectDir: string, asset: { readonly id: string; readonly format?: string; readonly outputPath: string; readonly derived?: { readonly outputPath?: string } }, allow: Record<string, SkinAllowEntry>): { failures: string[]; warnings: string[] } {
  if (asset.format !== "glb") return { failures: [], warnings: [] };
  const file = resolve(projectDir, asset.derived?.outputPath ?? asset.outputPath);
  if (!isRiggedGlb(file)) return { failures: [], warnings: [] };
  const result = checkAssetSkin(asset.id, file, { samples: 6 }, allow);
  const failures: string[] = [];
  const warnings: string[] = [];
  for (const f of result.report.findings) {
    if (f.severity === "error" && !result.allowed.includes(f.code)) failures.push(`${asset.id}: ${f.message}`);
    else if (result.allowed.includes(f.code)) warnings.push(`${asset.id}: skin finding allowed (${result.allowReason}): ${f.code}`);
  }
  return { failures, warnings };
}

export function formatSkinReport(report: SkinReport, label: string): string {
  const lines: string[] = [];
  lines.push(`${report.ok ? "PASS" : "FAIL"}  ${label}${report.skinned ? `  (height ${report.modelHeight} m, ${report.clips.length} clip(s) x ${report.samplesPerClip} poses)` : "  (no skinned mesh)"}`);
  if (report.skinned) {
    lines.push("  material                                 tris    max stretch   over limit   flaps");
    for (const [name, m] of Object.entries(report.materials)) lines.push(`  ${name.slice(0, 38).padEnd(38)}  ${String(m.triangles).padStart(6)}  ${`${m.maxStretch}x`.padStart(11)}  ${String(m.trianglesOverLimit).padStart(10)}  ${String(m.flaps).padStart(5)}`);
    if (report.bindMismatch.length) lines.push(`  bind-pose mismatch (${SKIN_BIND_MISMATCH}): ${report.bindMismatch.map((b) => `${b.bone} ${Math.round(b.ratio * 100)}% off-axis`).join(", ")}`);
    if (report.jointRanges) {
      const worstKnee = Math.max(...Object.values(report.jointRanges).map((r) => r.kneeMax));
      lines.push(`  humanoid joint ranges: ${Object.keys(report.jointRanges).length} clip(s), knee max ${worstKnee} deg`);
    }
  }
  for (const f of report.findings) lines.push(`  ${f.severity === "error" ? "ERROR" : "warn "} ${f.message}`);
  return lines.join("\n");
}

export function formatProjectSkinReport(report: SkinProjectReport): string {
  const lines = report.assets.map((a) => formatSkinReport(a.report, a.id) + (a.allowed.length ? `\n  allowed (${a.allowed.join(", ")}): ${a.allowReason}` : ""));
  lines.push("", report.messages.join("\n"));
  return lines.join("\n");
}

export interface RepairSkinCliOptions extends RepairSkinOptions {
  readonly rebuildLimbs?: boolean;
  readonly materialMap?: RebuildLimbsOptions["materials"];
  readonly out?: string;
}

export function resolveAssetFile(projectDir: string, target: string): string {
  const direct = resolve(projectDir, target);
  if (existsSync(direct) && extname(direct)) return direct;
  const manifest = readAssetManifest(projectDir);
  const asset = manifest.assets.find((a) => a.id === target);
  if (!asset) throw new Error(`repair-skin: "${target}" is neither a .glb file nor an asset id in the manifest.`);
  return resolve(projectDir, asset.derived?.outputPath ?? asset.outputPath);
}

export function parseMaterialMap(raw: string | undefined): RebuildLimbsOptions["materials"] | undefined {
  if (!raw) return undefined;
  const map: Record<string, RegExp> = {};
  for (const pair of raw.split(",")) {
    const [role, pattern] = pair.split("=");
    if (role && pattern) map[role.trim()] = new RegExp(pattern.trim(), "i");
  }
  return map;
}

export function runRepairSkin(projectDir: string, target: string, options: RepairSkinCliOptions): { readonly ok: boolean; readonly out: string; readonly messages: readonly string[]; readonly report: unknown } {
  const file = resolveAssetFile(projectDir, target);
  let glb = readGlbFile(file);
  const messages: string[] = [];
  let rebuild: unknown;
  if (options.rebuildLimbs) {
    try {
      const rebuilt = rebuildLimbs(glb, { materials: options.materialMap });
      glb = rebuilt.glb;
      rebuild = rebuilt.report;
      messages.push(`rebuilt the legs in the skeleton's pose (scale ${rebuilt.report.scale}): ${rebuilt.report.primitives.map((p) => `${p.material} -${p.removedTriangles}/+${p.addedTriangles} tris`).join(", ")}`);
    } catch (error) {
      if (error instanceof RebuildLimbsUnsupported) return { ok: false, out: "", messages: [error.message], report: null };
      throw error;
    }
  }
  const generic = options.normalize || options.pruneDistant || options.smoothBridges || options.cutStretch !== undefined;
  const repaired = repairSkin(glb, { ...options });
  const final = generic ? repaired.glb : glb;
  const out = resolve(projectDir, options.out ?? join(dirname(file), `${basename(file, extname(file))}.repaired.glb`));
  const { bytes } = writeGlbFile(out, final);
  const after = generic ? repaired.report.after : analyzeSkin(final, { clips: options.clips, samples: options.samples });
  messages.push(`wrote ${out} (${bytes} bytes)`);
  messages.push(after.ok ? "skin check passes after repair" : `skin check still fails after repair: ${after.reasonCodes.join(", ")}`);
  for (const g of repaired.report.guidance) messages.push(g);
  messages.push("Re-admit the repaired file with `aura3d assets add` (it gets a new hash); do not edit the manifest by hand.");
  return { ok: after.ok, out, messages, report: { before: repaired.report.before, after, rebuild, steps: repaired.report.steps } };
}

export const SKIN_HELP = `aura3d assets validate --skin [file.glb] [--asset id[,id]] [--clips Walk,Run] [--samples 10] [--stretch-limit 1.6] [--strict] [--warn-only CODE,CODE] [--json]
  Poses every rigged GLB through the clips it ships and fails on stretched triangles (${SKIN_STRETCH}), thin long flaps (${SKIN_FLAP}), bad weights (${SKIN_WEIGHT_SUM}), distant influences (${SKIN_WEIGHT_DISTANT}), a mesh not in its skeleton's pose (${SKIN_BIND_MISMATCH}, warning unless --strict) and impossible joint ranges (${SKIN_JOINT_RANGE}).
  Known defects that ship are listed with a reason in ${SKIN_ALLOW_FILE}.
aura3d assets repair-skin <file.glb|assetId> [--out file.glb] [--normalize] [--max-influences 4] [--prune-distant] [--smooth-bridges] [--cut-stretch 2] [--rebuild-limbs [--material-map skin=skin,shorts=short,socks=sock,boots=dark]] [--json]
  Every step is opt-in. --rebuild-limbs rebuilds the legs of a recognised humanoid in the pose its skeleton assumes (generalised from the Aura FC fix).`;

export { DEFAULT_SKIN_THRESHOLDS };

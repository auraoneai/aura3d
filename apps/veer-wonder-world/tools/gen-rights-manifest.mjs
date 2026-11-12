#!/usr/bin/env node
// Generates src/assets/rights-manifest.ts (PRD 04 D14): one build-readable licence, owner and review record per
// shipped media file and procedural stage asset, from tools/wonder-assets.json, provenance/audio/*.json,
// provenance/hdri.json and provenance/portraits.json. Fails when any recorded audio file, look HDRI or menu portrait
// has no record, a record's file is missing, or a portrait file's SHA-256 diverges. The module is read by tests and
// tooling only: nothing in the app imports it, so it never reaches the bundle. It names no person: owner and reviewer
// fields are roles.
//
//   node tools/gen-rights-manifest.mjs
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
const OWNER = "AuraOne (project owner)";
const PROCEDURAL_STAGE_LICENSE = "Original procedural @aura3d/engine stage art owned by AuraOne";
const failures = [];

// ---- procedural stage assets (all 65 ModelKeys; zero binary .glb models)
const assets = readJson(join(app, "tools", "wonder-assets.json")).assets;
if (!Array.isArray(assets) || assets.length !== 65) {
  failures.push(`wonder-assets.json: expected 65 procedural assets, got ${Array.isArray(assets) ? assets.length : "non-array"}`);
}
const modelsDir = join(app, "src", "assets", "models");
if (existsSync(modelsDir)) {
  const strayGlbs = readdirSync(modelsDir).filter((f) => f.endsWith(".glb"));
  if (strayGlbs.length > 0) {
    failures.push(`src/assets/models contains ${strayGlbs.length} forbidden .glb file(s)`);
  } else {
    failures.push("src/assets/models directory must not exist");
  }
}
const procedural = (Array.isArray(assets) ? assets : []).map((asset) => ({
  key: asset.key,
  license: PROCEDURAL_STAGE_LICENSE,
  owner: OWNER,
  note: "Drawn from @aura3d/engine procedural geometry; no external asset."
}));

// ---- audio
const audioKinds = [
  ["lines", "en/lines"],
  ["songs", "songs"],
  ["beds", "music"],
  ["sfx", "sfx"]
];
const audio = {};
for (const [kind, dir] of audioKinds) {
  const prov = readJson(join(app, "provenance", "audio", `${kind}.json`));
  const folder = join(app, "src", "assets", "audio", dir);
  const files = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith(".mp3")).sort() : [];
  const tiers = {};
  const rows = [];
  for (const f of files) {
    const id = f.slice(0, -4);
    const record = prov[id];
    if (!record) {
      failures.push(`audio ${kind}/${f}: no provenance record`);
      continue;
    }
    tiers[record.tier ?? "unknown"] = (tiers[record.tier ?? "unknown"] ?? 0) + 1;
    rows.push({ id, tier: record.tier ?? "unknown", endpoint: record.endpoint ?? "unknown", date: record.date ?? "-" });
  }
  audio[kind] = {
    provider: "ElevenLabs through Kiro Prism",
    license: "ElevenLabs output under the AuraOne plan terms at generation time; free-tier or unknown-tier files are prototype-only (07 C9)",
    owner: OWNER,
    review: "agent review (07 section 2), owner instruction 2026-10-29",
    tiers,
    files: rows
  };
}

// ---- look HDRIs
const hdri = readJson(join(app, "provenance", "hdri.json"));
const environments = Object.entries(hdri.files).map(([file, p]) => {
  if (!existsSync(join(app, "..", "..", p.repoPath))) failures.push(`hdri ${file}: ${p.repoPath} is missing`);
  return { file, sha256: p.sha256, license: p.license, source: p.source, owner: "Poly Haven (CC0)" };
});

// ---- menu portraits (rendered from procedural character rigs via tools/render-character-portraits.mjs)
const portraitDir = join(app, "src", "assets", "portraits");
const portraitProvPath = join(app, "provenance", "portraits.json");
const portraitProv = existsSync(portraitProvPath) ? readJson(portraitProvPath) : {};
const portraits = Object.entries(portraitProv).map(([id, p]) => {
  const expectedRel = `src/assets/portraits/${id}.webp`;
  if (p.file !== expectedRel) {
    failures.push(`portrait ${id}: expected file "${expectedRel}", got "${String(p.file)}"`);
  }
  const fullPath = join(app, p.file);
  if (!existsSync(fullPath)) {
    failures.push(`portrait ${id}: ${p.file} is missing`);
  } else {
    const actualSha = sha256Hex(readFileSync(fullPath));
    if (actualSha !== p.sha256) {
      failures.push(`portrait ${id}: sha256 mismatch for ${p.file} (provenance ${p.sha256}, disk ${actualSha})`);
    }
  }
  if (typeof p.license !== "string" || p.license.trim() === "") {
    failures.push(`portrait ${id}: missing license in provenance/portraits.json`);
  }
  return {
    id,
    file: p.file,
    sha256: p.sha256,
    license: p.license,
    source: p.source,
    generator: p.generator ?? "tools/render-character-portraits.mjs",
    owner: OWNER,
    review: `${p.review?.status ?? "unreviewed"} by ${p.review?.reviewer ?? "nobody"} on ${p.review?.date ?? "-"}`
  };
});
for (const file of existsSync(portraitDir) ? readdirSync(portraitDir).filter((f) => f.endsWith(".webp")) : []) {
  if (!portraits.some((p) => p.file.endsWith(`/${file}`))) {
    failures.push(`portrait file ${file} has no record in provenance/portraits.json`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const lines = [];
lines.push("// Generated by tools/gen-rights-manifest.mjs from provenance/ and tools/ (PRD 04 D14). Do not edit.");
lines.push("// Build-readable licence, owner and review records for every procedural stage asset, audio file, look HDRI and portrait.");
lines.push("// Nothing in the app imports this module, so it never reaches the bundle. No person is named: roles only.");
lines.push("");
lines.push("export interface ModelRightsRecord {");
lines.push("  readonly key: string;");
lines.push("  readonly file: string;");
lines.push("  readonly sha256: string;");
lines.push("  readonly license: string;");
lines.push("  readonly generator: string;");
lines.push("  readonly owner: string;");
lines.push("  readonly review: string;");
lines.push("}");
lines.push("");
lines.push("export type AssetRight = ModelRightsRecord;");
lines.push("");
lines.push("export interface ProceduralRightsRecord {");
lines.push("  readonly key: string;");
lines.push("  readonly license: string;");
lines.push("  readonly owner: string;");
lines.push("  readonly note: string;");
lines.push("}");
lines.push("");
lines.push("export interface AudioRightsGroup {");
lines.push("  readonly provider: string;");
lines.push("  readonly license: string;");
lines.push("  readonly owner: string;");
lines.push("  readonly review: string;");
lines.push("  readonly tiers: Readonly<Record<string, number>>;");
lines.push("  readonly files: readonly { readonly id: string; readonly tier: string; readonly endpoint: string; readonly date: string }[];");
lines.push("}");
lines.push("");
lines.push("export interface EnvironmentRightsRecord {");
lines.push("  readonly file: string;");
lines.push("  readonly sha256: string;");
lines.push("  readonly license: string;");
lines.push("  readonly source: string;");
lines.push("  readonly owner: string;");
lines.push("}");
lines.push("");
lines.push("export interface PortraitRightsRecord {");
lines.push("  readonly id: string;");
lines.push("  readonly file: string;");
lines.push("  readonly sha256: string;");
lines.push("  readonly license: string;");
lines.push("  readonly source: string;");
lines.push("  readonly generator: string;");
lines.push("  readonly owner: string;");
lines.push("  readonly review: string;");
lines.push("}");
lines.push("");
lines.push("export interface AllAssetRights {");
lines.push("  readonly models: readonly AssetRight[];");
lines.push("  readonly procedural: readonly ProceduralRightsRecord[];");
lines.push('  readonly audio: Readonly<Record<"lines" | "songs" | "beds" | "sfx", AudioRightsGroup>>;');
lines.push("  readonly environments: readonly EnvironmentRightsRecord[];");
lines.push("  readonly portraits: readonly PortraitRightsRecord[];");
lines.push("}");
lines.push("");
lines.push("export const MODEL_RIGHTS: readonly AssetRight[] = [];");
lines.push("");
lines.push(`export const PROCEDURAL_RIGHTS: readonly ProceduralRightsRecord[] = ${JSON.stringify(procedural, null, 2)};`);
lines.push("");
lines.push(`export const AUDIO_RIGHTS: Readonly<Record<"lines" | "songs" | "beds" | "sfx", AudioRightsGroup>> = ${JSON.stringify(audio)};`);
lines.push("");
lines.push(`export const ENVIRONMENT_RIGHTS: readonly EnvironmentRightsRecord[] = ${JSON.stringify(environments, null, 2)};`);
lines.push("");
lines.push(`export const PORTRAIT_RIGHTS: readonly PortraitRightsRecord[] = ${JSON.stringify(portraits, null, 2)};`);
lines.push("");
lines.push("export const ALL_ASSET_RIGHTS: AllAssetRights = {");
lines.push("  models: MODEL_RIGHTS,");
lines.push("  procedural: PROCEDURAL_RIGHTS,");
lines.push("  audio: AUDIO_RIGHTS,");
lines.push("  environments: ENVIRONMENT_RIGHTS,");
lines.push("  portraits: PORTRAIT_RIGHTS");
lines.push("};");
lines.push("");
writeFileSync(join(app, "src", "assets", "rights-manifest.ts"), lines.join("\n"));
const audioCount = Object.values(audio).reduce((sum, group) => sum + group.files.length, 0);
console.log(`rights-manifest.ts: 0 models, ${procedural.length} procedural, ${audioCount} audio files, ${environments.length} HDRIs, ${portraits.length} portraits`);

// Art-direction audit records (GU47, lane E-I). Pure Node, no dependencies.
//
// The `art-direction` and `look-identity` game-checks are plain .mjs and never evaluate TypeScript. A game proves its
// art direction through a JSON record that its own art-direction unit test writes next to `art/direction.ts`:
//
//   import direction from "../../apps/<app>/art/direction";
//   import { auditArtDirection } from "@aura3d/game/art";
//   import { writeArtDirectionAudit } from "../../tools/game-checks/lib/art-direction.mjs";
//   const violations = auditArtDirection(direction, snapshot);
//   writeArtDirectionAudit("apps/<app>/art/direction.ts", { direction, snapshot, violations });
//   expect(violations).toEqual([]);
//
// The record (`art/direction.audit.json`, schema aura3d.art-direction-audit/1) carries the sha256 of direction.ts, so a
// record older than the source is reported as stale. It is deterministic (no timestamp) and only rewritten when its content
// changes, so rerunning the test on an unchanged direction leaves git clean.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ART_DIRECTION_AUDIT_SCHEMA = "aura3d.art-direction-audit/1";
export const ART_DIRECTION_AUDIT_FILE = "direction.audit.json";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const toPath = (file, root) => {
  if (file instanceof URL) return fileURLToPath(file);
  const text = String(file);
  if (text.startsWith("file:")) return fileURLToPath(text);
  return isAbsolute(text) ? text : resolve(root, text);
};

/** Path of the audit record that belongs to an `art/direction.ts`. */
export function artDirectionAuditPath(directionFile, root = REPO_ROOT) {
  return join(dirname(toPath(directionFile, root)), ART_DIRECTION_AUDIT_FILE);
}

export function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** JSON-safe copy: drops functions and undefined, keeps key order (so the record is stable for unchanged input). */
const plain = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

/**
 * Build the audit record for a direction without writing it.
 * @param {string | URL} directionFile repo-relative or absolute path (or file URL) of art/direction.ts
 * @param {{ direction: object, snapshot?: object, violations: readonly object[], drawCallsBudget?: number }} input
 */
export function artDirectionAuditRecord(directionFile, { direction, snapshot, violations, drawCallsBudget }, root = REPO_ROOT) {
  const file = toPath(directionFile, root);
  if (basename(file) !== "direction.ts") throw new Error(`writeArtDirectionAudit: expected a path to art/direction.ts, got ${file}`);
  if (!existsSync(file)) throw new Error(`writeArtDirectionAudit: ${file} does not exist`);
  if (!direction || typeof direction !== "object") throw new Error("writeArtDirectionAudit: direction (the defineArtDirection result) is required");
  if (!Array.isArray(violations)) throw new Error("writeArtDirectionAudit: violations (the auditArtDirection result) must be an array");
  return {
    schema: ART_DIRECTION_AUDIT_SCHEMA,
    source: relative(root, file).split(sep).join("/"),
    sourceSha256: sha256File(file),
    id: direction.id ?? null,
    genre: direction.genre ?? null,
    signatureEffect: direction.signatureEffect ?? null,
    palette: plain(direction.palette),
    environment: plain(direction.lighting?.environment),
    ...(drawCallsBudget !== undefined ? { drawCallsBudget } : {}),
    violations: plain(violations),
    snapshot: plain(snapshot),
    direction: plain(direction)
  };
}

/** Write `art/direction.audit.json` beside art/direction.ts (only when the content changed). Returns the record. */
export function writeArtDirectionAudit(directionFile, input, root = REPO_ROOT) {
  const record = artDirectionAuditRecord(directionFile, input, root);
  const out = artDirectionAuditPath(directionFile, root);
  const text = `${JSON.stringify(record, null, 2)}\n`;
  if (!existsSync(out) || readFileSync(out, "utf8") !== text) writeFileSync(out, text);
  return record;
}

/**
 * Read and verify the audit record of an art/direction.ts. Never throws.
 * @returns {{ ok: boolean, record: object | null, problems: string[], path: string }}
 */
export function readArtDirectionAudit(directionFile, root = REPO_ROOT) {
  const file = toPath(directionFile, root);
  const path = artDirectionAuditPath(file, root);
  const problems = [];
  if (!existsSync(path)) return { ok: false, record: null, problems: ["missing"], path };
  let record;
  try { record = JSON.parse(readFileSync(path, "utf8")); } catch { return { ok: false, record: null, problems: ["invalid-json"], path }; }
  if (!record || record.schema !== ART_DIRECTION_AUDIT_SCHEMA) problems.push("schema");
  if (existsSync(file) && record?.sourceSha256 !== sha256File(file)) problems.push("stale");
  if (!Array.isArray(record?.violations)) problems.push("no-violations-array");
  else if (record.violations.length > 0) problems.push("violations");
  if (typeof record?.id !== "string" || record.id.length === 0) problems.push("no-id");
  if (typeof record?.signatureEffect !== "string" || record.signatureEffect.length === 0) problems.push("no-signature-effect");
  if (!record?.palette || !Array.isArray(record.palette.primary) || record.palette.primary.length === 0) problems.push("no-palette");
  return { ok: problems.length === 0, record: record ?? null, problems, path };
}

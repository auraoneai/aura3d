#!/usr/bin/env node
/*
 * tools/agent-templates/validate-s-records.mjs — PRD-13 S-row record validator.
 *
 * Validates every committed record under
 *   docs/project/aura3d-quality-rebuild/evidence/prd-13/s-rows/records/**\/*.json
 * against schemas/<record.kind>.schema.json (JSON Schema 2020-12 subset, no
 * dependencies). Exits 1 when any record is invalid. With no records committed
 * it prints "0 records" and exits 0: nothing exists to validate yet, and every
 * S-row stays NOT-RUN in s-rows/README.md until a record lands.
 *
 * Supported keywords: $ref (local #/$defs/...), allOf, type, const, enum,
 * pattern, minLength, minimum, maximum, minItems, maxItems, items, contains,
 * minContains, properties, required, additionalProperties (boolean). Any other
 * keyword in a schema is an error, so a schema can never silently rely on an
 * unchecked constraint.
 *
 *   node tools/agent-templates/validate-s-records.mjs [--dir <s-rows dir>]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolDir, "..", "..");
export const DEFAULT_S_ROWS_DIR = path.join(repoRoot, "docs", "project", "aura3d-quality-rebuild", "evidence", "prd-13", "s-rows");

const ANNOTATIONS = new Set(["$schema", "$id", "$defs", "title", "description"]);
const KEYWORDS = new Set(["$ref", "allOf", "type", "const", "enum", "pattern", "minLength", "minimum", "maximum", "minItems", "maxItems", "items", "contains", "minContains", "properties", "required", "additionalProperties"]);

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(value, type) {
  const actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b) || typeof a !== "object" || a === null) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref "${ref}" (only local #/... refs)`);
  let node = root;
  for (const part of ref.slice(2).split("/")) {
    node = node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (node === undefined) throw new Error(`unresolvable $ref "${ref}"`);
  }
  return node;
}

/**
 * Validate `value` against `schema`. Returns a list of "<json-pointer>: message"
 * strings; empty means valid. Throws on unsupported schema keywords.
 */
export function validateAgainstSchema(schema, value, root = schema, at = "") {
  const errors = [];
  const where = at || "/";
  if (typeof schema !== "object" || schema === null) throw new Error(`schema at ${where} is not an object`);
  for (const key of Object.keys(schema)) {
    if (!KEYWORDS.has(key) && !ANNOTATIONS.has(key)) throw new Error(`unsupported schema keyword "${key}" at ${where}`);
  }
  if (schema.$ref) errors.push(...validateAgainstSchema(resolveRef(root, schema.$ref), value, root, at));
  for (const sub of schema.allOf ?? []) errors.push(...validateAgainstSchema(sub, value, root, at));
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push(`${where}: expected ${types.join("|")}, got ${typeOf(value)}`);
      return errors;
    }
  }
  if (Object.hasOwn(schema, "const") && !deepEqual(value, schema.const)) {
    errors.push(`${where}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.some((option) => deepEqual(option, value))) {
    errors.push(`${where}: ${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`);
  }
  if (typeof value === "string") {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${where}: "${value}" does not match /${schema.pattern}/`);
    if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push(`${where}: shorter than ${schema.minLength}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${where}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${where}: ${value} > maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${where}: ${value.length} items < minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${where}: ${value.length} items > maxItems ${schema.maxItems}`);
    if (schema.items) value.forEach((item, i) => errors.push(...validateAgainstSchema(schema.items, item, root, `${at}/${i}`)));
    if (schema.contains) {
      const matches = value.filter((item) => validateAgainstSchema(schema.contains, item, root, at).length === 0).length;
      const need = schema.minContains ?? 1;
      if (matches < need) errors.push(`${where}: ${matches} items match "contains", need ${need}`);
    }
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${where}: missing required "${key}"`);
    }
    const props = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(props, key)) errors.push(...validateAgainstSchema(props[key], child, root, `${at}/${key}`));
      else if (schema.additionalProperties === false) errors.push(`${where}: unexpected property "${key}"`);
    }
  }
  return errors;
}

/** Load schemas/<kind>.schema.json for a record and validate it. */
export function validateRecord(record, schemasDir) {
  const kind = record && typeof record === "object" ? record.kind : undefined;
  if (typeof kind !== "string" || !/^[a-z0-9-]+$/.test(kind)) return [`/: record has no valid "kind"`];
  const schemaPath = path.join(schemasDir, `${kind}.schema.json`);
  if (!existsSync(schemaPath)) return [`/kind: no schema ${path.basename(schemaPath)} for kind "${kind}"`];
  return validateAgainstSchema(JSON.parse(readFileSync(schemaPath, "utf8")), record);
}

function listJson(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJson(full);
    return entry.isFile() && entry.name.endsWith(".json") ? [full] : [];
  }).sort();
}

/** Validate every record under <sRowsDir>/records. */
export function validateRecordsDir(sRowsDir = DEFAULT_S_ROWS_DIR) {
  const schemasDir = path.join(sRowsDir, "schemas");
  const results = listJson(path.join(sRowsDir, "records")).map((file) => {
    let errors;
    try {
      errors = validateRecord(JSON.parse(readFileSync(file, "utf8")), schemasDir);
    } catch (error) {
      errors = [`/: ${error?.message ?? error}`];
    }
    return { file, errors };
  });
  return { records: results.length, invalid: results.filter((r) => r.errors.length).length, results };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--dir");
  const dir = i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : DEFAULT_S_ROWS_DIR;
  const summary = validateRecordsDir(dir);
  for (const { file, errors } of summary.results) {
    const rel = path.relative(repoRoot, file);
    if (errors.length) {
      console.error(`INVALID ${rel}`);
      for (const e of errors) console.error(`  ${e}`);
    } else {
      console.log(`ok ${rel}`);
    }
  }
  console.log(`${summary.records} records, ${summary.invalid} invalid`);
  process.exit(summary.invalid ? 1 : 0);
}

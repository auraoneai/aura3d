/**
 * Minimal JSON-Schema (draft-07 subset) validator covering the vocabulary of
 * `tools/quality-rebuild-capture/games.schema.json`: `type`, `required`,
 * `properties`, `items`, `enum`, `minimum`/`maximum`, and `#/definitions/*`
 * `$ref`s. `additionalProperties` is honoured (allowed; only `false` errors).
 * Returns a flat list of error strings, ajv-style `instancePath` prefixed.
 */

interface SchemaObject {
  readonly $ref?: string;
  readonly type?: string | readonly string[];
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, SchemaObject>>;
  readonly items?: SchemaObject;
  readonly enum?: readonly unknown[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly additionalProperties?: boolean | SchemaObject;
  readonly definitions?: Readonly<Record<string, SchemaObject>>;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value as number)) return "integer";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number";
  if (type === "array") return Array.isArray(value);
  return typeOf(value) === type;
}

export function validateJsonSchema(value: unknown, schema: SchemaObject, root: SchemaObject = schema, at = ""): string[] {
  const errors: string[] = [];
  const resolved = schema.$ref !== undefined
    ? root.definitions?.[schema.$ref.replace(/^#\/definitions\//, "")]
    : schema;
  if (resolved === undefined) return [`${at}: unresolvable $ref ${schema.$ref}`];
  if (resolved.type !== undefined) {
    const types = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
    if (!types.some((type) => matchesType(value, type))) {
      errors.push(`${at}: expected ${types.join("|")}, got ${typeOf(value)}`);
      return errors;
    }
  }
  if (resolved.enum !== undefined && !resolved.enum.some((entry) => entry === value)) {
    errors.push(`${at}: ${JSON.stringify(value)} not in enum`);
  }
  if (typeof value === "number") {
    if (resolved.minimum !== undefined && value < resolved.minimum) errors.push(`${at}: ${value} < minimum ${resolved.minimum}`);
    if (resolved.maximum !== undefined && value > resolved.maximum) errors.push(`${at}: ${value} > maximum ${resolved.maximum}`);
  }
  if (typeOf(value) === "object") {
    const record = value as Record<string, unknown>;
    for (const key of resolved.required ?? []) {
      if (!(key in record)) errors.push(`${at}: missing required property "${key}"`);
    }
    const known = new Set(Object.keys(resolved.properties ?? {}));
    for (const [key, entry] of Object.entries(record)) {
      if (known.has(key)) {
        errors.push(...validateJsonSchema(entry, resolved.properties![key], root, `${at}/${key}`));
      } else if (resolved.additionalProperties === false) {
        errors.push(`${at}: additional property "${key}"`);
      }
    }
  }
  if (Array.isArray(value) && resolved.items !== undefined) {
    value.forEach((entry, i) => {
      errors.push(...validateJsonSchema(entry, resolved.items!, root, `${at}/${i}`));
    });
  }
  return errors;
}

import { ValidationError } from "./Errors.js";

export type VersionedFieldKind =
  | "boolean"
  | "int32"
  | "uint32"
  | "float32"
  | "float64"
  | "string"
  | "array"
  | "object";

export interface VersionedSchemaField {
  readonly name: string;
  readonly kind: VersionedFieldKind;
  readonly required?: boolean;
  readonly defaultValue?: unknown;
  readonly elementKind?: VersionedFieldKind;
  readonly schema?: VersionedSchema;
}

export interface VersionedSchemaValidation {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export class VersionedSchema {
  private readonly fields = new Map<string, VersionedSchemaField>();

  constructor(readonly name: string, readonly version: number) {
    if (!name.trim()) throw new ValidationError("SCHEMA_NAME", "VersionedSchema requires a non-empty name.");
    if (!Number.isSafeInteger(version) || version < 0) throw new ValidationError("SCHEMA_VERSION", "VersionedSchema version must be a non-negative integer.");
  }

  addField(field: VersionedSchemaField): this {
    if (!field.name.trim()) throw new ValidationError("SCHEMA_FIELD", "Schema field requires a non-empty name.");
    if (this.fields.has(field.name)) throw new ValidationError("SCHEMA_FIELD_DUPLICATE", `Duplicate schema field: ${field.name}`);
    if (field.kind === "array" && !field.elementKind) throw new ValidationError("SCHEMA_ARRAY_ELEMENT", `Array field ${field.name} requires elementKind.`);
    this.fields.set(field.name, field);
    return this;
  }

  getField(name: string): VersionedSchemaField | undefined {
    return this.fields.get(name);
  }

  getFields(): readonly VersionedSchemaField[] {
    return [...this.fields.values()];
  }

  validate(data: unknown): VersionedSchemaValidation {
    const issues: string[] = [];
    if (!isRecord(data)) {
      return { ok: false, issues: [`${this.name} must be an object.`] };
    }
    for (const field of this.fields.values()) {
      const value = data[field.name];
      if (value === undefined) {
        if (field.required && field.defaultValue === undefined) issues.push(`${field.name} is required.`);
        continue;
      }
      collectTypeIssues(value, field, field.name, issues);
    }
    return { ok: issues.length === 0, issues };
  }

  serialize(data: unknown): Record<string, unknown> {
    const validation = this.validate(data);
    if (!validation.ok) throw new ValidationError("SCHEMA_VALIDATE", validation.issues.join(" "));
    const record = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const field of this.fields.values()) {
      const value = record[field.name];
      if (value !== undefined) {
        result[field.name] = value;
      } else if (field.defaultValue !== undefined) {
        result[field.name] = cloneValue(field.defaultValue);
      }
    }
    return result;
  }

  deserialize(data: unknown): Record<string, unknown> {
    return this.serialize(data);
  }

  static builder(name: string, version: number): VersionedSchemaBuilder {
    return new VersionedSchemaBuilder(name, version);
  }
}

export class VersionedSchemaBuilder {
  private readonly schema: VersionedSchema;

  constructor(name: string, version: number) {
    this.schema = new VersionedSchema(name, version);
  }

  boolean(name: string, options: FieldOptions<boolean> = {}): this {
    return this.field({ name, kind: "boolean", ...options });
  }

  int32(name: string, options: FieldOptions<number> = {}): this {
    return this.field({ name, kind: "int32", ...options });
  }

  uint32(name: string, options: FieldOptions<number> = {}): this {
    return this.field({ name, kind: "uint32", ...options });
  }

  float32(name: string, options: FieldOptions<number> = {}): this {
    return this.field({ name, kind: "float32", ...options });
  }

  string(name: string, options: FieldOptions<string> = {}): this {
    return this.field({ name, kind: "string", ...options });
  }

  array(name: string, elementKind: VersionedFieldKind, options: FieldOptions<readonly unknown[]> = {}): this {
    return this.field({ name, kind: "array", elementKind, ...options });
  }

  object(name: string, schema?: VersionedSchema, options: FieldOptions<Record<string, unknown>> = {}): this {
    return this.field({ name, kind: "object", schema, ...options });
  }

  field(field: VersionedSchemaField): this {
    this.schema.addField(field);
    return this;
  }

  build(): VersionedSchema {
    return this.schema;
  }
}

export interface FieldOptions<T> {
  readonly required?: boolean;
  readonly defaultValue?: T;
}

export interface MigrationDefinition<T = unknown> {
  readonly from: number;
  readonly to: number;
  readonly description?: string;
  migrate(data: T): T;
}

export class MigrationRegistry<T = unknown> {
  private readonly migrations = new Map<number, MigrationDefinition<T>[]>();

  register(migration: MigrationDefinition<T>): this {
    if (!Number.isSafeInteger(migration.from) || !Number.isSafeInteger(migration.to) || migration.to <= migration.from) {
      throw new ValidationError("MIGRATION_VERSION", "Migration must move from a lower integer version to a higher integer version.");
    }
    const list = this.migrations.get(migration.from) ?? [];
    if (list.some((entry) => entry.to === migration.to)) {
      throw new ValidationError("MIGRATION_DUPLICATE", `Duplicate migration path: ${migration.from} -> ${migration.to}`);
    }
    list.push(migration);
    list.sort((left, right) => left.to - right.to);
    this.migrations.set(migration.from, list);
    return this;
  }

  canMigrate(from: number, to: number): boolean {
    try {
      this.plan(from, to);
      return true;
    } catch {
      return false;
    }
  }

  migrate(data: T, from: number, to: number): T {
    let current = data;
    for (const migration of this.plan(from, to)) {
      current = migration.migrate(current);
    }
    return current;
  }

  list(): readonly MigrationDefinition<T>[] {
    return [...this.migrations.values()].flat().sort((left, right) => left.from - right.from || left.to - right.to);
  }

  private plan(from: number, to: number): readonly MigrationDefinition<T>[] {
    if (from === to) return [];
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to) {
      throw new ValidationError("MIGRATION_TARGET", "Migration target must be an integer version greater than or equal to the source.");
    }
    const plan: MigrationDefinition<T>[] = [];
    let current = from;
    while (current < to) {
      const next = (this.migrations.get(current) ?? []).find((migration) => migration.to <= to);
      if (!next) throw new ValidationError("MIGRATION_PATH", `No migration path from version ${current} to ${to}.`);
      plan.push(next);
      current = next.to;
    }
    return plan;
  }
}

export type SaveSlotFormat = "json" | "binary";

export interface SaveSlotMetadata {
  readonly name?: string;
  readonly description?: string;
  readonly playTime?: number;
  readonly version?: string;
  readonly autoSave?: boolean;
  readonly [key: string]: unknown;
}

export interface SerializedSaveSlot {
  readonly id: string;
  readonly format: SaveSlotFormat;
  readonly timestamp: number;
  readonly metadata: SaveSlotMetadata;
  readonly compressed: boolean;
  readonly data: string;
}

export class SaveSlot {
  private data: string | Uint8Array | null = null;
  private format: SaveSlotFormat = "json";
  private timestamp: number;
  private metadata: SaveSlotMetadata = {};
  private compressed = false;

  constructor(readonly id: string, timestamp = Date.now()) {
    if (!id.trim()) throw new ValidationError("SAVE_SLOT_ID", "SaveSlot requires a non-empty id.");
    this.timestamp = timestamp;
  }

  setData(data: string | Uint8Array, format: SaveSlotFormat, options: { readonly compressed?: boolean } = {}): void {
    this.data = typeof data === "string" ? data : new Uint8Array(data);
    this.format = format;
    this.compressed = options.compressed ?? false;
    this.timestamp = Date.now();
  }

  getData(): string | Uint8Array | null {
    return typeof this.data === "string" || this.data === null ? this.data : new Uint8Array(this.data);
  }

  getFormat(): SaveSlotFormat {
    return this.format;
  }

  getTimestamp(): number {
    return this.timestamp;
  }

  getMetadata(): SaveSlotMetadata {
    return { ...this.metadata };
  }

  setMetadata(metadata: SaveSlotMetadata): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  isCompressed(): boolean {
    return this.compressed;
  }

  getSize(): number {
    if (this.data === null) return 0;
    return typeof this.data === "string" ? new TextEncoder().encode(this.data).byteLength : this.data.byteLength;
  }

  toJSON(): SerializedSaveSlot {
    return {
      id: this.id,
      format: this.format,
      timestamp: this.timestamp,
      metadata: { ...this.metadata },
      compressed: this.compressed,
      data: this.data instanceof Uint8Array ? bytesToBase64(this.data) : this.data ?? ""
    };
  }

  static fromJSON(serialized: SerializedSaveSlot): SaveSlot {
    const slot = new SaveSlot(serialized.id, serialized.timestamp);
    slot.format = serialized.format;
    slot.metadata = { ...serialized.metadata };
    slot.compressed = serialized.compressed;
    slot.data = serialized.format === "binary" ? base64ToBytes(serialized.data) : serialized.data;
    return slot;
  }
}

function collectTypeIssues(value: unknown, field: VersionedSchemaField, path: string, issues: string[]): void {
  if (!matchesKind(value, field.kind)) {
    issues.push(`${path} expected ${field.kind}.`);
    return;
  }
  if (field.kind === "array" && field.elementKind && Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (!matchesKind(entry, field.elementKind as VersionedFieldKind)) issues.push(`${path}[${index}] expected ${field.elementKind}.`);
    });
  }
  if (field.kind === "object" && field.schema) {
    const nested = field.schema.validate(value);
    for (const issue of nested.issues) issues.push(`${path}.${issue}`);
  }
}

function matchesKind(value: unknown, kind: VersionedFieldKind): boolean {
  switch (kind) {
    case "boolean":
      return typeof value === "boolean";
    case "int32":
      return Number.isInteger(value) && Number(value) >= -2147483648 && Number(value) <= 2147483647;
    case "uint32":
      return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 4294967295;
    case "float32":
    case "float64":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "array":
      return Array.isArray(value);
    case "object":
      return isRecord(value);
  }
}

function cloneValue(value: unknown): unknown {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

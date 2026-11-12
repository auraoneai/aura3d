import { flatUniformValuesEqual, isIdenticalFrozenTextureBinding, isPassFrameUniformName, Material } from "./Material";
import { type RecursiveUniformValue, type UniformDataValue, type UniformValue } from "./RenderDevice";
import { isTextureBinding, type TextureBinding } from "./TextureBinding";

export class MaterialInstance {
  private readonly overrides = new Map<string, RecursiveUniformValue>();
  private dirty = true;
  private baseRevision: number;
  /** Bumped on every override change; with the base revision it keys `parameterSnapshot()`. */
  private overrideRevision = 0;
  private featureOverrideRevision = 0;
  private textureOverrideRevision = 0;
  private textureBindingsCache: {
    readonly baseBindings: readonly TextureBinding[];
    readonly textureOverrideRev: number;
    readonly bindings: readonly TextureBinding[];
  } | undefined;
  private snapshotCache: {
    readonly base: number;
    readonly baseValues: ReadonlyMap<string, RecursiveUniformValue>;
    readonly overrides: number;
    readonly values: ReadonlyMap<string, RecursiveUniformValue>;
  } | undefined;

  constructor(public readonly baseMaterial: Material) {
    this.baseRevision = baseMaterial.getRevision();
  }

  setOverride(name: string, value: RecursiveUniformValue): void {
    const prev = this.overrides.get(name);
    const hadKey = this.overrides.has(name);
    const unchanged = hadKey && (flatUniformValuesEqual(prev, value) || isIdenticalFrozenTextureBinding(prev, value));
    if (!unchanged) {
      this.overrides.set(name, cloneMaterialUniformValue(value));
      if (!isPassFrameUniformName(name)) {
        this.featureOverrideRevision += 1;
      }
      if (isTextureBinding(prev) || isTextureBinding(value)) {
        this.textureOverrideRevision += 1;
      }
    }
    this.dirty = true;
    this.overrideRevision += 1;
    // An identical value keeps the snapshot's contents valid (see Material.setParameterValue).
    const cached = this.snapshotCache;
    if (unchanged && cached && cached.overrides === this.overrideRevision - 1) this.snapshotCache = { ...cached, overrides: this.overrideRevision };
  }

  clearOverride(name: string): void {
    const prev = this.overrides.get(name);
    if (this.overrides.delete(name)) {
      if (!isPassFrameUniformName(name)) {
        this.featureOverrideRevision += 1;
      }
      if (isTextureBinding(prev)) {
        this.textureOverrideRevision += 1;
      }
      this.dirty = true;
      this.overrideRevision += 1;
    }
  }

  getFeatureOverrideRevision(): number {
    return this.featureOverrideRevision;
  }

  textureBindingsSnapshot(): readonly TextureBinding[] {
    const baseBindings = this.baseMaterial.textureBindingsSnapshot();
    const cached = this.textureBindingsCache;
    if (cached && cached.baseBindings === baseBindings && cached.textureOverrideRev === this.textureOverrideRevision) {
      return cached.bindings;
    }
    if (this.overrides.size === 0) {
      this.textureBindingsCache = { baseBindings, textureOverrideRev: this.textureOverrideRevision, bindings: baseBindings };
      return baseBindings;
    }
    const bindings: TextureBinding[] = [];
    for (const [key, value] of this.baseMaterial.parameterSnapshot()) {
      if (this.overrides.has(key)) continue;
      if (isTextureBinding(value)) bindings.push(value);
    }
    for (const value of this.overrides.values()) {
      if (isTextureBinding(value)) bindings.push(value);
    }
    this.textureBindingsCache = { baseBindings, textureOverrideRev: this.textureOverrideRevision, bindings };
    return bindings;
  }

  getParameter<T extends RecursiveUniformValue = UniformValue>(name: string): T | undefined {
    const override = this.overrides.get(name);
    if (override !== undefined) {
      return cloneMaterialUniformValue(override) as T;
    }
    return this.baseMaterial.getRecursiveParameter(name) as T | undefined;
  }

  getRecursiveParameter(name: string): RecursiveUniformValue | undefined {
    return this.getParameter<RecursiveUniformValue>(name);
  }

  getParameters<T extends RecursiveUniformValue = UniformValue>(): ReadonlyMap<string, T> {
    // T is the caller-selected compatibility view, as in getParameter;
    // getRecursiveParameters requests the complete union for portable values.
    const parameters = new Map<string, T>();
    for (const [key, value] of this.baseMaterial.getRecursiveParameters()) {
      parameters.set(key, value as T);
    }
    for (const [key, value] of this.overrides) {
      parameters.set(key, cloneMaterialUniformValue(value) as T);
    }
    return parameters;
  }

  getRecursiveParameters(): ReadonlyMap<string, RecursiveUniformValue> {
    return this.getParameters<RecursiveUniformValue>();
  }

  /** See `Material.parameterSnapshot`: shared until the base material or an override changes. Read-only. */
  parameterSnapshot(): ReadonlyMap<string, RecursiveUniformValue> {
    const base = this.baseMaterial.getRevision();
    const cached = this.snapshotCache;
    if (cached && cached.overrides === this.overrideRevision && !this.baseMaterial.disposed) {
      if (cached.base === base) return cached.values;
      const baseValues = this.baseMaterial.parameterSnapshot();
      if (cached.baseValues === baseValues) {
        this.snapshotCache = { base, baseValues, overrides: this.overrideRevision, values: cached.values };
        return cached.values;
      }
    }
    const baseValues = this.baseMaterial.parameterSnapshot();
    const values = this.getRecursiveParameters();
    this.snapshotCache = { base, baseValues, overrides: this.overrideRevision, values };
    return values;
  }

  isDirty(): boolean {
    return this.dirty || this.baseRevision !== this.baseMaterial.getRevision();
  }

  markClean(): void {
    this.dirty = false;
    this.baseRevision = this.baseMaterial.getRevision();
  }
}

/** Copy data recursively; texture bindings and their resources remain borrowed. */
export function cloneMaterialUniformValue(value: UniformDataValue): UniformDataValue;
export function cloneMaterialUniformValue(value: RecursiveUniformValue): RecursiveUniformValue;
export function cloneMaterialUniformValue(value: RecursiveUniformValue): RecursiveUniformValue {
  if (isTextureBinding(value)) return value;
  const active = new Set<object>();
  function clone(input: UniformDataValue, depth: number): UniformDataValue {
    if (typeof input === "number" || typeof input === "boolean") return input;
    if (!input || typeof input !== "object" || depth > 128 || active.has(input)) {
      throw new TypeError("Material uniform data must be an acyclic numeric, boolean, array, or plain object value");
    }
    if (input instanceof Float32Array) return new Float32Array(input);
    if (input instanceof Int32Array) return new Int32Array(input);
    if (input instanceof Uint32Array) return new Uint32Array(input);
    if (ArrayBuffer.isView(input)) throw new TypeError("Material uniform data has an unsupported typed array");
    active.add(input);
    try {
      if (Array.isArray(input)) return input.map((entry) => clone(entry, depth + 1));
      if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
        throw new TypeError("Material uniform data must use plain objects");
      }
      const result: Record<string, UniformDataValue> = Object.create(null);
      for (const [key, entry] of Object.entries(input)) result[key] = clone(entry, depth + 1);
      return result;
    } finally {
      active.delete(input);
    }
  }
  return clone(value, 0);
}

/** Compare owned logical uniform data without flattening structs or nested arrays. */
export function materialUniformValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (isTextureBinding(a) || isTextureBinding(b)) return false;
  const sequence = (value: unknown): value is readonly unknown[] | Float32Array | Int32Array | Uint32Array =>
    Array.isArray(value) || value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array;
  if (sequence(a) && sequence(b)) {
    return a.length === b.length && Array.from(a).every((entry, index) => materialUniformValuesEqual(entry, b[index]));
  }
  const record = (value: unknown): value is Readonly<Record<string, unknown>> => {
    if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  };
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every((key) => Object.hasOwn(b, key) && materialUniformValuesEqual(a[key], b[key]));
}

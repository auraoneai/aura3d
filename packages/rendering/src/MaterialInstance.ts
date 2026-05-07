import { Material } from "./Material";
import { type UniformValue } from "./RenderDevice";
import { TextureBinding } from "./TextureBinding";

export class MaterialInstance {
  private readonly overrides = new Map<string, UniformValue>();
  private dirty = true;
  private baseRevision: number;

  constructor(public readonly baseMaterial: Material) {
    this.baseRevision = baseMaterial.getRevision();
  }

  setOverride(name: string, value: UniformValue): void {
    this.overrides.set(name, cloneUniformValue(value));
    this.dirty = true;
  }

  clearOverride(name: string): void {
    if (this.overrides.delete(name)) {
      this.dirty = true;
    }
  }

  getParameter(name: string): UniformValue | undefined {
    const override = this.overrides.get(name);
    if (override !== undefined) {
      return cloneUniformValue(override);
    }
    return this.baseMaterial.getParameter(name);
  }

  getParameters(): ReadonlyMap<string, UniformValue> {
    const parameters = new Map(this.baseMaterial.getParameters());
    for (const [key, value] of this.overrides) {
      parameters.set(key, cloneUniformValue(value));
    }
    return parameters;
  }

  isDirty(): boolean {
    return this.dirty || this.baseRevision !== this.baseMaterial.getRevision();
  }

  markClean(): void {
    this.dirty = false;
    this.baseRevision = this.baseMaterial.getRevision();
  }
}

function cloneUniformValue(value: UniformValue): UniformValue {
  if (typeof value === "number") {
    return value;
  }
  if (value instanceof TextureBinding) {
    return value;
  }
  return ArrayBuffer.isView(value) ? new (value.constructor as Float32ArrayConstructor)(value as Float32Array) : [...value];
}

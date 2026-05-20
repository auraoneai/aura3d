export type V5UniformValue = number | boolean | string | readonly number[];

export class UniformsV5 {
  private readonly values = new Map<string, V5UniformValue>();

  set(name: string, value: V5UniformValue): this {
    this.values.set(name, value);
    return this;
  }

  get(name: string): V5UniformValue | undefined {
    return this.values.get(name);
  }

  entries(): readonly [string, V5UniformValue][] {
    return [...this.values.entries()];
  }
}

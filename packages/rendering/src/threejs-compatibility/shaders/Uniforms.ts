export type ThreeCompatUniformValue = number | boolean | string | readonly number[];

export class UniformsThreeCompat {
  private readonly values = new Map<string, ThreeCompatUniformValue>();

  set(name: string, value: ThreeCompatUniformValue): this {
    this.values.set(name, value);
    return this;
  }

  get(name: string): ThreeCompatUniformValue | undefined {
    return this.values.get(name);
  }

  entries(): readonly [string, ThreeCompatUniformValue][] {
    return [...this.values.entries()];
  }
}

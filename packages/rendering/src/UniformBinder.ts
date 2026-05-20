import type { UniformValue } from "./RenderDevice";

export class UniformBinder {
  private readonly cache = new Map<string, UniformValue>();

  set(name: string, value: UniformValue): boolean {
    const previous = this.cache.get(name);
    if (previous === value) return false;
    this.cache.set(name, value);
    return true;
  }

  clear(): void {
    this.cache.clear();
  }
}

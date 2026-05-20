export class WebGPUPipelineCache<T = unknown> {
  private readonly cache = new Map<string, T>();

  getOrCreate(key: string, create: () => T): T {
    const existing = this.cache.get(key);
    if (existing !== undefined) return existing;
    const value = create();
    this.cache.set(key, value);
    return value;
  }

  clear(): void {
    this.cache.clear();
  }
}

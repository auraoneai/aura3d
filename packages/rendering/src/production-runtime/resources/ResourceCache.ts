export class ResourceCache<T> {
  private readonly resources = new Map<string, T>();
  get(key: string): T | undefined { return this.resources.get(key); }
  set(key: string, value: T): T { this.resources.set(key, value); return value; }
  clear(): void { this.resources.clear(); }
  get size(): number { return this.resources.size; }
}

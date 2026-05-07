import type { AssetLoadRequest, AssetLoader } from "./AssetLoader";

export class AssetRegistry {
  private readonly loaders = new Map<string, AssetLoader>();

  register(loader: AssetLoader): void {
    if (this.loaders.has(loader.type)) {
      throw new Error(`Asset loader type already registered: ${loader.type}`);
    }

    this.loaders.set(loader.type, loader);
  }

  unregister(type: string): boolean {
    return this.loaders.delete(type);
  }

  get(type: string): AssetLoader {
    const loader = this.loaders.get(type);
    if (!loader) {
      throw new Error(`No asset loader registered for type: ${type}`);
    }

    return loader;
  }

  find(request: AssetLoadRequest): AssetLoader {
    if (request.type) {
      return this.get(request.type);
    }

    for (const loader of this.loaders.values()) {
      if (loader.canLoad(request)) {
        return loader;
      }
    }

    throw new Error(`No asset loader can load ${request.url}`);
  }

  list(): readonly string[] {
    return [...this.loaders.keys()];
  }
}

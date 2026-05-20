import type { DisposableResource } from "./RenderDevice";

export class ResourceLifecycle {
  private readonly resources = new Set<DisposableResource>();

  track<T extends DisposableResource>(resource: T): T {
    this.resources.add(resource);
    return resource;
  }

  dispose(): void {
    for (const resource of this.resources) {
      if (!resource.disposed) resource.dispose();
    }
    this.resources.clear();
  }

  leakCount(): number {
    return [...this.resources].filter((resource) => !resource.disposed).length;
  }
}

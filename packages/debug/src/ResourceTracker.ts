export interface TrackedResource {
  readonly id: string;
  readonly type: string;
  readonly disposed: boolean;
}

export interface ResourceLeakReport {
  readonly total: number;
  readonly leaked: number;
  readonly resources: readonly TrackedResource[];
  readonly leaks: readonly TrackedResource[];
}

export class ResourceTracker {
  private readonly resources = new Map<string, TrackedResource>();

  track(id: string, type: string): void {
    if (this.resources.has(id)) {
      throw new Error(`Resource already tracked: ${id}`);
    }
    this.resources.set(id, { id, type, disposed: false });
  }

  dispose(id: string): void {
    const resource = this.resources.get(id);
    if (!resource) {
      throw new Error(`Unknown resource: ${id}`);
    }
    this.resources.set(id, { ...resource, disposed: true });
  }

  report(): ResourceLeakReport {
    const resources = [...this.resources.values()].sort((a, b) => a.id.localeCompare(b.id));
    const leaks = resources.filter((resource) => !resource.disposed);
    return {
      total: resources.length,
      leaked: leaks.length,
      resources,
      leaks
    };
  }

  assertNoLeaks(): void {
    const report = this.report();
    if (report.leaked > 0) {
      throw new ResourceLeakError("Resource leaks detected", report);
    }
  }
}

export class ResourceLeakError extends Error {
  constructor(
    message: string,
    public readonly report: ResourceLeakReport
  ) {
    super(message);
    this.name = "ResourceLeakError";
  }
}

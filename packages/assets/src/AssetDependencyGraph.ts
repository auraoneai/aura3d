export class AssetDependencyGraph {
  private readonly outgoing = new Map<string, Map<string, number>>();
  private readonly incoming = new Map<string, Map<string, number>>();

  addNode(id: string): void {
    this.outgoing.get(id) ?? this.outgoing.set(id, new Map());
    this.incoming.get(id) ?? this.incoming.set(id, new Map());
  }

  addDependency(ownerId: string, dependencyId: string): void {
    if (ownerId === dependencyId || this.dependsOn(dependencyId, ownerId)) {
      throw new Error(`Asset dependency cycle detected: ${ownerId} -> ${dependencyId}`);
    }

    this.addNode(ownerId);
    this.addNode(dependencyId);

    const count = this.dependencyCount(ownerId, dependencyId) + 1;
    this.outgoing.get(ownerId)?.set(dependencyId, count);
    this.incoming.get(dependencyId)?.set(ownerId, count);
  }

  /** Number of separately acquired references represented by this edge. */
  dependencyCount(ownerId: string, dependencyId: string): number {
    return this.outgoing.get(ownerId)?.get(dependencyId) ?? 0;
  }

  /** Remove one acquisition; concurrent duplicate edges remain until balanced. */
  removeDependency(ownerId: string, dependencyId: string): boolean {
    const count = this.dependencyCount(ownerId, dependencyId);
    if (count === 0) return false;
    if (count > 1) {
      this.outgoing.get(ownerId)?.set(dependencyId, count - 1);
      this.incoming.get(dependencyId)?.set(ownerId, count - 1);
    } else {
      this.outgoing.get(ownerId)?.delete(dependencyId);
      this.incoming.get(dependencyId)?.delete(ownerId);
      this.removeIfIsolated(ownerId);
      this.removeIfIsolated(dependencyId);
    }
    return true;
  }

  dependenciesOf(id: string): readonly string[] {
    return [...(this.outgoing.get(id)?.keys() ?? [])];
  }

  dependentsOf(id: string): readonly string[] {
    return [...(this.incoming.get(id)?.keys() ?? [])];
  }

  remove(id: string): void {
    for (const dependency of this.dependenciesOf(id)) {
      this.incoming.get(dependency)?.delete(id);
      this.removeIfIsolated(dependency);
    }

    for (const dependent of this.dependentsOf(id)) {
      this.outgoing.get(dependent)?.delete(id);
      this.removeIfIsolated(dependent);
    }

    this.outgoing.delete(id);
    this.incoming.delete(id);
  }

  releaseOrder(rootId: string): readonly string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (id: string): void => {
      if (visited.has(id)) {
        return;
      }

      visited.add(id);
      for (const dependency of this.dependenciesOf(id)) {
        visit(dependency);
      }
      order.push(id);
    };

    visit(rootId);
    return order;
  }

  private dependsOn(startId: string, targetId: string): boolean {
    const seen = new Set<string>();
    const stack = [startId];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || seen.has(current)) {
        continue;
      }

      if (current === targetId) {
        return true;
      }

      seen.add(current);
      stack.push(...this.dependenciesOf(current));
    }

    return false;
  }

  private removeIfIsolated(id: string): void {
    if (this.outgoing.get(id)?.size === 0 && this.incoming.get(id)?.size === 0) {
      this.outgoing.delete(id);
      this.incoming.delete(id);
    }
  }
}

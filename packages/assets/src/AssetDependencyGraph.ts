export class AssetDependencyGraph {
  private readonly outgoing = new Map<string, Set<string>>();
  private readonly incoming = new Map<string, Set<string>>();

  addNode(id: string): void {
    this.outgoing.get(id) ?? this.outgoing.set(id, new Set());
    this.incoming.get(id) ?? this.incoming.set(id, new Set());
  }

  addDependency(ownerId: string, dependencyId: string): void {
    this.addNode(ownerId);
    this.addNode(dependencyId);

    if (ownerId === dependencyId || this.dependsOn(dependencyId, ownerId)) {
      throw new Error(`Asset dependency cycle detected: ${ownerId} -> ${dependencyId}`);
    }

    this.outgoing.get(ownerId)?.add(dependencyId);
    this.incoming.get(dependencyId)?.add(ownerId);
  }

  dependenciesOf(id: string): readonly string[] {
    return [...(this.outgoing.get(id) ?? [])];
  }

  dependentsOf(id: string): readonly string[] {
    return [...(this.incoming.get(id) ?? [])];
  }

  remove(id: string): void {
    for (const dependency of this.dependenciesOf(id)) {
      this.incoming.get(dependency)?.delete(id);
    }

    for (const dependent of this.dependentsOf(id)) {
      this.outgoing.get(dependent)?.delete(id);
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
}

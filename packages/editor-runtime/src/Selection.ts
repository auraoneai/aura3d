export type SelectionId = string | number;

export interface SelectionChange {
  readonly previous: readonly SelectionId[];
  readonly current: readonly SelectionId[];
}

export type SelectionListener = (change: SelectionChange) => void;

export class Selection {
  private readonly ids = new Set<SelectionId>();
  private readonly listeners = new Set<SelectionListener>();

  current(): readonly SelectionId[] {
    return [...this.ids];
  }

  has(id: SelectionId): boolean {
    return this.ids.has(id);
  }

  set(ids: readonly SelectionId[]): void {
    this.replace(new Set(ids));
  }

  add(id: SelectionId): void {
    this.replace(new Set([...this.ids, id]));
  }

  remove(id: SelectionId): void {
    const next = new Set(this.ids);
    next.delete(id);
    this.replace(next);
  }

  clear(): void {
    this.replace(new Set());
  }

  subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  prune(alive: (id: SelectionId) => boolean): void {
    this.replace(new Set([...this.ids].filter(alive)));
  }

  private replace(next: Set<SelectionId>): void {
    const previous = this.current();
    this.ids.clear();
    for (const id of next) {
      this.ids.add(id);
    }
    const current = this.current();
    if (previous.length !== current.length || previous.some((id, index) => id !== current[index])) {
      const change = { previous, current };
      for (const listener of [...this.listeners]) {
        listener(change);
      }
    }
  }
}

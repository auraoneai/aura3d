export interface SnapshotAdapter<T> {
  capture(): T;
  restore(snapshot: T): void;
}

export class PlayModeBridge<TSnapshot> {
  private snapshot?: TSnapshot;

  constructor(private readonly adapter: SnapshotAdapter<TSnapshot>) {}

  enter(): void {
    if (this.snapshot !== undefined) {
      throw new Error("Play mode is already active");
    }
    this.snapshot = this.adapter.capture();
  }

  exit({ restore = true } = {}): void {
    if (this.snapshot === undefined) {
      return;
    }
    if (restore) {
      this.adapter.restore(this.snapshot);
    }
    this.snapshot = undefined;
  }
}

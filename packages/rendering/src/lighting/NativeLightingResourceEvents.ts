/** A committed change to a caller-owned lighting resource. */
export interface NativeLightingResourceChange {
  /** Revision when the change was committed. Disposal need not increment it. */
  readonly revision: number;
  readonly disposed: boolean;
}

type Listener = (change: NativeLightingResourceChange) => void;
type Subscription = { readonly listener: Listener };
type Notification = { readonly change: NativeLightingResourceChange; readonly subscriptions: readonly Subscription[] };

/**
 * Delivers resource notifications in commit order, including nested writes.
 * Subscriptions are independent, and observer failures never undo a committed
 * update or prevent another owner from receiving it.
 */
export class NativeLightingResourceEvents {
  private readonly subscriptions = new Set<Subscription>();
  private readonly pending: Notification[] = [];
  private notifying = false;
  private disposedRevision: number | undefined;

  subscribe(listener: Listener): () => void {
    if (typeof listener !== "function") throw new TypeError("lighting resource listener must be a function");
    if (this.disposedRevision !== undefined) {
      try { listener(Object.freeze({ revision: this.disposedRevision, disposed: true })); } catch { /* Resource state is already final. */ }
      return () => {};
    }
    const subscription = { listener };
    this.subscriptions.add(subscription);
    return () => { this.subscriptions.delete(subscription); };
  }

  emit(revision: number, disposed = false): void {
    if (this.disposedRevision !== undefined) return;
    if (disposed) this.disposedRevision = revision;
    if (this.subscriptions.size === 0) return;
    this.pending.push({ change: Object.freeze({ revision, disposed }), subscriptions: [...this.subscriptions] });
    if (this.notifying) return;
    this.notifying = true;
    try {
      for (let index = 0; index < this.pending.length; index += 1) {
        const notification = this.pending[index]!;
        for (const subscription of notification.subscriptions) {
          if (!this.subscriptions.has(subscription)) continue;
          try { subscription.listener(notification.change); } catch { /* Continue notifying other owners. */ }
        }
        if (notification.change.disposed) this.subscriptions.clear();
      }
    } finally {
      this.pending.length = 0;
      this.notifying = false;
    }
  }
}

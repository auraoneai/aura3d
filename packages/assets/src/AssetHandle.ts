import { redactAssetUrl } from "./AssetLoader";

export type AssetHandleStatus = "ready" | "disposed";

export interface AssetHandleOptions<T> {
  readonly id: string;
  readonly url: string;
  readonly type: string;
  readonly value: T;
  readonly dispose?: (value: T) => void | Promise<void>;
}

export class AssetHandle<T> {
  readonly id: string;
  readonly url: string;
  readonly type: string;

  private readonly valueRef: T;
  private readonly disposer?: (value: T) => void | Promise<void>;
  private retainCount = 1;
  private currentStatus: AssetHandleStatus = "ready";

  constructor(options: AssetHandleOptions<T>) {
    this.id = options.id;
    this.url = options.url;
    this.type = options.type;
    this.valueRef = options.value;
    this.disposer = options.dispose;
  }

  get status(): AssetHandleStatus {
    return this.currentStatus;
  }

  get refCount(): number {
    return this.retainCount;
  }

  get disposed(): boolean {
    return this.currentStatus === "disposed";
  }

  get value(): T {
    this.assertAlive();
    return this.valueRef;
  }

  retain(): this {
    this.assertAlive();
    this.retainCount += 1;
    return this;
  }

  /**
   * Release one owned reference. The final release marks the handle disposed
   * before invoking the disposer, so concurrent releases cannot dispose twice.
   * Releasing an already disposed handle is an error, even if disposal failed.
   */
  async release(): Promise<number> {
    this.assertAlive();
    this.retainCount -= 1;

    if (this.retainCount === 0) {
      this.currentStatus = "disposed";
      await this.disposer?.(this.valueRef);
    }

    return this.retainCount;
  }

  assertAlive(): void {
    if (this.currentStatus === "disposed") {
      // IDs are caller-controlled and may themselves contain signed URLs.
      const safeId = /^[a-zA-Z0-9._-]{1,128}$/.test(this.id) ? this.id : "<redacted>";
      throw new Error(`Asset handle ${safeId} for ${redactAssetUrl(this.url)} has been disposed`);
    }
  }
}

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

  async release(): Promise<number> {
    this.assertAlive();
    this.retainCount -= 1;

    if (this.retainCount < 0) {
      this.retainCount = 0;
      throw new Error(`Asset handle ${this.id} was released too many times`);
    }

    if (this.retainCount === 0) {
      this.currentStatus = "disposed";
      await this.disposer?.(this.valueRef);
    }

    return this.retainCount;
  }

  assertAlive(): void {
    if (this.currentStatus === "disposed") {
      throw new Error(`Asset handle ${this.id} for ${this.url} has been disposed`);
    }
  }
}

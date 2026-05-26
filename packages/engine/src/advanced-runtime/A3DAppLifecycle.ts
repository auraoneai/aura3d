export interface A3DDisposable {
  dispose(): void;
}

export interface A3DAppLifecycleSnapshot {
  readonly disposed: boolean;
  readonly animationFrames: number;
  readonly eventListeners: number;
  readonly disposables: number;
  readonly disposeCalls: number;
}

export class A3DAppLifecycle {
  private readonly disposables = new Set<A3DDisposable>();
  private readonly animationFrames = new Set<number>();
  private readonly eventListeners: Array<{
    readonly target: EventTarget;
    readonly type: string;
    readonly listener: EventListenerOrEventListenerObject;
    readonly options?: boolean | AddEventListenerOptions;
  }> = [];
  private disposed = false;
  private disposeCalls = 0;

  addDisposable<T extends A3DDisposable>(disposable: T): T {
    this.assertAlive("addDisposable");
    this.disposables.add(disposable);
    return disposable;
  }

  addEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.assertAlive("addEventListener");
    target.addEventListener(type, listener, options);
    this.eventListeners.push({ target, type, listener, options });
  }

  requestAnimationFrame(callback: FrameRequestCallback): number {
    this.assertAlive("requestAnimationFrame");
    const handle = window.requestAnimationFrame((time) => {
      this.animationFrames.delete(handle);
      if (!this.disposed) callback(time);
    });
    this.animationFrames.add(handle);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    if (this.animationFrames.delete(handle)) {
      window.cancelAnimationFrame(handle);
    }
  }

  bindPageTeardown(target: EventTarget = window): void {
    this.addEventListener(target, "pagehide", () => this.dispose(), { once: true });
    this.addEventListener(target, "beforeunload", () => this.dispose(), { once: true });
  }

  dispose(): void {
    this.disposeCalls += 1;
    if (this.disposed) return;
    this.disposed = true;

    for (const handle of this.animationFrames) {
      window.cancelAnimationFrame(handle);
    }
    this.animationFrames.clear();

    for (const entry of this.eventListeners.splice(0)) {
      entry.target.removeEventListener(entry.type, entry.listener, entry.options);
    }

    const errors: unknown[] = [];
    for (const disposable of [...this.disposables].reverse()) {
      try {
        disposable.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.disposables.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, "A3D app lifecycle disposal failed.");
    }
  }

  snapshot(): A3DAppLifecycleSnapshot {
    return {
      disposed: this.disposed,
      animationFrames: this.animationFrames.size,
      eventListeners: this.eventListeners.length,
      disposables: this.disposables.size,
      disposeCalls: this.disposeCalls
    };
  }

  private assertAlive(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} on a disposed A3D app lifecycle.`);
    }
  }
}


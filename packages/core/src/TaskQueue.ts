export interface TaskHandle {
  readonly id: number;
  cancel(): void;
  readonly cancelled: boolean;
}

interface QueuedTask {
  handle: MutableTaskHandle;
  task: () => void | Promise<void>;
}

class MutableTaskHandle implements TaskHandle {
  cancelled = false;
  constructor(readonly id: number) {}
  cancel(): void {
    this.cancelled = true;
  }
}

export class TaskQueue {
  private queue: QueuedTask[] = [];
  private nextId = 1;

  enqueue(task: () => void | Promise<void>): TaskHandle {
    const handle = new MutableTaskHandle(this.nextId++);
    this.queue.push({ handle, task });
    return handle;
  }

  get size(): number {
    return this.queue.length;
  }

  async flush(): Promise<void> {
    const errors: unknown[] = [];
    while (this.queue.length > 0) {
      const batch = this.queue;
      this.queue = [];
      for (const item of batch) {
        if (item.handle.cancelled) continue;
        try {
          await item.task();
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "One or more queued tasks failed.");
  }
}

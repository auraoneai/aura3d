export type EventMapBase = object;
export type EventListener<T> = (event: T) => void;
export type EventErrorHandler = (error: unknown, eventName: string) => void;

export interface Subscription {
  unsubscribe(): void;
}

export class EventBus<TEvents extends EventMapBase> {
  private readonly listeners = new Map<keyof TEvents, Set<EventListener<TEvents[keyof TEvents]>>>();
  private readonly onceListeners = new WeakSet<EventListener<TEvents[keyof TEvents]>>();

  constructor(private readonly onListenerError?: EventErrorHandler) {}

  on<K extends keyof TEvents>(eventName: K, listener: EventListener<TEvents[K]>): Subscription {
    const set = this.listeners.get(eventName) ?? new Set<EventListener<TEvents[keyof TEvents]>>();
    set.add(listener as EventListener<TEvents[keyof TEvents]>);
    this.listeners.set(eventName, set);
    return { unsubscribe: () => this.off(eventName, listener) };
  }

  once<K extends keyof TEvents>(eventName: K, listener: EventListener<TEvents[K]>): Subscription {
    const subscription = this.on(eventName, listener);
    this.onceListeners.add(listener as EventListener<TEvents[keyof TEvents]>);
    return subscription;
  }

  off<K extends keyof TEvents>(eventName: K, listener: EventListener<TEvents[K]>): void {
    const set = this.listeners.get(eventName);
    set?.delete(listener as EventListener<TEvents[keyof TEvents]>);
    if (set?.size === 0) this.listeners.delete(eventName);
  }

  emit<K extends keyof TEvents>(eventName: K, event: TEvents[K]): void {
    const snapshot = [...(this.listeners.get(eventName) ?? [])];
    for (const listener of snapshot) {
      if (!this.listeners.get(eventName)?.has(listener)) continue;
      try {
        (listener as EventListener<TEvents[K]>)(event);
      } catch (error) {
        this.onListenerError?.(error, String(eventName));
      }
      if (this.onceListeners.has(listener)) {
        this.listeners.get(eventName)?.delete(listener);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

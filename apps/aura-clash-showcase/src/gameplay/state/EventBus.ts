export type AuraClashEventType =
  | "round-start"
  | "input-action"
  | "hit-resolved"
  | "combo-updated"
  | "special-fired"
  | "round-finished"
  | "accessibility-changed";

export interface AuraClashEvent<TPayload = unknown> {
  type: AuraClashEventType;
  payload: TPayload;
  atMs: number;
}

export type AuraClashListener<TPayload = unknown> = (event: AuraClashEvent<TPayload>) => void;

export class AuraClashEventBus {
  private listeners = new Map<AuraClashEventType, Set<AuraClashListener>>();

  on<TPayload>(type: AuraClashEventType, listener: AuraClashListener<TPayload>): () => void {
    const listeners = this.listeners.get(type) ?? new Set<AuraClashListener>();
    listeners.add(listener as AuraClashListener);
    this.listeners.set(type, listeners);

    return () => {
      listeners.delete(listener as AuraClashListener);
    };
  }

  emit<TPayload>(type: AuraClashEventType, payload: TPayload, atMs = performance.now()): void {
    const event: AuraClashEvent<TPayload> = { type, payload, atMs };
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

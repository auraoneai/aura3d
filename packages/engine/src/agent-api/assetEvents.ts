/** App-owned asset progress/error channels. A request captures its channel
 * before starting so that interleaved asynchronous loads cannot change owner.
 */
import type { AuraAssetErrorEvent, AuraAssetProgressEvent } from "./nodes/types/runtime.js";
import { redactAssetUrl } from "@aura3d/assets/browser";
import { formatDiagnosticError, sanitizeDiagnosticText } from "./sanitizeDiagnostics.js";

export interface AuraAppAssetEventHandlers {
  readonly onAssetProgress?: (event: AuraAssetProgressEvent) => void;
  readonly onAssetError?: (event: AuraAssetErrorEvent) => void;
}

/** A channel is owned by one app, and does not keep delivering after disposal. */
export interface AuraAppAssetEventScope {
  /** Aborted when this owner closes, independently of every other app. */
  readonly signal: AbortSignal;
  subscribe(handlers: AuraAppAssetEventHandlers): () => void;
  emitProgress(event: AuraAssetProgressEvent): void;
  emitError(event: AuraAssetErrorEvent): void;
  dispose(): void;
}

function safeString(value: string): string {
  // The general diagnostic formatter also handles relative URLs and named
  // credentials. Redact protocol-relative, inline and blob URLs before it
  // runs: these otherwise need not look like an http(s) URL to the formatter.
  const bounded = value.slice(0, 8192);
  return sanitizeDiagnosticText(bounded
    .replace(/(?:https?:\/\/|\/\/)[^\s<>"')\]}]+|(?:data|blob):[^\s<>"')\]}]+/gi, redactAssetUrl)
    .replace(/\bhttps?%3a%2f%2f[^\s<>"')\]}]+/gi, "[redacted URL]")
    .replace(/(["']?)(x-[\w-]*(?:token|secret|private|auth|key|header)[\w-]*)\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\r\n]*)/gi, "$2=[redacted]"));
}

/** Copy an untrusted failure; never publish its original cause or properties. */
export function safeAssetError(error: unknown, url?: string): Error {
  let message = formatDiagnosticError(error);
  if (url) {
    // Some transports quote an encoded request URL instead of the original.
    const candidates = [url];
    try { candidates.push(encodeURI(url), encodeURIComponent(url)); } catch { /* Malformed URL text. */ }
    for (const candidate of candidates) message = message.split(candidate).join(redactAssetUrl(url));
  }
  return new Error(safeString(message));
}

function safeUrl(value: string): string {
  return safeString(redactAssetUrl(value));
}

function safeProgress(event: AuraAssetProgressEvent): AuraAssetProgressEvent {
  return {
    ...(event.url !== undefined ? { url: safeUrl(event.url) } : {}),
    ...(event.assetId !== undefined ? { assetId: safeString(event.assetId) } : {}),
    loaded: event.loaded,
    total: event.total,
    ...(event.item !== undefined ? { item: safeUrl(event.item) } : {})
  };
}

function safeError(event: AuraAssetErrorEvent): AuraAssetErrorEvent {
  const error = safeAssetError(event.error, event.url);
  const message = event.message === undefined ? error.message : safeString(event.message);
  return {
    ...(event.url !== undefined ? { url: safeUrl(event.url) } : {}),
    ...(event.assetId !== undefined ? { assetId: safeString(event.assetId) } : {}),
    // Do not expose the original error: its properties may contain headers,
    // signed URLs or other request credentials.
    error,
    message
  };
}

/**
 * Each app owns a scope, while a captured scope is also safe to retain in an
 * in-flight request: `dispose` clears subscribers and suppresses late events.
 */
export function createAppAssetEventScope(initial?: AuraAppAssetEventHandlers): AuraAppAssetEventScope {
  const handlers = new Set<AuraAppAssetEventHandlers>();
  const controller = new AbortController();
  let disposed = false;
  if (initial?.onAssetProgress || initial?.onAssetError) handlers.add(initial);

  return {
    signal: controller.signal,
    subscribe(listener) {
      if (disposed || (!listener.onAssetProgress && !listener.onAssetError)) return () => {};
      handlers.add(listener);
      return () => { handlers.delete(listener); };
    },
    emitProgress(event) {
      if (disposed) return;
      const safe = safeProgress(event);
      for (const listener of [...handlers]) {
        if (disposed) break;
        try { listener.onAssetProgress?.(safe); } catch { /* Listener failure must not fail a request. */ }
      }
    },
    emitError(event) {
      if (disposed) return;
      const safe = safeError(event);
      for (const listener of [...handlers]) {
        if (disposed) break;
        try { listener.onAssetError?.(safe); } catch { /* Other subscribers still receive the event. */ }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      handlers.clear();
      controller.abort();
    }
  };
}

const appScopes = new WeakMap<object, AuraAppAssetEventScope>();

/** Associates a unique app with its channel after the app object is created. */
export function bindAppAssetEventScope(app: object, scope: AuraAppAssetEventScope): void {
  const previous = appScopes.get(app);
  if (previous && previous !== scope) previous.dispose();
  appScopes.set(app, scope);
}

export function assetEventScopeForApp(app: object): AuraAppAssetEventScope | undefined {
  return appScopes.get(app);
}

export function unbindAppAssetEventScope(app: object): void {
  const scope = appScopes.get(app);
  appScopes.delete(app);
  scope?.dispose();
}

// Compatibility channel for explicitly registered standalone listeners. App
// handlers never subscribe here, and unowned requests never reach an app.
const standaloneScope = createAppAssetEventScope();

export function registerAppAssetEventHandlers(handlers: AuraAppAssetEventHandlers): () => void {
  return standaloneScope.subscribe(handlers);
}

export function emitAppAssetProgress(event: AuraAssetProgressEvent): void {
  standaloneScope.emitProgress(event);
}

export function emitAppAssetError(event: AuraAssetErrorEvent): void {
  standaloneScope.emitError(event);
}

/**
 * Asset fetch deduplication (PRD-12 §9.2, research 22 ERR_ABORTED fix).
 * `fetchOnce` dedupes GET requests by URL through a module-level
 * Map<url, Promise<ArrayBuffer>>. `installFetchDedupe` applies the same cache
 * at `window.fetch` level for engine-internal fetches (Aura assets are loaded
 * inside `createAuraApp` through the public API, so the harness dedupes at the
 * fetch boundary rather than inside the engine).
 */

const FETCH_CACHE = new Map<string, Promise<ArrayBuffer>>();
const RESPONSE_META = new Map<string, { status: number; statusText: string; contentType: string | null }>();

export function fetchOnce(url: string): Promise<ArrayBuffer> {
  let pending = FETCH_CACHE.get(url);
  if (!pending) {
    pending = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`fetch ${url}: HTTP ${response.status}`);
      RESPONSE_META.set(url, {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type")
      });
      return response.arrayBuffer();
    });
    FETCH_CACHE.set(url, pending);
  }
  return pending;
}

export function fetchCacheSize(): number {
  return FETCH_CACHE.size;
}

export function installFetchDedupe(): void {
  if ((window.fetch as { __qrDedupe?: boolean }).__qrDedupe) return;
  const original = window.fetch.bind(window);
  const deduped = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" || init?.body) return original(input, init);
    let pending = FETCH_CACHE.get(url);
    if (!pending) {
      pending = original(input, init).then(async (response: Response) => {
        RESPONSE_META.set(url, {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get("content-type")
        });
        return response.arrayBuffer();
      });
      FETCH_CACHE.set(url, pending);
    }
    return pending.then((buffer) => {
      const meta = RESPONSE_META.get(url) ?? { status: 200, statusText: "OK", contentType: null };
      const headers = meta.contentType ? { "content-type": meta.contentType } : undefined;
      return new Response(buffer, { status: meta.status, statusText: meta.statusText, headers });
    });
  }) as typeof fetch & { __qrDedupe?: boolean };
  deduped.__qrDedupe = true;
  window.fetch = deduped;
}

/** A request observation; a failed request is still an observed request. */
export interface RuntimeNetworkEvent {
  readonly url: string;
  readonly resourceType?: string;
  readonly method?: string;
  readonly failure?: string;
  readonly initiator?: string;
}

export interface RuntimeNetworkOptions {
  /** Exact HTTP(S) or WebSocket origins of controlled servers, not hostname suffixes. */
  readonly allowedOrigins?: readonly string[];
  readonly prohibitedPackages?: readonly string[];
}

export interface ClassifiedNetworkEvent {
  /** User info, search parameters and fragments are never retained. */
  readonly url: string;
  readonly resourceType: string | null;
  readonly method: string | null;
  readonly failed: boolean;
  readonly disposition: "allowed" | "unexpected";
}

export interface NetworkReviewCandidate {
  readonly event: number;
  readonly kind: "engine-reference" | "external-script" | "unexpected-request";
  readonly description: string;
}

export interface RuntimeNetworkReport {
  readonly schema: "aura3d.native-runtime-network-classification/1";
  readonly events: ClassifiedNetworkEvent[];
  readonly findings: NetworkReviewCandidate[];
  readonly unexpected: ClassifiedNetworkEvent[];
  readonly limitations: readonly string[];
}

const defaultPackages = ["three", "babylonjs", "@babylonjs/core", "@babylonjs/loaders", "playcanvas", "@react-three/fiber", "@react-three/drei"];

/** Retain only the data needed to reclassify observations; never persist secrets. */
export function redactRuntimeNetworkEvents(events: readonly RuntimeNetworkEvent[]): RuntimeNetworkEvent[] {
  return events.map((event, index) => {
    if (!event || typeof event.url !== "string" || event.url.length === 0) throw new Error(`Network event ${index} has no URL`);
    const resourceType = safeToken(event.resourceType);
    const method = safeToken(event.method);
    return {
      url: redactedUrl(parseUrl(event.url)),
      ...(resourceType ? { resourceType } : {}),
      ...(method ? { method } : {}),
      ...(typeof event.failure === "string" && event.failure ? { failure: "failed" } : {})
    };
  });
}

/**
 * Classify supplied observations only. The caller owns the browser capture,
 * candidate identity, offline test result and completeness of the event stream.
 * An unfamiliar external script needs review: its URL alone cannot establish
 * its contents, and a name match cannot establish authorship.
 */
export function inspectRuntimeNetwork(events: readonly RuntimeNetworkEvent[], options: RuntimeNetworkOptions = {}): RuntimeNetworkReport {
  if (!Array.isArray(events)) throw new Error("Network observations must be an array");
  const allowed = new Set((options.allowedOrigins ?? []).map(normalizeOrigin));
  const packages = options.prohibitedPackages ?? defaultPackages;
  const findings: NetworkReviewCandidate[] = [];
  const classified = events.map((event, index): ClassifiedNetworkEvent => {
    if (!event || typeof event.url !== "string" || event.url.length === 0) throw new Error(`Network event ${index} has no URL`);
    const url = parseUrl(event.url);
    const isData = url?.protocol === "data:";
    // A blob URL inherits its creator's origin; an opaque blob is not allowlisted.
    const origin = url?.origin;
    const permitted = Boolean(isData || (url && origin && allowed.has(origin) && ["http:", "https:", "ws:", "wss:", "blob:"].includes(url.protocol)));
    const disposition = permitted ? "allowed" : "unexpected";
    const resourceType = safeToken(event.resourceType);
    const result: ClassifiedNetworkEvent = {
      url: redactedUrl(url), resourceType, method: safeToken(event.method),
      failed: typeof event.failure === "string" && event.failure.length > 0,
      disposition
    };
    if (!permitted) findings.push({ event: index, kind: "unexpected-request", description: "Request was outside the explicitly allowed origins or used an unsupported URL." });
    if (url && engineReference(url, packages)) findings.push({ event: index, kind: "engine-reference", description: "URL contains an external-engine package or host reference; inspect the requested bytes and origin." });
    if (!permitted && resourceType?.toLowerCase() === "script") findings.push({ event: index, kind: "external-script", description: "External script contents are unknown and require review." });
    return result;
  });
  return {
    schema: "aura3d.native-runtime-network-classification/1", events: classified, findings,
    unexpected: classified.filter((event) => event.disposition === "unexpected"),
    limitations: [
      "Only supplied request events are classified; this does not prove capture completeness or execution of a response.",
      "Package/host references are review candidates, not proof of authorship or of response contents.",
      "Data and blob bodies are redacted, not inspected; their implementation bytes require separate source evidence.",
      "Unknown or dynamically generated implementation bytes may not identify an engine in a URL; offline behavior and packed-source provenance require separate evidence."
    ]
  };
}

function normalizeOrigin(value: string): string {
  const url = parseUrl(value);
  if (!url || !["http:", "https:", "ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Allowed network origins must be exact HTTP(S) or WebSocket origins without credentials, paths, queries or fragments");
  }
  return url.origin;
}

function parseUrl(value: string): URL | undefined {
  try { return new URL(value); } catch { return undefined; }
}

function redactedUrl(url: URL | undefined): string {
  if (!url) return "[invalid URL]";
  if (url.protocol === "data:") return "data:[redacted]";
  if (url.protocol === "blob:") return `blob:${url.origin}/[redacted]`;
  if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return `${url.protocol}[redacted]`;
  return `${url.origin}${url.pathname}`;
}

function safeToken(value: string | undefined): string | null {
  return typeof value === "string" && /^[a-z0-9_-]{1,32}$/i.test(value) ? value : null;
}

function engineReference(url: URL, prohibited: readonly string[]): boolean {
  // Data payloads and opaque blob identifiers are not package URLs. They are
  // redacted in events; their implementation bytes need separate inspection.
  if (url.protocol === "data:" || url.protocol === "blob:") return false;
  let path = url.pathname.toLowerCase();
  try { path = decodeURIComponent(path); } catch { /* Keep the encoded path as review input. */ }
  const host = url.hostname.toLowerCase();
  if (host === "threejs.org" || host.endsWith(".threejs.org") || host === "babylonjs.com" || host.endsWith(".babylonjs.com") || host === "playcanvas.com" || host.endsWith(".playcanvas.com")) return true;
  return prohibited.some((name) => {
    const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|/)${escaped}(?=$|/|@|[.-](?:js|mjs|cjs|module|min)(?:[.-]|$))`, "i").test(path);
  });
}

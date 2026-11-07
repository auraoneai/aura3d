/**
 * Compile-time audit evidence (R-02, React embedding).
 *
 * The scene compiler records a few audit facts while it builds a mount: the PCF tap tier it resolved
 * (`__A3D_SHADOW_TAP_TIER__`), the dense-scene cascade cap (`__A3D_DENSE_SHADOW_CAP__`) and which
 * instanced primitives got a shadow proxy (`__A3D_SHADOW_PROXIES__`). They used to be written straight
 * to `globalThis`, so an embedded canvas left them on the host page and two apps overwrote each other.
 *
 * Each app now registers its lifetime owner here and the compiler records into that app's own store
 * (read back through `app.compileEvidence()`). Only an app that publishes page-global route state
 * (`routeState !== false`, the default for full-page routes) also mirrors the values to the historical
 * globals for browser specs and capture tools; those globals are removed with the last publishing app
 * (see `liveApps.ts`). Standalone compiler calls with no registered owner keep the historical global
 * write, which unit tests and offline tools rely on.
 */

/** Page globals the compiler may publish, in the shape browser specs read them. */
export const COMPILE_EVIDENCE_GLOBALS = ["__A3D_SHADOW_PROXIES__", "__A3D_DENSE_SHADOW_CAP__", "__A3D_SHADOW_TAP_TIER__"] as const;
export type CompileEvidenceKey = (typeof COMPILE_EVIDENCE_GLOBALS)[number];

/** One app's compile evidence, keyed by the historical global names. */
export type AuraCompileEvidence = { readonly [K in CompileEvidenceKey]?: K extends "__A3D_SHADOW_PROXIES__" ? readonly unknown[] : unknown };

interface EvidenceScope {
  readonly values: Partial<Record<CompileEvidenceKey, unknown>>;
  readonly publish: boolean;
  released: boolean;
}

const scopes = new WeakMap<object, EvidenceScope>();
/** `undefined` = no app scope is active (standalone compiler call: historical global write). */
let active: EvidenceScope | undefined;

export interface CompileEvidenceRegistration {
  /** A detached copy of this app's evidence (arrays are copied). */
  read(): AuraCompileEvidence;
  /** Stops recording; later (late async) compiles for this owner write nowhere. */
  release(): void;
}

/** Registers `owner` (an app's runtime owner) as the sink for compiles run under `withCompileEvidence(owner, ...)`. */
export function registerCompileEvidence(owner: object, options: { readonly publish: boolean }): CompileEvidenceRegistration {
  const scope: EvidenceScope = { values: {}, publish: options.publish, released: false };
  scopes.set(owner, scope);
  return {
    read() {
      const copy: Record<string, unknown> = {};
      for (const key of COMPILE_EVIDENCE_GLOBALS) {
        const value = scope.values[key];
        if (value !== undefined) copy[key] = Array.isArray(value) ? [...value] : value;
      }
      return copy as AuraCompileEvidence;
    },
    release() {
      scope.released = true;
      for (const key of COMPILE_EVIDENCE_GLOBALS) delete scope.values[key];
    }
  };
}

/**
 * Runs `work` with `owner`'s evidence scope active. An unregistered owner (a standalone canvas) keeps
 * whatever scope is already active, so a nested standalone-keyed call inside an app compile still
 * records to that app.
 */
export function withCompileEvidence<T>(owner: object | undefined, work: () => T): T {
  const previous = active;
  active = (owner ? scopes.get(owner) : undefined) ?? previous;
  try {
    return work();
  } finally {
    active = previous;
  }
}

function pageGlobals(): Record<string, unknown> | undefined {
  return typeof globalThis === "undefined" ? undefined : (globalThis as unknown as Record<string, unknown>);
}

/** Records `value` for `key` in the active app's evidence (and the page global when that app publishes). */
export function setCompileEvidence(key: CompileEvidenceKey, value: unknown): void {
  const scope = active;
  if (scope) {
    if (scope.released) return;
    scope.values[key] = value;
    if (!scope.publish) return;
  }
  const page = pageGlobals();
  if (page) page[key] = value;
}

/** Appends `entry` to the array evidence `key` (same routing as `setCompileEvidence`). */
export function appendCompileEvidence(key: CompileEvidenceKey, entry: unknown): void {
  const scope = active;
  if (scope) {
    if (scope.released) return;
    ((scope.values[key] ??= []) as unknown[]).push(entry);
    if (!scope.publish) return;
  }
  const page = pageGlobals();
  if (page) ((page[key] ??= []) as unknown[]).push(entry);
}

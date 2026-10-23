import type { AuraAssetRef, AuraAssetDefinition, AuraModelOptions, AuraVec3 } from "../nodes/types.js";
import { AuraNodeBuilder } from "../nodes/builder.js";
import { defineAuraAssets } from "../nodes/assets.js";
import { model } from "../nodes/model.js";
import { AuraRuntimeError } from "../compiler/errors.js";

/** One generated or bundled GLB, described the way the production bridge needs it. */
export interface AuraModelAssetEntry {
  /** Same-origin URL or pathname (for example `new URL("./hero.glb", import.meta.url).pathname`). */
  readonly url: string;
  /** SHA-256 of the file: 64 hex characters, with or without a `sha256-` prefix. */
  readonly sha256: string;
  readonly format?: "glb" | "gltf";
  readonly bounds?: AuraVec3;
  readonly sizeBytes?: number;
  /** Clip names inside the file, so `AnimationController` and docs can list them. */
  readonly animations?: readonly string[];
  readonly license?: string;
  /** Required for an absolute http(s) URL on another origin: must start with `public/aura-assets/`. */
  readonly sourcePath?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AuraModelAssetsOptions {
  /** License text applied to entries that do not carry their own. */
  readonly license?: string;
  /** Prefix joined in front of relative entry URLs (a deployment base path). */
  readonly baseUrl?: string;
  /**
   * Switch for the procedural fallback. `false` makes `assets.node(...)` build the fallback node instead of loading
   * the GLB. Leave unset to follow the `models` query parameter (`?models=0` disables, anything else enables).
   */
  readonly enabled?: boolean | (() => boolean);
  /** Query parameter that disables models when set to `0`, `false` or `off`. Pass `null` to ignore the URL. Default `models`. */
  readonly queryParam?: string | null;
}

export type AuraModelAssetRefs<T extends Record<string, AuraModelAssetEntry>> = { readonly [K in keyof T]: AuraAssetRef<"model"> };

export interface AuraModelAssetSet<T extends Record<string, AuraModelAssetEntry>> {
  /** Typed asset refs, ready for `model(refs.hero)`, `instances.model(...)` and `cloneSkinned`. */
  readonly refs: AuraModelAssetRefs<T>;
  /** Whether GLB models are in use (false means every `node()` call returns its procedural fallback). */
  readonly enabled: boolean;
  /** Sorted asset ids. */
  readonly ids: readonly (keyof T & string)[];
  /**
   * Build a model node, or the fallback node when models are switched off. Without a fallback a disabled model is
   * returned hidden (`visible: false`) so scene code never has to branch.
   */
  node(id: keyof T & string, options?: AuraModelOptions, fallback?: () => AuraNodeBuilder<any>): AuraNodeBuilder<any>;
  /** Total declared bytes (entries without `sizeBytes` count as 0), for budget checks. */
  readonly declaredBytes: number;
}

const FALSE_VALUES = new Set(["0", "false", "off", "no"]);
const HEX64 = /^[0-9a-f]{64}$/i;

/** True unless the page URL carries `?<param>=0` (or `false`, `off`, `no`). Safe outside a browser. */
export function modelsEnabledFromUrl(param = "models", href?: string): boolean {
  const source = href ?? (typeof location !== "undefined" ? location.href : undefined);
  if (!source) return true;
  try {
    const value = new URL(source, "http://localhost").searchParams.get(param);
    return value === null || !FALSE_VALUES.has(value.trim().toLowerCase());
  } catch {
    return true;
  }
}

function normalizeSha256(id: string, raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  const hex = text.toLowerCase().startsWith("sha256-") ? text.slice(7) : text;
  if (!HEX64.test(hex)) {
    throw new AuraRuntimeError("invalid-model-assets", `defineModelAssets: "${id}" needs a 64-character hex sha256 (got ${text ? `"${text.slice(0, 16)}..."` : "nothing"}). Suggested fix: run \`aura3d assets add\` or \`shasum -a 256 <file>\` and pass the digest.`);
  }
  return `sha256-${hex.toLowerCase()}`;
}

function resolveUrl(id: string, entry: AuraModelAssetEntry, baseUrl: string | undefined): string {
  if (typeof entry.url !== "string" || entry.url.length === 0) {
    throw new AuraRuntimeError("invalid-model-assets", `defineModelAssets: "${id}" has no url.`);
  }
  const remote = /^https?:\/\//i.test(entry.url);
  if (remote) {
    const origin = typeof location !== "undefined" ? location.origin : undefined;
    let sameOrigin = false;
    try {
      sameOrigin = origin !== undefined && new URL(entry.url).origin === origin;
    } catch {
      sameOrigin = false;
    }
    // A same-origin absolute URL is just a pathname: normalise it so the bridge treats it as bundled.
    if (sameOrigin) return new URL(entry.url).pathname;
    const sourcePath = (entry.sourcePath ?? "").replaceAll("\\", "/");
    if (!sourcePath.startsWith("public/aura-assets/")) {
      throw new AuraRuntimeError("invalid-model-assets", `defineModelAssets: "${id}" points at another origin (${entry.url}) without sourcePath under public/aura-assets/. The production bridge would refuse it and the scene would draw nothing. Suggested fix: serve the GLB from your own origin or add the manifest sourcePath.`);
    }
    return entry.url;
  }
  if (baseUrl && !entry.url.startsWith("/")) return `${baseUrl.replace(/\/+$/, "")}/${entry.url.replace(/^\.\//, "")}`;
  return entry.url;
}

/**
 * Declare the generated or bundled GLBs of a game once. Validates the sha256 and the URL the way the production
 * bridge will (so a bad entry fails at definition time instead of drawing nothing), returns typed refs, and carries
 * the procedural-fallback switch (`?models=0`) as an option rather than app code.
 */
export function defineModelAssets<const T extends Record<string, AuraModelAssetEntry>>(manifest: T, options: AuraModelAssetsOptions = {}): AuraModelAssetSet<T> {
  const definitions: Record<string, AuraAssetDefinition> = {};
  let declaredBytes = 0;
  for (const [id, entry] of Object.entries(manifest)) {
    const hash = normalizeSha256(id, entry.sha256);
    const url = resolveUrl(id, entry, options.baseUrl);
    const license = entry.license ?? options.license;
    declaredBytes += entry.sizeBytes ?? 0;
    definitions[id] = {
      type: "model",
      format: entry.format ?? (url.toLowerCase().endsWith(".gltf") ? "gltf" : "glb"),
      url,
      hash,
      ...(entry.bounds ? { bounds: entry.bounds } : {}),
      ...(entry.sizeBytes !== undefined ? { sizeBytes: entry.sizeBytes } : {}),
      metadata: {
        ...(entry.metadata ?? {}),
        ...(entry.animations ? { animations: entry.animations } : {}),
        ...(license ? { license } : {}),
        ...(entry.sourcePath ? { sourcePath: entry.sourcePath } : {})
      }
    };
  }
  const refs = defineAuraAssets(definitions as Record<string, AuraAssetDefinition>) as unknown as AuraModelAssetRefs<T>;
  const enabled = typeof options.enabled === "function"
    ? options.enabled()
    : options.enabled ?? (options.queryParam === null ? true : modelsEnabledFromUrl(options.queryParam ?? "models"));
  const ids = Object.keys(manifest).sort() as (keyof T & string)[];
  return {
    refs,
    enabled,
    ids,
    declaredBytes,
    node(id, nodeOptions = {}, fallback) {
      const ref = (refs as Record<string, AuraAssetRef<"model">>)[id];
      if (!ref) throw new AuraRuntimeError("invalid-model-assets", `defineModelAssets: unknown model id "${id}". Known ids: ${ids.join(", ") || "none"}.`);
      if (enabled) return model(ref, nodeOptions);
      return fallback ? fallback() : model(ref, { ...nodeOptions, visible: false });
    }
  };
}

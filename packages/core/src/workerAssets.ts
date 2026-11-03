/** URLs emitted for an installed render worker and its same-origin dependencies. */
export interface AuraWorkerAssetUrls {
  readonly vfx1024: string;
  readonly vfx2048: string;
  readonly humanoid: string;
  readonly retargetWorker: string;
  readonly basisScript: string;
  readonly basisModule: string;
  readonly basisWasm: string;
  readonly basisWorker: string;
  readonly dracoModule: string;
  readonly dracoWasm: string;
  readonly meshoptModule: string;
  /** Optional for compatibility with manifests produced before the SPZ v4 decoder shipped. */
  readonly zstdWorker?: string;
}

const FIELDS = ["vfx1024", "vfx2048", "humanoid", "retargetWorker", "basisScript", "basisModule", "basisWasm", "basisWorker", "dracoModule", "dracoWasm", "meshoptModule"] as const;
const OPTIONAL_FIELDS = ["zstdWorker"] as const;
const PARAMETER = "aura3dWorkerAssets";
const ASSET_KEY = Symbol.for("@aura3d/worker-assets");
const workerRealm = globalThis as typeof globalThis & { [key: symbol]: unknown };

function validatedAssets(value: unknown, origin: string): Readonly<AuraWorkerAssetUrls> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid worker asset manifest");
  const record = value as Record<string, unknown>;
  const allowed = new Set<string>([...FIELDS, ...OPTIONAL_FIELDS]);
  if (Object.keys(record).some((name) => !allowed.has(name)) || FIELDS.some((name) => typeof record[name] !== "string") || OPTIONAL_FIELDS.some((name) => record[name] !== undefined && typeof record[name] !== "string")) {
    throw new Error("Incomplete worker asset manifest");
  }
  const result: Record<string, string> = {};
  for (const name of [...FIELDS, ...OPTIONAL_FIELDS]) {
    if (record[name] === undefined) continue;
    let url: URL;
    try { url = new URL(record[name] as string); } catch { throw new Error(`Invalid worker asset URL: ${name}`); }
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
      throw new Error(`Worker asset must be a same-origin HTTP URL: ${name}`);
    }
    result[name] = url.href;
  }
  return Object.freeze(result) as unknown as Readonly<AuraWorkerAssetUrls>;
}

/** Encode resolved asset URLs in a worker URL without mutating the caller's URL. */
export function workerUrlWithAssets(workerUrl: URL, assets: AuraWorkerAssetUrls): URL {
  // Preserve the URL helper for server-side module inspection. Browsers serve
  // the actual worker over HTTP(S), where the manifest must be same-origin.
  if (workerUrl.protocol === "file:") return new URL(workerUrl);
  if (!["http:", "https:"].includes(workerUrl.protocol) || workerUrl.username || workerUrl.password) throw new Error("Worker URL must be same-origin HTTP");
  const result = new URL(workerUrl);
  const manifest = JSON.stringify(validatedAssets(assets, result.origin));
  if (manifest.length > 16_384) throw new Error("Worker asset manifest is too large");
  result.searchParams.set(PARAMETER, manifest);
  return result;
}

/** Install an optional manifest before the worker accepts its first request. */
export function installWorkerAssetsFromUrl(href: string): () => void {
  const url = new URL(href);
  const entries = url.searchParams.getAll(PARAMETER);
  if (entries.length === 0) return () => undefined;
  if (entries.length !== 1 || entries[0]!.length > 16_384) throw new Error("Invalid worker asset manifest parameter");
  let value: unknown;
  try { value = JSON.parse(entries[0]!); } catch { throw new Error("Invalid worker asset manifest JSON"); }
  const next = validatedAssets(value, url.origin);
  const previous = workerRealm[ASSET_KEY];
  workerRealm[ASSET_KEY] = next;
  return () => {
    if (workerRealm[ASSET_KEY] !== next) return;
    if (previous === undefined) delete workerRealm[ASSET_KEY]; else workerRealm[ASSET_KEY] = previous;
  };
}

/** The manifest belongs to the current dedicated-worker realm. */
export function currentWorkerAssets(): Readonly<AuraWorkerAssetUrls> | undefined {
  return workerRealm[ASSET_KEY] as Readonly<AuraWorkerAssetUrls> | undefined;
}

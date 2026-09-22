import { GLTFLoader, type GLTFAsset, type GLTFDracoDecoder, type GLTFMeshoptDecoder } from "./GLTFLoader";
import { LoadContext } from "./LoadContext";

/**
 * Reuses the *parsed* GLB across pipelines that point at the same URL, so N scene nodes of one prop
 * cost one fetch/parse instead of N.
 *
 * Only `GLTFAsset` is shared. It is read-only after load (`createScene` rebuilds a fresh node graph
 * per call), while render resources are not: every pipeline still runs `createGLTFRenderResources`,
 * so each actor owns its own `Scene`/`Geometry`/`Material`/`Texture` and its own mutations (root
 * rename, `hiddenNodeNames`, tints, morph weights) stay isolated.
 *
 * Ownership is reference counted: a pipeline holds one lease and releases it in `dispose()`, so one
 * actor disposing cannot invalidate a live peer, and a fully released parse is never served again.
 */
interface ParsedAssetEntry {
  readonly key: string;
  promise: Promise<GLTFAsset>;
  asset: GLTFAsset | undefined;
  references: number;
}

export interface ParsedGLTFAssetLease {
  readonly asset: GLTFAsset;
  /** Idempotent: a second call is a no-op so a double `dispose()` cannot underflow the count. */
  release(): void;
}

const parsedAssets = new Map<string, ParsedAssetEntry>();
const decoderIds = new WeakMap<object, number>();
let nextDecoderId = 1;

function decoderToken(decoder: GLTFDracoDecoder | GLTFMeshoptDecoder | undefined): string {
  if (!decoder) return "none";
  const identity = decoder as unknown as object;
  let id = decoderIds.get(identity);
  if (id === undefined) {
    id = nextDecoderId;
    decoderIds.set(identity, id);
    nextDecoderId += 1;
  }
  return `decoder-${id}`;
}

/**
 * Everything that changes the parse. Scene selection (`sceneIndex`/`sceneName`), `materialVariant`
 * and `imageDecoder` are deliberately absent: they are consumed by `createGLTFRenderResources`,
 * which still runs per pipeline, so keying on them would only split entries that parse identically.
 */
export function parsedGLTFAssetCacheKey(
  url: string,
  dracoDecoder?: GLTFDracoDecoder,
  meshoptDecoder?: GLTFMeshoptDecoder
): string {
  return [
    new LoadContext().resolve(url),
    `draco=${decoderToken(dracoDecoder)}`,
    `meshopt=${decoderToken(meshoptDecoder)}`
  ].join("|");
}

function disposeParsedAsset(asset: GLTFAsset): void {
  if ("dispose" in asset && typeof (asset as { dispose?: unknown }).dispose === "function") {
    (asset as { dispose(): void }).dispose();
  }
}

function releaseEntry(entry: ParsedAssetEntry): void {
  if (entry.references <= 0) return;
  entry.references -= 1;
  if (entry.references > 0) return;
  // Last lease gone: stop serving this parse so a later load re-fetches instead of handing out an
  // asset whose owners have all released it.
  if (parsedAssets.get(entry.key) === entry) parsedAssets.delete(entry.key);
  if (entry.asset) disposeParsedAsset(entry.asset);
}

async function parseGLTFAssetForCache(
  entry: ParsedAssetEntry,
  options: {
    readonly url: string;
    readonly dracoDecoder?: GLTFDracoDecoder;
    readonly meshoptDecoder?: GLTFMeshoptDecoder;
  }
): Promise<GLTFAsset> {
  try {
    const asset = await new GLTFLoader({
      ...(options.dracoDecoder ? { dracoDecoder: options.dracoDecoder } : {}),
      ...(options.meshoptDecoder ? { meshoptDecoder: options.meshoptDecoder } : {})
    }).load({ url: options.url }, new LoadContext());
    entry.asset = asset;
    return asset;
  } catch (error) {
    // Failures are never cached: drop the entry so the next load starts clean.
    if (parsedAssets.get(entry.key) === entry) parsedAssets.delete(entry.key);
    throw error;
  }
}

export async function acquireParsedGLTFAsset(options: {
  readonly url: string;
  readonly dracoDecoder?: GLTFDracoDecoder;
  readonly meshoptDecoder?: GLTFMeshoptDecoder;
}): Promise<ParsedGLTFAssetLease> {
  const key = parsedGLTFAssetCacheKey(options.url, options.dracoDecoder, options.meshoptDecoder);
  let entry = parsedAssets.get(key);
  if (!entry) {
    const created: ParsedAssetEntry = { key, promise: Promise.resolve(undefined as never), asset: undefined, references: 0 };
    created.promise = parseGLTFAssetForCache(created, options);
    parsedAssets.set(key, created);
    entry = created;
  }

  entry.references += 1;
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    releaseEntry(entry!);
  };
  try {
    return { asset: await entry.promise, release };
  } catch (error) {
    // A waiter on a failed parse must give its reference back, otherwise the entry would be pinned
    // forever with no asset in it.
    release();
    throw error;
  }
}

export interface ParsedGLTFAssetCacheSnapshot {
  readonly cachedEntries: number;
  readonly keys: readonly string[];
}

/** Diagnostics only: lets a test prove an entry was dropped instead of leaking forever. */
export function snapshotParsedGLTFAssetCache(): ParsedGLTFAssetCacheSnapshot {
  const keys = [...parsedAssets.keys()];
  return { cachedEntries: keys.length, keys };
}

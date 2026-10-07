/**
 * capture/lookSignature.ts — PRD-09 day-0.
 *
 * SHA-256 look signature over a canonicalized render manifest:
 *   { lights, materials, effects, environment, background, renderer options,
 *     nodes: { id → { asset, material, authored scale, authored visible } } }
 * Camera pose, animation state, and runtime transforms (position/rotation)
 * are excluded. Canonicalization recursively sorts object keys so identical
 * scenes hash identically regardless of authoring key order. `crypto.subtle`
 * is required — non-secure contexts reject.
 */

export interface LookNodeEntry {
  readonly id: string;
  readonly asset?: unknown;
  readonly material?: unknown;
  readonly scale?: unknown;
  readonly visible?: unknown;
}

export interface LookSource {
  readonly background?: unknown;
  readonly environment?: unknown;
  readonly lights?: unknown;
  readonly materials?: unknown;
  readonly effects?: unknown;
  readonly nodes?: unknown;
  readonly renderer?: unknown;
  readonly rendererOptions?: unknown;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Recursively sort plain-object keys; arrays keep authored order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v !== undefined && typeof v !== "function") out[key] = canonicalize(v);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

/** Extract the look-defining fields of one authored node entry. */
function nodeEntry(entry: Record<string, unknown>): unknown {
  const out: Record<string, unknown> = {};
  const asset = entry.asset ?? entry.source ?? entry.gltf ?? entry.model;
  if (asset !== undefined) out.asset = canonicalize(asset);
  const material = entry.material ?? entry.materials;
  if (material !== undefined) out.material = canonicalize(material);
  if (entry.scale !== undefined) out.scale = canonicalize(entry.scale);
  if (entry.visible !== undefined) out.visible = canonicalize(entry.visible);
  return out;
}

/** Build the canonical manifest for a scene snapshot + renderer options. */
export function lookManifest(source: LookSource): Record<string, unknown> {
  const nodes: Record<string, unknown> = {};
  const rawNodes = source.nodes;
  if (Array.isArray(rawNodes)) {
    for (const entry of rawNodes) {
      if (!isPlainObject(entry)) continue;
      const id = typeof entry.id === "string" ? entry.id : typeof entry.name === "string" ? entry.name : null;
      if (id === null) continue;
      nodes[id] = nodeEntry(entry);
    }
  } else if (isPlainObject(rawNodes)) {
    for (const [id, entry] of Object.entries(rawNodes)) {
      if (isPlainObject(entry)) nodes[id] = nodeEntry(entry);
    }
  }
  const manifest: Record<string, unknown> = {
    version: 1,
    background: source.background ?? null,
    environment: source.environment ?? null,
    lights: source.lights ?? null,
    materials: source.materials ?? null,
    effects: source.effects ?? null,
    renderer: source.renderer ?? source.rendererOptions ?? null,
    nodes
  };
  return canonicalize(manifest) as Record<string, unknown>;
}

/** Stable string for hashing: JSON.stringify over the canonical manifest. */
export function lookManifestString(source: LookSource | Record<string, unknown>): string {
  const manifest = "version" in source ? canonicalize(source) : lookManifest(source as LookSource);
  return JSON.stringify(manifest);
}

function assertSecureContext(): void {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  const insecureWindow =
    typeof window !== "undefined" &&
    (window as { isSecureContext?: boolean }).isSecureContext === false;
  if (subtle === undefined || insecureWindow) {
    throw new Error("AURA_LOOK_SIGNATURE_INSECURE: lookSignature requires a secure context (crypto.subtle).");
  }
}

/** SHA-256 of the canonical manifest, lowercase hex. */
export async function lookSignature(source: LookSource | Record<string, unknown> | { lookSource(): LookSource }): Promise<string> {
  assertSecureContext();
  const resolved =
    typeof (source as { lookSource?: unknown }).lookSource === "function"
      ? (source as { lookSource(): LookSource }).lookSource()
      : (source as LookSource);
  const encoded = new TextEncoder().encode(lookManifestString(resolved));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

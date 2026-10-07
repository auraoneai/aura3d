/**
 * PRD 11 Phase 6 groundwork (§7.3, ◦): WGSL twin manifest.
 *
 * C-02 `ShaderChunk.wgsl` is the twin field; chunks registered without it are
 * reported — never fatal — until G-WGPU is a "go" (§6.2). Lane-11-owned
 * chunks register their twins in `program/chunks/*.wgsl.ts` and pass them to
 * `registerShaderChunk` directly; this manifest additionally records them so
 * `manifestParity` can report coverage without a lane-01 enumeration API
 * (requested via qr-request: `allShaderChunks()` on contracts/program.ts).
 *
 * `manifestParity(registered?)` takes an optional explicit list of
 * `{name, owner}` descriptors — callers that do have chunk access (tests,
 * the naga job) pass it; without it the manifest reports only the twins it
 * knows about.
 */

export interface WgslTwinEntry {
  readonly chunkName: string;
  readonly owner: string;
  readonly wgsl: string;
}

const twins = new Map<string, WgslTwinEntry>();

/** Record a WGSL twin for a registered C-02 chunk. Idempotent per name. */
export function registerWgslTwin(entry: WgslTwinEntry): void {
  twins.set(entry.chunkName, entry);
}

export function wgslTwinFor(chunkName: string): string | undefined {
  return twins.get(chunkName)?.wgsl;
}

export function wgslTwins(): readonly WgslTwinEntry[] {
  return [...twins.values()];
}

export interface ManifestParity {
  readonly withTwin: number;
  readonly missing: readonly { readonly name: string; readonly owner: string }[];
}

/**
 * Compare the known registered chunks against the twin table.
 * `registered` is optional until C-02 exposes enumeration; when omitted the
 * report covers the manifest's own twin table (missing = []).
 */
export function manifestParity(registered?: readonly { readonly name: string; readonly owner?: string; readonly wgsl?: string }[]): ManifestParity {
  if (!registered) {
    return { withTwin: twins.size, missing: [] };
  }
  const missing: { name: string; owner: string }[] = [];
  let withTwin = 0;
  for (const chunk of registered) {
    if (chunk.wgsl !== undefined || twins.has(chunk.name)) {
      withTwin += 1;
    } else {
      missing.push({ name: chunk.name, owner: chunk.owner ?? "unknown" });
    }
  }
  return { withTwin, missing };
}

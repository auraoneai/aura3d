import type { ProgramCacheLike, ProgramFeatures } from "../contracts/program";
import type { RenderShaderProgram } from "../RenderDevice";

/** Internal capability for a concrete cache whose original methods remain intact. */
export interface StaticGeneratedCacheCapability {
  peekReady(features: ProgramFeatures): RenderShaderProgram | undefined;
  commitReadyReuse(features: ProgramFeatures, expectedProgram: RenderShaderProgram, count: number): boolean;
}

const capabilities = new WeakMap<ProgramCacheLike, { readonly current: () => boolean; readonly value: StaticGeneratedCacheCapability }>();

/** @internal Installed once by the owning concrete cache, never by a stub. */
export function registerStaticGeneratedCacheCapability(
  cache: ProgramCacheLike,
  current: () => boolean,
  operations: StaticGeneratedCacheCapability
): void {
  if (capabilities.has(cache)) throw new Error("Static generated cache capability already registered");
  const value = Object.freeze({
    peekReady: (features: ProgramFeatures) => current() ? operations.peekReady(features) : undefined,
    commitReadyReuse: (features: ProgramFeatures, expected: RenderShaderProgram, count: number) =>
      current() && operations.commitReadyReuse(features, expected, count)
  });
  capabilities.set(cache, { current, value });
}

/** Does not inspect or invoke any method on an unregistered cache. */
export function staticGeneratedCacheCapability(cache: ProgramCacheLike): StaticGeneratedCacheCapability | undefined {
  const entry = capabilities.get(cache);
  return entry?.current() ? entry.value : undefined;
}

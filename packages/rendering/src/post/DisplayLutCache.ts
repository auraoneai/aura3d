/**
 * PRD-03 §6.7 S10b — the baked display-grade 3D LUT cache.
 *
 * The analytic display grade (contrast/saturation/vibrance/user .cube at
 * intensity) is constant per frame, so the 65³ RGBA8 bake runs once per
 * unique option set and is reused — the "rebake count 1 across 60 frames"
 * gate. The cache is GL-agnostic: the caller supplies the bake/destroy
 * callbacks; keys are the canonical JSON of the grade inputs.
 */

export interface DisplayGradeParams {
  readonly contrast: number;
  readonly saturation: number;
  readonly vibrance: number;
  readonly lutIntensity: number;
  /** Identity of the user `.cube` texture (e.g. its source id); 0 = none. */
  readonly userLut: string | number;
}

export function displayGradeKey(params: DisplayGradeParams): string {
  // Canonical key — field order fixed, numbers verbatim.
  return `c${params.contrast}|s${params.saturation}|v${params.vibrance}|i${params.lutIntensity}|u${String(params.userLut)}`;
}

export interface DisplayLutCacheOptions {
  /**
   * GU47 E-C: least-recently-used bound on resident handles; the oldest is
   * destroyed when a new bake would exceed it. Default unbounded.
   */
  readonly maxEntries?: number;
}

export class DisplayLutCache<THandle> {
  private readonly entries = new Map<string, THandle>();
  private readonly maxEntries: number;
  /** Number of bakes actually performed — the phase-2 metric. */
  public bakeCount = 0;

  public constructor(
    private readonly bake: (params: DisplayGradeParams) => THandle,
    private readonly destroy: (handle: THandle) => void,
    options: DisplayLutCacheOptions = {}
  ) {
    this.maxEntries = options.maxEntries !== undefined && options.maxEntries >= 1 ? Math.floor(options.maxEntries) : Number.POSITIVE_INFINITY;
  }

  /** The handle for `params`, baking only on a miss. A failed bake caches nothing. */
  public acquire(params: DisplayGradeParams): THandle {
    const key = displayGradeKey(params);
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      // LRU touch: re-insert so iteration order is oldest-first.
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }
    const handle = this.bake(params);
    this.entries.set(key, handle);
    this.bakeCount += 1;
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      const evicted = this.entries.get(oldest) as THandle;
      this.entries.delete(oldest);
      this.destroy(evicted);
    }
    return handle;
  }

  public get size(): number {
    return this.entries.size;
  }

  public clear(): void {
    for (const handle of this.entries.values()) this.destroy(handle);
    this.entries.clear();
  }
}

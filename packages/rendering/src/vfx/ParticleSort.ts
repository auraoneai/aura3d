// PRD-07 P1-T7 — view-depth sort for transparent particle batches (§6.2.2).
// LSD radix pass over 16-bit quantized view depth; skipped when the camera
// moved less than 1 cm / rotated less than 0.5° and no batch changed.

export interface SortableBatch {
  /** Sort key source: the batch's centre point in view space (larger = nearer-to-camera negative z handled by caller). */
  readonly sortDepth: number;
  readonly changed?: boolean;
}

export class ParticleSort {
  private keys = new Uint16Array(0);
  private order = new Uint32Array(0);
  private scratch = new Uint32Array(0);
  private counts = new Uint32Array(256);
  private lastCamera = new Float32Array(0);
  private lastOrder: Uint32Array | null = null;
  private lastCount = 0;

  /**
   * Back-to-front order into `batches` (largest view depth first — drawn first,
   * farthest away). Reuses the previous order when the camera basis moved less
   * than 1 cm, rotated less than ~0.5°, and no batch flagged `changed`.
   */
  sort<T extends SortableBatch>(batches: readonly T[], cameraBasis: Float32Array): Uint32Array {
    const n = batches.length;
    if (n <= 1) {
      this.lastOrder = n === 1 ? Uint32Array.of(0) : null;
      this.lastCount = n;
      this.lastCamera = cameraBasis.slice(0, 12);
      return this.lastOrder ?? new Uint32Array(0);
    }
    const stable = n === this.lastCount && this.lastOrder !== null
      && cameraMovedLittle(this.lastCamera, cameraBasis)
      && !batches.some((b) => b.changed === true);
    if (stable) return this.lastOrder as Uint32Array;

    if (this.keys.length < n) {
      this.keys = new Uint16Array(n);
      this.order = new Uint32Array(n);
      this.scratch = new Uint32Array(n);
    }
    // Quantize to a DESCENDING 16-bit key so the stable radix passes emit
    // back-to-front directly — sorting ascending then reversing would flip the
    // order of equal-key batches relative to a stable Array.sort comparator.
    for (let i = 0; i < n; i++) {
      const d = batches[i].sortDepth;
      const q = d <= 0 ? 0 : Math.min(65535, Math.round((Math.min(d, 4096) / 4096) * 65535));
      this.keys[i] = 65535 - q;
    }
    for (let i = 0; i < n; i++) this.order[i] = i;
    radixPass(this.keys, this.order, this.scratch, this.counts, n, 0);
    radixPass(this.keys, this.order, this.scratch, this.counts, n, 8);
    const out = this.order.subarray(0, n);
    this.lastOrder = out.slice();
    this.lastCount = n;
    this.lastCamera = cameraBasis.slice(0, 12);
    return this.lastOrder;
  }
}

function radixPass(
  keys: Uint16Array,
  order: Uint32Array,
  scratch: Uint32Array,
  counts: Uint32Array,
  n: number,
  shift: 0 | 8
): void {
  counts.fill(0);
  for (let i = 0; i < n; i++) counts[(keys[order[i]] >> shift) & 0xff]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    const c = counts[i];
    counts[i] = sum;
    sum += c;
  }
  for (let i = 0; i < n; i++) scratch[counts[(keys[order[i]] >> shift) & 0xff]++] = order[i];
  order.set(scratch.subarray(0, n));
}

function cameraMovedLittle(prev: Float32Array, next: Float32Array): boolean {
  if (prev.length < 12 || next.length < 12) return false;
  // prev/next hold the camera's view-matrix upper 3x4 (rotation + translation).
  let rotDelta = 0;
  let posDelta = 0;
  for (let i = 0; i < 9; i++) rotDelta += Math.abs(prev[i] - next[i]);
  for (let i = 9; i < 12; i++) posDelta += Math.abs(prev[i] - next[i]);
  return rotDelta < 0.0087 /* ~0.5° on the basis entries */ && posDelta < 0.01 /* 1 cm */;
}

/**
 * Aura3D Quality Rebuild — shared contract mechanics (CONTRACTS.md §1.1).
 *
 * `@aura3d/rendering` is the lowest package shared by renderer, assets and
 * engine. Every cross-PRD dependency is a numbered contract with a frozen
 * TypeScript surface, a stub shipped in PR 0, and a conformance test. The real
 * implementation replaces the stub behind a flag; consumers never change code
 * at swap time.
 */

export type PrdId =
  | "prd01" | "prd02" | "prd03" | "prd04" | "prd05" | "prd06" | "prd07" | "prd08"
  | "prd09" | "prd10" | "prd11" | "prd12" | "prd13" | "prd14" | "prd15";

export type ContractId = `C-${string}`; // "C-01".."C-40", versioned "C-09v2"

/** Full flag names; see CONTRACTS.md §5. */
export type QrFlagName =
  | "A3D_QR_CORE" | "A3D_QR_LIGHTING" | "A3D_QR_POST" | "A3D_QR_MATERIALS" | "A3D_QR_ASSETS"
  | "A3D_QR_ANIMATION" | "A3D_QR_VFX" | "A3D_QR_CAMERA" | "A3D_QR_GAME" | "A3D_QR_WORLD"
  | "A3D_QR_TIERS" | "A3D_QR_WEBGPU" | "A3D_QR_LOOKS" | "A3D_QR_COMPILER" | "A3D_QR_STRICT"
  // threejs-parity (docs/workflows/threejs-parity-gaps.md §5.0): per-lane dev
  // gates — a flag flips to default-on only after its browser fixtures pass on
  // the remote GPU runner with 0 LPIPS regressions.
  | "A3D_PARITY_SHADING" | "A3D_PARITY_GEOMETRY" | "A3D_PARITY_TEXTURES"
  | "A3D_PARITY_BATCHING" | "A3D_PARITY_LINES" | "A3D_PARITY_RUNTIME"
  | `A3D_QR_${string}_${string}`; // sub-flags, e.g. A3D_QR_POST_TAA

export type QrFlagValue = boolean | string; // string only for multi-valued flags (A3D_QR_CORE = "v2")

export interface QrFlags {
  readonly values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>>;
  on(name: QrFlagName): boolean;
}

export interface ContractSlot<T> {
  readonly id: ContractId;
  readonly owner: PrdId;
  readonly flag: QrFlagName;
  readonly stub: T;
  /** True once the provider lane has called provide(). */
  readonly provided: boolean;
  /** Called exactly once, from the provider's lane barrel. A second call throws `CONTRACT_ALREADY_PROVIDED:<id>`. */
  provide(real: T): void;
  /** Real impl iff provided && flags.on(flag); otherwise stub. Call at mount/resolve time, never per draw. */
  get(flags: QrFlags): T;
}

class ContractSlotImpl<T> implements ContractSlot<T> {
  private real: T | undefined;
  constructor(
    public readonly id: ContractId,
    public readonly owner: PrdId,
    public readonly flag: QrFlagName,
    public readonly stub: T
  ) {}

  get provided(): boolean {
    return this.real !== undefined;
  }

  provide(real: T): void {
    if (this.real !== undefined) {
      throw new Error(`CONTRACT_ALREADY_PROVIDED:${this.id}`);
    }
    this.real = real;
  }

  get(flags: QrFlags): T {
    if (this.real !== undefined && flags.on(this.flag)) {
      return this.real;
    }
    return this.stub;
  }
}

export function defineContractSlot<T>(id: ContractId, owner: PrdId, flag: QrFlagName, stub: T): ContractSlot<T> {
  return new ContractSlotImpl(id, owner, flag, stub);
}

/** Registry primitive used by every hook registry in §3 (ordered, owner-tagged, duplicate-id safe). */
export interface RegistryEntry {
  readonly id: string;
  readonly owner: PrdId;
  readonly flag: QrFlagName;
  readonly order?: number;
}

export interface Registry<E extends RegistryEntry> {
  /** duplicate id throws REGISTRY_DUPLICATE:<id> */
  register(entry: E): () => void;
  /** entries whose flag is on, sorted by (order ?? 0, id) */
  active(flags: QrFlags): readonly E[];
  all(): readonly E[];
}

class RegistryImpl<E extends RegistryEntry> implements Registry<E> {
  private readonly entries = new Map<string, E>();
  /** Bumped by every register/unregister so a memoised `active()` list never outlives a registry change. */
  private version = 0;
  /**
   * `active(flags)` runs several times per frame (frame contributors, shader features, material lobes) and rebuilt, filtered
   * and sorted the registry each time. Resolved `QrFlags` are immutable (their `values` map is frozen), so the list for one
   * flags object only changes when the registry does. Flags objects without a frozen `values` map (test doubles) are never cached.
   */
  private readonly activeMemo = new WeakMap<QrFlags, { readonly version: number; readonly result: readonly E[] }>();
  constructor(public readonly name: string) {}

  register(entry: E): () => void {
    if (this.entries.has(entry.id)) {
      throw new Error(`REGISTRY_DUPLICATE:${entry.id}`);
    }
    this.entries.set(entry.id, entry);
    this.version += 1;
    return () => {
      if (this.entries.get(entry.id) === entry) {
        this.entries.delete(entry.id);
        this.version += 1;
      }
    };
  }

  active(flags: QrFlags): readonly E[] {
    const values = (flags as { readonly values?: unknown }).values;
    const cacheable = typeof values === "object" && values !== null && Object.isFrozen(values);
    if (cacheable) {
      const hit = this.activeMemo.get(flags);
      if (hit !== undefined && hit.version === this.version) return hit.result;
    }
    const result = Object.freeze([...this.entries.values()]
      .filter((entry) => flags.on(entry.flag))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
    if (cacheable) this.activeMemo.set(flags, { version: this.version, result });
    return result;
  }

  all(): readonly E[] {
    return [...this.entries.values()];
  }
}

export function createRegistry<E extends RegistryEntry>(name: string): Registry<E> {
  return new RegistryImpl<E>(name);
}

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
  constructor(public readonly name: string) {}

  register(entry: E): () => void {
    if (this.entries.has(entry.id)) {
      throw new Error(`REGISTRY_DUPLICATE:${entry.id}`);
    }
    this.entries.set(entry.id, entry);
    return () => {
      if (this.entries.get(entry.id) === entry) {
        this.entries.delete(entry.id);
      }
    };
  }

  active(flags: QrFlags): readonly E[] {
    return [...this.entries.values()]
      .filter((entry) => flags.on(entry.flag))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  all(): readonly E[] {
    return [...this.entries.values()];
  }
}

export function createRegistry<E extends RegistryEntry>(name: string): Registry<E> {
  return new RegistryImpl<E>(name);
}

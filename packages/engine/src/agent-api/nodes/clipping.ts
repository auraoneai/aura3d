import { validateClippingGroup } from "@aura3d/rendering";
import type { ClippingGroup, ClippingGroupInput, ClippingPlane, ClippingScope } from "@aura3d/rendering";

/** A plane retains points where `a*x + b*y + c*z + d >= 0`. */
export type AuraClipPlane = ClippingPlane;
export type AuraClipScope = ClippingScope;

export interface AuraClipOptions extends Omit<ClippingGroupInput, "scope" | "disposed"> {}
export type AuraGlobalClipOptions = Omit<AuraClipOptions, "space"> & { readonly space?: "world" };

/** JSON-safe state for scene snapshots and material serialization. */
export interface AuraClipGroupSnapshot extends ClippingGroup {
  readonly kind: "aura-clip-group";
  readonly scope: AuraClipScope;
  readonly revision: number;
  readonly disposed: boolean;
}

/**
 * Mutable group shared with the mounted scene or material. A draw reads its
 * current state, so editing a plane changes a uniform rather than the shader
 * variant. Replacing the caller's input arrays cannot mutate the group.
 */
export class AuraClipGroup {
  readonly kind = "aura-clip-group" as const;
  readonly scope: AuraClipScope;
  private current: ClippingGroup;
  private version = 0;
  private retired = false;
  private readonly listeners = new Set<{ readonly listener: () => void }>();
  private pendingNotifications = 0;
  private notifying = false;

  constructor(scope: AuraClipScope, options: AuraClipOptions) {
    this.scope = scope;
    this.current = validateClippingGroup(options, scope);
  }

  get planes(): readonly AuraClipPlane[] { return this.current.planes.map((plane) => [...plane] as AuraClipPlane); }
  get space(): ClippingGroup["space"] { return this.current.space; }
  get combine(): ClippingGroup["combine"] { return this.current.combine; }
  get clipShadows(): boolean { return this.current.clipShadows; }
  get enabled(): boolean { return this.current.enabled; }
  get revision(): number { return this.version; }
  get disposed(): boolean { return this.retired; }

  /** Validate a complete candidate before making any change. */
  update(options: Partial<AuraClipOptions>): this {
    this.assertActive();
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Clipping update must be an options object.");
    const next = validateClippingGroup({ ...this.current, ...options }, this.scope);
    if (!equalGroup(this.current, next)) {
      this.current = next;
      this.version += 1;
      this.notify();
    }
    return this;
  }

  setEnabled(enabled: boolean): this {
    return this.update({ enabled });
  }

  snapshot(): AuraClipGroupSnapshot {
    return {
      kind: this.kind,
      scope: this.scope,
      revision: this.version,
      disposed: this.retired,
      planes: this.planes,
      space: this.space,
      combine: this.combine,
      clipShadows: this.clipShadows,
      enabled: this.enabled
    };
  }

  toJSON(): AuraClipGroupSnapshot { return this.snapshot(); }

  /** Notify mounted scenes after committed changes, including disposal. */
  onChange(listener: () => void): () => void {
    if (typeof listener !== "function") throw new TypeError("Clipping listener must be a function.");
    if (this.retired) return () => {};
    // Subscription records let the same callback be registered independently.
    const subscription = { listener };
    this.listeners.add(subscription);
    return () => { this.listeners.delete(subscription); };
  }

  /** Disable immediately and permanently; the caller owns the group. */
  dispose(): void {
    if (this.retired) return;
    this.current = { ...this.current, enabled: false };
    this.retired = true;
    this.version += 1;
    this.notify();
  }

  private notify(): void {
    this.pendingNotifications += 1;
    if (this.notifying) return;
    this.notifying = true;
    try {
      while (this.pendingNotifications > 0) {
        this.pendingNotifications -= 1;
        for (const subscription of [...this.listeners]) {
          if (!this.listeners.has(subscription)) continue;
          try { subscription.listener(); } catch { /* A committed edit must reach the remaining listeners. */ }
        }
      }
    } finally {
      this.notifying = false;
      if (this.retired) this.listeners.clear();
    }
  }

  private assertActive(): void {
    if (this.retired) throw new Error("Clipping group is disposed.");
  }
}

function equalGroup(a: ClippingGroup, b: ClippingGroup): boolean {
  return a.space === b.space && a.combine === b.combine && a.clipShadows === b.clipShadows && a.enabled === b.enabled &&
    a.planes.length === b.planes.length && a.planes.every((plane, index) => plane.every((value, component) => value === b.planes[index][component]));
}

export const clipping = {
  /** Scene-wide planes are in world coordinates. */
  global: (options: AuraGlobalClipOptions): AuraClipGroup => new AuraClipGroup("global", options),
  /** Material planes may be world- or object-local; default is world space. */
  material: (options: AuraClipOptions): AuraClipGroup => new AuraClipGroup("material", options)
} as const;

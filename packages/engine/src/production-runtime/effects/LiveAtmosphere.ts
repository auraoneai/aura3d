// PRD-07 P4-T3 — per-app atmosphere state (fog / sky / wetness).
// Owns the spec-level AuraApp.atmosphere surface and the values published to
// the render source; resolution/tweening is per PRD-07 §6.6/§8.2.

import type { AuraHeightFogSpec, AuraSkySpec } from "../../contracts/atmosphere";
import type { EffectNodeLike } from "./EffectNodeLowering";

export interface AtmosphereFrameState {
  readonly sky: AuraSkySpec | null;
  readonly fog: AuraHeightFogSpec | null;
  readonly wetness: number;
}

/** §6.6 — per-node live fog state tracked in a WeakMap keyed by node object. */
export interface LiveFogState {
  spec: AuraHeightFogSpec;
  visible: boolean;
}

const FOG_SPECS_WEAK = new WeakMap<object, LiveFogState>();

function specFromNode(node: EffectNodeLike): AuraHeightFogSpec {
  // The node's authored §6.6 fields carry the AuraHeightFogSpec names; copy
  // defined fields only — defaults are applied at resolve time (C-21).
  const n = node as unknown as Record<string, unknown>;
  const spec: Record<string, unknown> = {};
  for (const key of [
    "mode", "color", "density", "heightDensity", "heightFalloff", "heightReference",
    "start", "maxOpacity", "near", "far", "absorption", "sunInscatter", "anisotropy",
    "ambientScale", "affectsBackground", "backgroundDistance", "transitionSeconds",
    "legacyOpacityCap", "intensity",
    // fogVolume fields (§6.6): constant-density box/ellipsoid
    "shape", "center", "halfSize"
  ]) {
    if (n[key] !== undefined) spec[key] = n[key];
  }
  return spec as AuraHeightFogSpec;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function colorToLinear(color: unknown): [number, number, number] | null {
  if (Array.isArray(color)) return [Number(color[0]) || 0, Number(color[1]) || 0, Number(color[2]) || 0];
  if (typeof color === "string" && color !== "sky") {
    const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
    if (m) {
      const v = parseInt(m[1], 16);
      const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      return [srgb(((v >> 16) & 255) / 255), srgb(((v >> 8) & 255) / 255), srgb((v & 255) / 255)];
    }
  }
  return null;
}

/** Linear-space interpolation: density scalar in linear space, colour in linear RGB (§6.6). */
function interpolateFogSpec(from: AuraHeightFogSpec, to: AuraHeightFogSpec, t: number): AuraHeightFogSpec {
  const out: Record<string, unknown> = { ...from, ...to };
  const numKeys = ["density", "heightDensity", "heightFalloff", "heightReference", "start", "maxOpacity", "near", "far", "sunInscatter", "anisotropy", "ambientScale", "intensity", "backgroundDistance"] as const;
  for (const key of numKeys) {
    const a = (from as Record<string, unknown>)[key];
    const b = (to as Record<string, unknown>)[key];
    if (typeof a === "number" && typeof b === "number") out[key] = lerp(a, b, t);
    else if (typeof a === "number") out[key] = a;
    else out[key] = b;
  }
  const ca = colorToLinear(from.color);
  const cb = colorToLinear(to.color);
  if (ca && cb) out.color = [lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)];
  else out.color = t < 1 ? from.color : to.color;
  if (Array.isArray(from.absorption) && Array.isArray(to.absorption)) {
    out.absorption = [lerp(from.absorption[0], to.absorption[0], t), lerp(from.absorption[1], to.absorption[1], t), lerp(from.absorption[2], to.absorption[2], t)];
  }
  return out as AuraHeightFogSpec;
}

interface FogTransition {
  readonly from: AuraHeightFogSpec;
  readonly to: AuraHeightFogSpec;
  readonly t0: number;
  readonly seconds: number;
}

export class LiveAtmosphere {
  private sky: AuraSkySpec | null = null;
  private fog: AuraHeightFogSpec | null = null;
  private wetness = 0;
  private readonly listeners = new Set<() => void>();
  private readonly skyListeners = new Set<() => void>();
  /** §6.6 fog nodes in scene order; visibility resolved against runtime handles. */
  private fogNodes: EffectNodeLike[] = [];
  private readonly fogStates = FOG_SPECS_WEAK;
  /** `effects.fogVolume` nodes → constant-density box/ellipsoid volumes. */
  private fogVolumeNodes: EffectNodeLike[] = [];
  private fogTransition: FogTransition | null = null;
  private lastFogTarget: AuraHeightFogSpec | null = null;
  private clockSeconds = 0;
  private cameraPosition: readonly [number, number, number] = [0, 0, 0];
  private cameraForward: readonly [number, number, number] = [0, 0, -1];

  /** Called by the owning system on each scene rebuild (scene order). */
  trackFogNodes(nodes: readonly EffectNodeLike[]): void {
    this.fogNodes = [...nodes];
    for (const node of this.fogNodes) {
      if (!this.fogStates.has(node as object)) {
        this.fogStates.set(node as object, { spec: specFromNode(node), visible: true });
      }
    }
  }

  /** Called by the owning system on each scene rebuild (scene order). */
  trackFogVolumes(nodes: readonly EffectNodeLike[]): void {
    this.fogVolumeNodes = [...nodes];
    for (const node of this.fogVolumeNodes) {
      if (!this.fogStates.has(node as object)) {
        this.fogStates.set(node as object, { spec: specFromNode(node), visible: true });
      }
    }
  }

  /**
   * §6.6 local fog volumes — the visible `fogVolume` nodes as {shape, center,
   * halfSize, density}. The builder authors `position`/`size`; `size` is the
   * full extent, so halfSize = size/2.
   */
  fogVolumes(): readonly { readonly shape: "box" | "ellipsoid"; readonly center: readonly [number, number, number]; readonly halfSize: readonly [number, number, number]; readonly density: number }[] {
    const out: { shape: "box" | "ellipsoid"; center: readonly [number, number, number]; halfSize: readonly [number, number, number]; density: number }[] = [];
    for (const node of this.fogVolumeNodes) {
      const state = this.fogStates.get(node as object);
      if (!state?.visible) continue;
      const n = node as unknown as Record<string, unknown>;
      const pos = (n.position ?? [0, 0, 0]) as readonly number[];
      const size = (n.size ?? n.halfSize ?? [2, 2, 2]) as readonly number[];
      const isFull = n.size !== undefined;
      out.push({
        shape: n.shape === "ellipsoid" ? "ellipsoid" : "box",
        center: [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0],
        halfSize: [(size[0] ?? 2) / (isFull ? 2 : 1), (size[1] ?? 2) / (isFull ? 2 : 1), (size[2] ?? 2) / (isFull ? 2 : 1)],
        density: typeof n.density === "number" ? n.density : 0.25
      });
    }
    return out;
  }

  /** Per-frame: refresh handle visibility for tracked fog + volume nodes. */
  updateFogVisibility(app: { readonly nodes?: { get(id: string): { visible?: boolean } | undefined } }): void {
    for (const node of [...this.fogNodes, ...this.fogVolumeNodes]) {
      const state = this.fogStates.get(node as object);
      if (!state) continue;
      const runtimeId = (node as { runtime?: { id?: string } }).runtime?.id;
      if (typeof runtimeId === "string" && app.nodes) {
        const handle = app.nodes.get(runtimeId);
        state.visible = handle?.visible !== false;
      } else {
        state.visible = true;
      }
    }
  }

  /** C-37 `handle.setFog(partial)` — merge authored fields into a tracked node's spec. */
  setNodeFog(node: EffectNodeLike, partial: Partial<AuraHeightFogSpec>): void {
    const state = this.fogStates.get(node as object);
    if (!state) return;
    state.spec = { ...state.spec, ...partial };
  }

  /** Last *visible* fog node in scene order (§6.6). */
  activeFogNode(): EffectNodeLike | null {
    for (let i = this.fogNodes.length - 1; i >= 0; i--) {
      const state = this.fogStates.get(this.fogNodes[i] as object);
      if (state?.visible) return this.fogNodes[i];
    }
    return null;
  }

  /**
   * The spec the frame should render (§6.6): when the scene declares fog
   * nodes the last *visible* one wins and all-hidden means no fog; the
   * app-level `setFog` value applies only on node-free scenes.
   */
  private fogTarget(): AuraHeightFogSpec | null {
    if (this.fogNodes.length > 0) {
      const node = this.activeFogNode();
      return node ? this.fogStates.get(node as object)?.spec ?? null : null;
    }
    return this.fog;
  }

  /**
   * Resolve the fog spec for the current frame, applying transitions:
   * density interpolates in linear space, colour in linear RGB
   * (`transitionSeconds` on the target spec or the setFog option).
   */
  resolveFog(nowSeconds = this.clockSeconds): AuraHeightFogSpec | null {
    const target = this.fogTarget();
    if (target !== this.lastFogTarget) {
      const seconds = Math.max(0, target?.transitionSeconds ?? 0);
      this.fogTransition = this.lastFogTarget && target && seconds > 0
        ? { from: this.lastFogTarget, to: target, t0: nowSeconds, seconds }
        : null;
      this.lastFogTarget = target ?? null;
    }
    if (!this.fogTransition) return target;
    const { from, to, t0, seconds } = this.fogTransition;
    const t = Math.min(Math.max((nowSeconds - t0) / seconds, 0), 1);
    if (t >= 1) {
      this.fogTransition = null;
      return to;
    }
    return interpolateFogSpec(from, to, t);
  }

  /** Frame tick — drives transition timing and visibility refresh. */
  tick(dtSeconds: number): void {
    this.clockSeconds += dtSeconds;
  }

  /** Current atmosphere clock (seconds) — transitions/animations read this. */
  clockNow(): number {
    return this.clockSeconds;
  }

  /** P4 — camera pose for `packLegacy` / `color:"sky"` (written by the prd07.fog contributor). */
  noteCamera(position: readonly [number, number, number], forward: readonly [number, number, number]): void {
    this.cameraPosition = position;
    this.cameraForward = forward;
  }

  cameraPose(): { readonly position: readonly [number, number, number]; readonly forward: readonly [number, number, number] } {
    return { position: this.cameraPosition, forward: this.cameraForward };
  }

  setFog(spec: AuraHeightFogSpec | null, o?: { transitionSeconds?: number }): void {
    this.fog = spec
      ? { ...spec, ...(o?.transitionSeconds !== undefined ? { transitionSeconds: o.transitionSeconds } : {}) }
      : null;
    this.emit();
  }

  setSky(spec: Partial<AuraSkySpec>, _o?: { transitionSeconds?: number }): void {
    this.sky = spec as AuraSkySpec;
    for (const listener of this.skyListeners) listener();
    this.emit();
  }

  /** P3-T6 — fires only when the sky spec changes (probe re-capture hook). */
  onSkyChanged(listener: () => void): () => void {
    this.skyListeners.add(listener);
    return () => this.skyListeners.delete(listener);
  }

  setWetness(value: number, _o?: { transitionSeconds?: number }): void {
    this.wetness = value;
    this.emit();
  }

  state(): AtmosphereFrameState {
    return { sky: this.sky, fog: this.fogTarget(), wetness: this.wetness };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Atmosphere diagnostics section (C-31). */
  report(): {
    background: "sky-preetham" | "sky-gradient" | "environment" | "color" | "none";
    fog: { mode: string; path: "legacy-uniforms" | "generator" | "legacy-approximation"; activeNodeId: string | null; maxOpacity: number | null };
    volumetric: { mode: "analytic" | "froxel" };
  } {
    const model = this.sky?.model;
    const active = this.activeFogNode();
    const spec = this.fogTarget();
    return {
      background:
        model === "preetham" ? "sky-preetham" :
        model === "gradient" ? "sky-gradient" :
        model === "hdri" || model === "cubemap" ? "environment" :
        model ? "color" : "none",
      fog: {
        mode: spec?.mode ?? "exp2",
        // §6.6: on the legacy path the height integral is approximated by the
        // exp-mode mapping (FOG_LEGACY_APPROXIMATION).
        path: spec?.mode === "height" ? "legacy-approximation" : "legacy-uniforms",
        activeNodeId: active ? String((active as { runtime?: { id?: string } }).runtime?.id ?? active.name ?? active.id ?? "") || null : null,
        maxOpacity: spec?.maxOpacity ?? null
      },
      volumetric: { mode: "analytic" }
    };
  }
}

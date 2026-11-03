// PRD-07 P4-T3 — per-app atmosphere state (fog / sky / wetness).
// Owns the spec-level AuraApp.atmosphere surface and the values published to
// the render source; resolution/tweening is per PRD-07 §6.6/§8.2.

import type { AuraHeightFogSpec, AuraSetFogOptions, AuraSetFogSpec, AuraSkySpec } from "../../contracts/atmosphere";
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

type AtmosphereNodeAccess = {
  readonly nodes?: {
    get(id: string): { visible?: boolean } | undefined;
    atmosphereNodeState?(node: EffectNodeLike): { readonly visible: boolean; readonly worldPosition: readonly [number, number, number] } | undefined;
  };
};

/** Scalar-only fog data copied into a renderer frame. */
export interface AtmosphereRenderFog {
  readonly mode?: "height" | "exp" | "exp2" | "linear" | "absorption";
  readonly color?: string | readonly [number, number, number];
  readonly density?: number;
  readonly heightDensity?: number;
  readonly heightFalloff?: number;
  readonly heightReference?: number;
  readonly start?: number;
  readonly maxOpacity?: number;
  readonly near?: number;
  readonly far?: number;
  readonly absorption?: readonly [number, number, number];
  readonly sunInscatter?: number;
  readonly anisotropy?: number;
  readonly ambientScale?: number;
  readonly affectsBackground?: boolean;
  readonly backgroundDistance?: number;
  readonly transitionSeconds?: number;
  readonly legacyOpacityCap?: boolean;
  readonly intensity?: number;
}

export interface AtmosphereRenderVolume {
  readonly shape: "box" | "ellipsoid";
  readonly center: readonly [number, number, number];
  readonly halfSize: readonly [number, number, number];
  readonly density: number;
}

/** Sky fields used by CPU fog-color/inscatter evaluation, with no asset references. */
export interface AtmosphereFogSky {
  readonly model?: string;
  readonly sun?: Readonly<{ elevationDeg?: number; azimuthDeg?: number; intensity?: number; discSize?: number }>;
  readonly zenith?: string | readonly [number, number, number];
  readonly horizon?: string | readonly [number, number, number];
  readonly ground?: string | readonly [number, number, number];
  readonly groundColor?: string | readonly [number, number, number];
  readonly color?: string | readonly [number, number, number];
  readonly value?: string | readonly [number, number, number];
  readonly turbidity?: number;
  readonly rayleigh?: number;
  readonly mieCoefficient?: number;
  readonly mieDirectionalG?: number;
  readonly exposure?: number;
  readonly exponent?: number;
  readonly horizonGlow?: number;
  readonly intensity?: number;
  readonly stars?: Readonly<{ count?: number; brightness?: number; density?: number; intensity?: number; enabled?: boolean; auroraBand?: boolean }>;
  readonly clouds?: Readonly<{
    scale?: number; speed?: number; coverage?: number; density?: number; elevation?: number;
    color?: string | readonly [number, number, number];
  }>;
  readonly moon?: Readonly<{
    elevationDeg?: number; azimuthDeg?: number; phase?: number; intensity?: number; size?: number;
    color?: string | readonly [number, number, number];
  }>;
  readonly bands?: readonly Readonly<{
    elevationDeg?: number;
    widthDeg?: number;
    color?: string | readonly [number, number, number];
    intensity?: number;
  }>[];
}

/**
 * A value snapshot, not a renderer capability. The owner is unique to one
 * LiveAtmosphere; renderer code must establish source provenance separately.
 */
export interface AtmosphereRenderSnapshot {
  readonly owner: object;
  readonly revision: number;
  readonly fog: AtmosphereRenderFog | null;
  readonly fogVolumes: readonly AtmosphereRenderVolume[];
  readonly skyForFog: AtmosphereFogSky | null;
  readonly wetness: {
    readonly wetness: number;
    readonly puddleThreshold: number;
    readonly rainRipples: number;
    readonly snowCover: number;
    /** Textures need a renderer-owned retention/revision lease. */
    readonly puddleNoise: null;
  };
}

const RENDER_FOG_NUMBERS = [
  "density", "heightDensity", "heightFalloff", "heightReference", "start", "maxOpacity", "near", "far",
  "sunInscatter", "anisotropy", "ambientScale", "backgroundDistance", "transitionSeconds", "intensity"
] as const;

function copyRenderVector(value: unknown): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) {
    throw new Error("PRD07_ATMOSPHERE_VECTOR_INVALID");
  }
  const x: unknown = value[0], y: unknown = value[1], z: unknown = value[2];
  if (![x, y, z].every((component) => typeof component === "number" && Number.isFinite(component))) {
    throw new Error("PRD07_ATMOSPHERE_VECTOR_INVALID");
  }
  return Object.freeze([x, y, z] as [number, number, number]);
}

/** Copy only fields consumed by the fog renderer; never retain authored arrays. */
function copyRenderFog(spec: AuraHeightFogSpec | null): AtmosphereRenderFog | null {
  if (!spec) return null;
  const input = spec as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of RENDER_FOG_NUMBERS) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("PRD07_ATMOSPHERE_NUMBER_INVALID");
    out[key] = value;
  }
  for (const key of ["affectsBackground", "legacyOpacityCap"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") throw new Error("PRD07_ATMOSPHERE_BOOLEAN_INVALID");
    out[key] = value;
  }
  const mode = input.mode;
  if (mode !== undefined) {
    if (mode !== "height" && mode !== "exp" && mode !== "exp2" && mode !== "linear" && mode !== "absorption") {
      throw new Error("PRD07_ATMOSPHERE_FOG_MODE_INVALID");
    }
    out.mode = mode;
  }
  const color = input.color;
  if (color !== undefined) {
    if (typeof color === "string") out.color = color;
    else out.color = copyRenderVector(color);
  }
  const absorption = input.absorption;
  if (absorption !== undefined) out.absorption = copyRenderVector(absorption);
  return Object.freeze(out) as AtmosphereRenderFog;
}

function copyScalarFields(input: Record<string, unknown>, keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("PRD07_ATMOSPHERE_NUMBER_INVALID");
    out[key] = value;
  }
  return out;
}

function copySkyColor(value: unknown): string | readonly [number, number, number] {
  return typeof value === "string" ? value : copyRenderVector(value);
}

/** Whitelist procedural sky inputs, never an HDRI/cubemap texture. */
function copySkyForFog(spec: AuraSkySpec | null): AtmosphereFogSky | null {
  if (!spec) return null;
  const input = spec as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = copyScalarFields(input, [
    "turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG", "exposure", "exponent", "horizonGlow", "intensity"
  ]);
  const model = input.model;
  if (model !== undefined) {
    if (typeof model !== "string") throw new Error("PRD07_ATMOSPHERE_SKY_MODEL_INVALID");
    out.model = model;
  }
  for (const key of ["zenith", "horizon", "ground", "groundColor", "color", "value"] as const) {
    const value = input[key];
    if (value !== undefined && value !== null) out[key] = copySkyColor(value);
  }
  const sun = input.sun;
  if (sun !== undefined && sun !== null) {
    if (typeof sun !== "object") throw new Error("PRD07_ATMOSPHERE_SKY_SUN_INVALID");
    out.sun = Object.freeze(copyScalarFields(sun as Record<string, unknown>, ["elevationDeg", "azimuthDeg", "intensity", "discSize"]));
  }
  for (const [key, numeric] of [
    ["stars", ["count", "brightness", "density", "intensity"]],
    ["clouds", ["scale", "speed", "coverage", "density", "elevation"]],
    ["moon", ["elevationDeg", "azimuthDeg", "phase", "intensity", "size"]]
  ] as const) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "object") throw new Error("PRD07_ATMOSPHERE_SKY_COMPONENT_INVALID");
    const fields = value as Record<string, unknown>;
    const copy: Record<string, unknown> = copyScalarFields(fields, numeric);
    const color = key === "stars" ? undefined : fields.color;
    if (color !== undefined) copy.color = copySkyColor(color);
    if (key === "stars") for (const flag of ["enabled", "auroraBand"] as const) {
      const enabled = fields[flag];
      if (enabled === undefined) continue;
      if (typeof enabled !== "boolean") throw new Error("PRD07_ATMOSPHERE_BOOLEAN_INVALID");
      copy[flag] = enabled;
    }
    out[key] = Object.freeze(copy);
  }
  const bands = input.bands;
  if (bands !== undefined && bands !== null) {
    if (!Array.isArray(bands)) throw new Error("PRD07_ATMOSPHERE_SKY_BANDS_INVALID");
    const copiedBands: Readonly<Record<string, unknown>>[] = [];
    const count = Math.min(bands.length, 4);
    for (let index = 0; index < count; index++) {
      const band: unknown = bands[index];
      if (!band || typeof band !== "object") throw new Error("PRD07_ATMOSPHERE_SKY_BAND_INVALID");
      const fields = band as Record<string, unknown>;
      const copy: Record<string, unknown> = copyScalarFields(fields, ["elevationDeg", "widthDeg", "intensity"]);
      const color = fields.color;
      if (color !== undefined) copy.color = copySkyColor(color);
      copiedBands.push(Object.freeze(copy));
    }
    out.bands = Object.freeze(copiedBands);
  }
  return Object.freeze(out) as AtmosphereFogSky;
}

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

/** GU47 phase 2: the S4 light-shaft node (`effects.volumetricFog`). */
function isVolumetricFogNode(node: EffectNodeLike): boolean {
  return (node as { readonly effect?: string }).effect === "volumetric-fog";
}

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
    else if (b !== undefined) out[key] = b;
    // GU47 phase 2: a key neither spec sets stays absent. An own `undefined` overrode the defaults that later
    // `{ ...defaults, ...spec }` merges supply, so the packed fog density turned NaN mid-transition and the frame threw.
    else delete out[key];
  }
  const ca = colorToLinear(from.color);
  const cb = colorToLinear(to.color);
  if (ca && cb) out.color = [lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)];
  else {
    const color = t < 1 ? (from.color ?? to.color) : (to.color ?? from.color);
    if (color !== undefined) out.color = color;
    else delete out.color;
  }
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
  private readonly renderListeners = new Set<() => void>();
  private readonly renderOwner: object = Object.freeze({});
  private renderRevision = 0;
  private authoredMutationRevision = 0;
  private renderFingerprint: string | null = null;
  private lastRenderSnapshot: AtmosphereRenderSnapshot | null = null;
  private renderUpdateDepth = 0;
  private renderNotificationPending = false;
  private disposed = false;
  /** §6.6 fog nodes in scene order; visibility resolved against runtime handles. */
  private fogNodes: EffectNodeLike[] = [];
  private readonly fogStates = new WeakMap<object, LiveFogState>();
  /** `effects.fogVolume` nodes → constant-density box/ellipsoid volumes. */
  private fogVolumeNodes: EffectNodeLike[] = [];
  private fogTransition: FogTransition | null = null;
  private lastFogTarget: AuraHeightFogSpec | null = null;
  /** GU47 E-B: `setFog(null, { overrideSceneFog })` hides the scene's fog nodes until the next override. */
  private sceneFogCleared = false;
  private sceneFogOverrideApplied = false;
  /** GU47 E-B: transition of the next target change when it comes from a scene-fog override. */
  private nextTransitionSeconds: number | undefined = undefined;
  private clockSeconds = 0;
  private cameraPosition: readonly [number, number, number] = [0, 0, 0];
  private cameraForward: readonly [number, number, number] = [0, 0, -1];

  /** Called by the owning system on each scene rebuild (scene order). */
  trackFogNodes(nodes: readonly EffectNodeLike[]): void {
    if (this.disposed) return;
    this.fogNodes = [...nodes];
    for (const node of this.fogNodes) {
      if (!this.fogStates.has(node as object)) {
        this.fogStates.set(node as object, { spec: specFromNode(node), visible: true });
      }
    }
    this.renderChanged();
  }

  /** Called by the owning system on each scene rebuild (scene order). */
  trackFogVolumes(nodes: readonly EffectNodeLike[]): void {
    if (this.disposed) return;
    this.fogVolumeNodes = [...nodes];
    for (const node of this.fogVolumeNodes) {
      if (!this.fogStates.has(node as object)) {
        this.fogStates.set(node as object, { spec: specFromNode(node), visible: true });
      }
    }
    this.renderChanged();
  }

  /**
   * §6.6 local fog volumes — the visible `fogVolume` nodes as {shape, center,
   * halfSize, density}. The builder authors `position`/`size`; `size` is the
   * full extent, so halfSize = size/2.
   */
  fogVolumes(app?: AtmosphereNodeAccess): readonly { readonly shape: "box" | "ellipsoid"; readonly center: readonly [number, number, number]; readonly halfSize: readonly [number, number, number]; readonly density: number }[] {
    const out: { shape: "box" | "ellipsoid"; center: readonly [number, number, number]; halfSize: readonly [number, number, number]; density: number }[] = [];
    for (const node of this.fogVolumeNodes) {
      const state = this.fogStates.get(node as object);
      if (!state?.visible) continue;
      const n = node as unknown as Record<string, unknown>;
      const runtime = app?.nodes?.atmosphereNodeState?.(node);
      if (runtime?.visible === false) continue;
      const pos = (runtime?.worldPosition ?? n.position ?? [0, 0, 0]) as readonly number[];
      const authoredSize = n.size;
      const size = (authoredSize ?? n.halfSize ?? [2, 2, 2]) as readonly number[];
      const isFull = authoredSize !== undefined;
      const density = n.density;
      out.push({
        shape: n.shape === "ellipsoid" ? "ellipsoid" : "box",
        center: [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0],
        halfSize: [(size[0] ?? 2) / (isFull ? 2 : 1), (size[1] ?? 2) / (isFull ? 2 : 1), (size[2] ?? 2) / (isFull ? 2 : 1)],
        density: typeof density === "number" ? density : 0.25
      });
    }
    return out;
  }

  /** Per-frame: refresh handle visibility for tracked fog + volume nodes. */
  updateFogVisibility(app: AtmosphereNodeAccess): void {
    if (this.disposed) return;
    let changed = false;
    for (const node of [...this.fogNodes, ...this.fogVolumeNodes]) {
      const state = this.fogStates.get(node as object);
      if (!state) continue;
      const runtimeId = (node as { runtime?: { id?: string } }).runtime?.id;
      let visible: boolean;
      const runtime = app.nodes?.atmosphereNodeState?.(node);
      if (runtime) {
        visible = runtime.visible;
      } else if (typeof runtimeId === "string" && app.nodes) {
        const handle = app.nodes.get(runtimeId);
        visible = handle?.visible !== false;
      } else {
        visible = true;
      }
      if (state.visible !== visible) { state.visible = visible; changed = true; }
    }
    if (changed) this.renderChanged();
  }

  /** C-37 `handle.setFog(partial)` — merge authored fields into a tracked node's spec. */
  setNodeFog(node: EffectNodeLike, partial: Partial<AuraHeightFogSpec>): void {
    if (this.disposed) return;
    this.authoredMutationRevision++;
    if (this.mergeNodeFog(node, partial)) this.renderChanged();
  }

  private mergeNodeFog(node: EffectNodeLike, partial: Partial<AuraHeightFogSpec>): boolean {
    const state = this.fogStates.get(node as object);
    if (!state) return false;
    state.spec = { ...state.spec, ...partial };
    return true;
  }

  /**
   * GU47 E-B: `handle.setFog(partial)` for the tracked fog node with this runtime id (its own `transitionSeconds`
   * blends the change). False when no tracked fog node carries the id.
   */
  setNodeFogByRuntimeId(runtimeId: string, partial: Partial<AuraHeightFogSpec>): boolean {
    if (this.disposed) return false;
    this.authoredMutationRevision++;
    const node = this.fogNodes.find((candidate) => (candidate as { readonly runtime?: { readonly id?: string } }).runtime?.id === runtimeId);
    if (!node) return false;
    const { transitionSeconds, ...fields } = partial;
    this.mergeNodeFog(node, fields);
    if (transitionSeconds !== undefined) this.nextTransitionSeconds = transitionSeconds;
    this.renderChanged();
    return true;
  }

  /**
   * Fog nodes that may supply the scene fog. GU47 phase 2 (haze wash): a
   * `volumetric-fog` node is the light-shaft medium; its `density` (0.06 to
   * 0.2 in the GU47 looks and receipts) is a per-metre medium the S4 god-ray
   * stage scales its shafts by (`1 - exp(-density · depth)`), not the scene's
   * distance haze. As a scene-fog node it became an uncapped exp2 forward fog
   * at that density, a flat wash past a few metres: beside an `effects.fog`
   * (density ~0.002) it replaced it when it was last (drift-and-deliver-port,
   * aura-hoops-3d, last-train, heatsink-port, ninja-runner, bunker-zero), and
   * alone it buried the god-rays receipt scene. Only plain fog nodes supply
   * the scene fog; a scene whose only fog is volumetric renders like a
   * node-free scene (no fog unless `app.atmosphere.setFog`).
   */
  private sceneFogCandidates(): readonly EffectNodeLike[] {
    return this.fogNodes.filter((node) => !isVolumetricFogNode(node));
  }

  /** Last *visible* scene-fog node in scene order (§6.6; plain fog before volumetric fog, see `sceneFogCandidates`). */
  activeFogNode(): EffectNodeLike | null {
    const candidates = this.sceneFogCandidates();
    for (let i = candidates.length - 1; i >= 0; i--) {
      const state = this.fogStates.get(candidates[i] as object);
      if (state?.visible) return candidates[i]!;
    }
    return null;
  }

  /**
   * The spec the frame should render (§6.6): when the scene declares fog
   * nodes the last *visible* one wins and all-hidden means no fog; the
   * app-level `setFog` value applies on node-free scenes, and on node scenes
   * through `overrideSceneFog` (GU47 E-B: merged into the active node's spec,
   * or `null` = the scene fog cleared until the next override).
   */
  private fogTarget(): AuraHeightFogSpec | null {
    if (this.sceneFogCandidates().length > 0) {
      if (this.sceneFogCleared) return null;
      const node = this.activeFogNode();
      return node ? this.fogStates.get(node as object)?.spec ?? null : null;
    }
    return this.fog;
  }

  /**
   * GU47 E-B: `overrideSceneFog` default — true when every scene-fog candidate is a plain `effects.fog` (GU47 phase 2:
   * volumetric-fog nodes are never candidates, so one beside an `effects.fog` no longer turns the default off).
   */
  private sceneFogIsPlainFog(): boolean {
    const candidates = this.sceneFogCandidates();
    return candidates.length > 0 && candidates.every((node) => (node as { readonly effect?: string }).effect === "fog");
  }

  /** GU47 E-B: true once `setFog` overrode the scene's fog node (or cleared it). */
  sceneFogOverridden(): boolean {
    return this.sceneFogOverrideApplied;
  }

  /**
   * Resolve the fog spec for the current frame, applying transitions:
   * density interpolates in linear space, colour in linear RGB
   * (`transitionSeconds` on the target spec or the setFog option).
   */
  resolveFog(nowSeconds = this.clockSeconds): AuraHeightFogSpec | null {
    const target = this.fogTarget();
    if (target !== this.lastFogTarget) {
      // A scene-fog override carries its own transition (setFog option), not the node's authored one.
      const seconds = Math.max(0, this.nextTransitionSeconds ?? target?.transitionSeconds ?? 0);
      this.nextTransitionSeconds = undefined;
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
    if (this.disposed) return;
    this.authoredMutationRevision++;
    this.clockSeconds += dtSeconds;
    if (dtSeconds !== 0 && this.fogTransition) this.renderChanged();
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

  setFog(spec: AuraSetFogSpec | null, o?: AuraSetFogOptions): void {
    if (this.disposed) return;
    this.authoredMutationRevision++;
    this.fog = spec
      ? { ...spec, ...(o?.transitionSeconds !== undefined ? { transitionSeconds: o.transitionSeconds } : {}) }
      : null;
    // GU47 E-B: on a scene with fog nodes, `overrideSceneFog` (default: the scene's only fog is effects.fog) merges
    // the spec into the active node's live spec (the C-37 `handle.setFog` path) or, for `null`, clears the scene fog.
    if (this.sceneFogCandidates().length > 0 && (o?.overrideSceneFog ?? this.sceneFogIsPlainFog())) {
      if (spec === null) {
        this.sceneFogCleared = true;
      } else {
        this.sceneFogCleared = false;
        const candidates = this.sceneFogCandidates();
        const node = this.activeFogNode() ?? candidates[candidates.length - 1]!;
        const { transitionSeconds: _ignored, ...fields } = spec;
        this.mergeNodeFog(node, fields);
      }
      this.sceneFogOverrideApplied = true;
      this.nextTransitionSeconds = o?.transitionSeconds ?? spec?.transitionSeconds ?? 0;
    }
    this.renderChanged();
    this.emit();
  }

  setSky(spec: Partial<AuraSkySpec>, _o?: { transitionSeconds?: number }): void {
    if (this.disposed) return;
    this.authoredMutationRevision++;
    this.sky = spec as AuraSkySpec;
    this.renderChanged();
    for (const listener of this.skyListeners) listener();
    this.emit();
  }

  /** Drops the sky (a scene whose sky node left with `setScene`); listeners fire as for `setSky`. */
  clearSky(): void {
    if (this.disposed || this.sky === null) return;
    this.authoredMutationRevision++;
    this.sky = null;
    this.renderChanged();
    for (const listener of this.skyListeners) listener();
    this.emit();
  }

  /** P3-T6 — fires only when the sky spec changes (probe re-capture hook). */
  onSkyChanged(listener: () => void): () => void {
    if (this.disposed) return () => {};
    this.skyListeners.add(listener);
    return () => this.skyListeners.delete(listener);
  }

  setWetness(value: number, _o?: { transitionSeconds?: number }): void {
    if (this.disposed) return;
    this.authoredMutationRevision++;
    this.wetness = value;
    this.renderChanged();
    this.emit();
  }

  state(): AtmosphereFrameState {
    return { sky: this.sky, fog: this.fogTarget(), wetness: this.wetness };
  }

  /** Internal ingestion guard; scene bookkeeping accounts for its own sky writes. */
  authoredMutationVersion(): number { return this.authoredMutationRevision; }

  onChange(listener: () => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Batch a scene rebuild so observers see either side, never a partial scene. */
  batchRenderUpdates<T>(update: () => T): T {
    this.renderUpdateDepth++;
    let complete = false;
    try {
      const result = update();
      complete = true;
      return result;
    }
    finally {
      this.renderUpdateDepth--;
      if (this.renderUpdateDepth === 0 && this.renderNotificationPending) {
        this.renderNotificationPending = false;
        if (complete) this.notifyRenderListeners();
      }
    }
  }

  /** Each instance owns its revision and listeners; unsubscribe is idempotent. */
  onRenderChange(listener: () => void): () => void {
    if (this.disposed) return () => {};
    this.renderListeners.add(listener);
    return () => { this.renderListeners.delete(listener); };
  }

  private renderChanged(): void {
    if (this.disposed) return;
    this.renderRevision++;
    if (this.renderUpdateDepth > 0) this.renderNotificationPending = true;
    else this.notifyRenderListeners();
  }

  private notifyRenderListeners(): void {
    for (const listener of [...this.renderListeners]) {
      try { listener(); } catch { /* One observer must not prevent other owners from invalidating. */ }
    }
  }

  /**
   * Copy frame inputs at the app clock. The sky subset is solely for fog
   * evaluation and carries no sky textures or arbitrary borrowed objects.
   */
  renderSnapshot(app?: AtmosphereNodeAccess): AtmosphereRenderSnapshot | null {
    if (this.disposed || this.renderUpdateDepth > 0) return null;
    if (!Number.isFinite(this.wetness)) throw new Error("PRD07_ATMOSPHERE_NUMBER_INVALID");
    const fog = copyRenderFog(this.resolveFog());
    const skyForFog = copySkyForFog(this.sky);
    const volumes = Object.freeze(this.fogVolumes(app).map((volume): AtmosphereRenderVolume => {
      if (!Number.isFinite(volume.density)) throw new Error("PRD07_ATMOSPHERE_NUMBER_INVALID");
      return Object.freeze({
        shape: volume.shape,
        center: copyRenderVector(volume.center),
        halfSize: copyRenderVector(volume.halfSize),
        density: volume.density
      });
    }));
    const wetness = Object.freeze({
      // The shader clamps this value; retain the public state as authored but
      // give the frame writer the equivalent bounded scalar.
      wetness: Math.max(0, Math.min(1, this.wetness)),
      puddleThreshold: 0.62, rainRipples: 0, snowCover: 0, puddleNoise: null
    });
    // These objects contain only copied primitives/arrays, so this fingerprint
    // also detects in-place edits of authored volume arrays between frames.
    const fingerprint = JSON.stringify([fog, volumes, skyForFog, wetness]);
    if (this.renderFingerprint !== null && fingerprint !== this.renderFingerprint &&
        this.lastRenderSnapshot?.revision === this.renderRevision) this.renderChanged();
    this.renderFingerprint = fingerprint;
    if (this.lastRenderSnapshot?.revision === this.renderRevision) return this.lastRenderSnapshot;
    return (this.lastRenderSnapshot = Object.freeze({ owner: this.renderOwner, revision: this.renderRevision, fog, fogVolumes: volumes, skyForFog, wetness }));
  }

  /** A copied value may outlive its source, but cannot remain current after a change/disposal. */
  isRenderSnapshotCurrent(snapshot: AtmosphereRenderSnapshot): boolean {
    return this.renderSnapshot() === snapshot;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderRevision++;
    this.lastRenderSnapshot = null;
    try { this.notifyRenderListeners(); }
    finally {
      this.renderListeners.clear();
      this.listeners.clear();
      this.skyListeners.clear();
      this.fogNodes = [];
      this.fogVolumeNodes = [];
      this.sky = null;
      this.fog = null;
      this.fogTransition = null;
      this.lastFogTarget = null;
      this.renderFingerprint = null;
      this.wetness = 0;
    }
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

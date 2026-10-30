// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEffectNode } from "../nodes/types.js";
import { AuraNodeBuilder } from "../nodes/builder.js";
import type { AuraCustomPostPass, AuraPostPassOrder } from "../../contracts/post.js";
import type { PostInsertAt } from "@aura3d/rendering/contracts";
import { AuraRuntimeError } from "../compiler/errors.js";

/**
 * Phase-3 v2 effect option fields (`vignette`, `film-grain`,
 * `chromatic-aberration`) — `AuraEffectNode` field additions are a lane-15
 * `nodes/types.ts` touch (qr-request filed); this local widening keeps the
 * factories typed until the union lands.
 */
// Exported so declaration emit can name it through the `effects` namespace
// spread in effects.composite.ts (build:raw TS4023).
export interface PostV3EffectOptions extends Omit<AuraEffectNode, "kind" | "effect"> {
  readonly smoothness?: number;
  readonly roundness?: number;
  readonly size?: number;
  readonly luminanceResponse?: number;
}

/** GU47 E-C: a per-channel grade term — a scalar applies to all three channels. */
export type AuraGradeRgb = number | readonly [number, number, number] | { readonly r: number; readonly g: number; readonly b: number };

/**
 * GU47 E-C (PRD §3.1): `colorGrade({ lut })` takes a typed `.cube` asset
 * (`aura3d assets add <file.cube> --type lut` → `assets.<name>`), i.e.
 * `AuraAssetRef<"lut">` (`AuraAssetType` includes `"lut"`). This structural
 * type accepts that typed ref as well as hand-built refs, and a plain served
 * URL string (`"/luts/venue.cube"`) is accepted too.
 */
export interface AuraLutAssetRef {
  readonly kind: "aura-asset-ref";
  readonly id: string;
  readonly type: "lut";
  readonly url: string;
  readonly format?: string;
  readonly hash?: string;
  readonly sha256?: string;
}

/**
 * GU47 E-C: `effects.colorGrade` options. `exposure`/`contrast`/`saturation`
 * as before; the HDR terms reach pixels through the S10 linear grade
 * (`post/shaders/hdrGrade.glsl.ts`): `temperature`/`tint` in [-1, 1]
 * (0 neutral, +temperature warmer, +tint magenta; 0.2 ≈ a "+20" white-balance
 * slider), `lift` (additive, default 0), `gamma`/`gain` (default 1) and the
 * `shadows`/`midtones`/`highlights` multipliers (default 1). `lut` binds a
 * `.cube` in the S10b display grade at `lutIntensity` (0..1, default 1).
 * The `AuraEffectNode` field widening is a lane E-D `nodes/types.ts` handoff;
 * this local type keeps the factory typed until it lands.
 */
export interface AuraColorGradeOptions extends Omit<AuraEffectNode, "kind" | "effect" | "shadows" | "highlights" | "lut"> {
  readonly temperature?: number;
  readonly tint?: number;
  readonly vibrance?: number;
  readonly lift?: AuraGradeRgb;
  readonly gamma?: AuraGradeRgb;
  readonly gain?: AuraGradeRgb;
  readonly shadows?: AuraGradeRgb;
  readonly midtones?: AuraGradeRgb;
  readonly highlights?: AuraGradeRgb;
  readonly lut?: AuraLutAssetRef | string;
  readonly lutIntensity?: number;
}

/** Grade fields the factory forwards verbatim when authored (the v2 bridge reads them; §7.1 allowlist). */
const COLOR_GRADE_PASS_THROUGH = ["temperature", "tint", "vibrance", "lift", "gamma", "gain", "shadows", "midtones", "highlights", "lut", "lutIntensity"] as const;

import { effects } from "../nodes/effects.composite.js";
import { shadows } from "./shadows.js";

/**
 * `effects.bloom` options: the node fields plus the v2 bright-pass `knee`
 * (0..1) and `clampLuminance` (0..64), copied onto the node when authored so
 * the v2 bridge (`mapBloomOptionsV2`) reads them (GU47 E-A handoff).
 */
type BloomBuilderOptions = Omit<AuraEffectNode, "kind" | "effect"> & { readonly knee?: number; readonly clampLuminance?: number };

export const postEffectBuilders = {
  bloom: (options: BloomBuilderOptions = {}) => {
    const antiBlowout = options.antiBlowout ?? true;
    const maxIntensity = options.maxIntensity ?? 0.92;
    const authoredIntensity = options.intensity ?? 0.35;
    const intensity = antiBlowout
      ? Math.min(maxIntensity, Math.max(0.05, authoredIntensity))
      : authoredIntensity;
    return new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "bloom",
      // GU47 pass 4 (g07, g08, g12): keep an authored name so rigs can find or replace the look's bloom.
      ...(options.name !== undefined ? { name: options.name } : {}),
      intensity,
      // §7.1: the v2 chain does not cap intensity (antiBlowout/maxIntensity
      // map to clampLuminance), so keep the authored value when capped.
      ...(intensity !== authoredIntensity && Number.isFinite(authoredIntensity) ? { postIntensity: authoredIntensity } : {}),
      color: options.color ?? "#ffffff",
      radius: options.radius ?? 0.38,
      threshold: options.threshold ?? 0.7,
      antiBlowout,
      maxIntensity,
      // CCR-03-3: authored keys, inert on the legacy bridge. Delegating
      // factories pass their own caller's list through `postAuthored`.
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored"),
      ...(options.quality !== undefined ? { quality: options.quality } : {}),
      ...(options.softKnee !== undefined ? { softKnee: options.softKnee } : {}),
      ...(options.shoulder !== undefined ? { shoulder: options.shoulder } : {}),
      ...(options.scatter !== undefined ? { scatter: options.scatter } : {}),
      ...(options.knee !== undefined ? { knee: options.knee } : {}),
      ...(options.clampLuminance !== undefined ? { clampLuminance: options.clampLuminance } : {})
    });
  },
  neonBloom: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    effects.bloom({
      intensity: options.intensity ?? 0.72,
      color: options.color ?? "#ff42c8",
      radius: options.radius ?? 0.48,
      threshold: options.threshold ?? 0.68,
      antiBlowout: options.antiBlowout ?? true,
      maxIntensity: options.maxIntensity ?? 0.92,
      postAuthored: Object.keys(options).filter((key) => key !== "postAuthored"),
      ...(options.quality !== undefined ? { quality: options.quality } : {}),
      ...(options.softKnee !== undefined ? { softKnee: options.softKnee } : {}),
      ...(options.shoulder !== undefined ? { shoulder: options.shoulder } : {})
    }),
  ambientOcclusion: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "ambient-occlusion",
      name: options.name ?? "screen space ambient occlusion grounding",
      intensity: options.intensity ?? 0.42,
      radius: options.radius ?? 0.74,
      density: options.density ?? 0.58,
      color: options.color ?? "#020617",
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored"),
      // §8.3 v2 fields (CCR-03-11): pass-through so authored values reach the bridge.
      ...(options.falloff !== undefined ? { falloff: options.falloff } : {}),
      ...(options.multiBounce !== undefined ? { multiBounce: options.multiBounce } : {})
    }),
  contactOcclusion: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "contact-occlusion",
      name: options.name ?? "contact occlusion grounding",
      intensity: options.intensity ?? 0.36,
      radius: options.radius ?? 0.52,
      density: options.density ?? 0.7,
      color: options.color ?? "#020617",
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored"),
      ...(options.falloff !== undefined ? { falloff: options.falloff } : {}),
      ...(options.multiBounce !== undefined ? { multiBounce: options.multiBounce } : {})
    }),
  /**
   * Root color-grade node (muse3jsparity-PRD A3). contrast/saturation run in
   * the fused present; GU47 E-C: temperature/tint/lift/gamma/gain/shadows/
   * midtones/highlights run in the S10 linear grade and `lut` (a `.cube`
   * asset or URL) in the S10b display grade on the v2 chain.
   */
  colorGrade: (options: AuraColorGradeOptions = {}) => {
    const fields = options as unknown as Record<string, unknown>;
    const passThrough: Record<string, unknown> = {};
    for (const key of COLOR_GRADE_PASS_THROUGH) {
      if (fields[key] !== undefined) passThrough[key] = fields[key];
    }
    return new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "color-grade",
      name: options.name ?? "color grade",
      intensity: options.intensity ?? 1,
      exposure: options.exposure ?? 1,
      contrast: options.contrast ?? 1,
      saturation: options.saturation ?? 1,
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored"),
      ...passThrough
    } as unknown as AuraEffectNode);
  },
  /**
   * Root anti-alias node (muse3jsparity-PRD A3). `fxaa` executes natively;
   * `off` submits nothing; `taa` uses renderer-owned velocity/history for opaque
   * rigid triangles. Unsupported deforming/transparent geometry emits a named warning.
   */
  antiAlias: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "anti-alias",
      name: options.name ?? "anti alias",
      mode: options.mode ?? "fxaa",
      intensity: options.intensity ?? 1,
      // `postAuthored` — not `mode` — carries the authored/default split: the
      // factory keeps its legacy `mode ?? "fxaa"` fill, so the bridge reads
      // `postAuthored` for "mode actually authored" (absent → `auto`).
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored")
    }),
  /**
   * PRD-03 §6.9/§8.12 (Phase 3): display vignette — S10b `DISPLAY_GRADE`.
   * `color` accepts "#rrggbb" or [r,g,b]; the bridge maps to `vignette`.
   * (AuraEffectType/AuraEffectNode field extension is lane-15-owned —
   * qr-request pending; the literals cast until it lands.)
   */
  vignette: (options: PostV3EffectOptions = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "vignette",
      name: options.name ?? "vignette",
      intensity: options.intensity ?? 0.3,
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored"),
      ...(options.smoothness !== undefined ? { smoothness: options.smoothness } : {}),
      ...(options.roundness !== undefined ? { roundness: options.roundness } : {}),
      ...(options.color !== undefined ? { color: options.color } : {})
    } as unknown as AuraEffectNode),
  /** Phase 3: S12 film grain (size in px, luminanceResponse modulates the lerp). */
  filmGrain: (options: PostV3EffectOptions = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "film-grain",
      name: options.name ?? "film grain",
      intensity: options.intensity ?? 0.05,
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored"),
      ...(options.size !== undefined ? { size: options.size } : {}),
      ...(options.luminanceResponse !== undefined ? { luminanceResponse: options.luminanceResponse } : {})
    } as unknown as AuraEffectNode),
  /** Phase 3: §8.12 radial chromatic aberration on the HDR composite (S10). */
  chromaticAberration: (options: PostV3EffectOptions = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "chromatic-aberration",
      name: options.name ?? "chromatic aberration",
      intensity: options.intensity ?? 0.0015,
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored")
    } as unknown as AuraEffectNode),

  /**
   * threejs-parity SH-03 (L1): three-style custom fullscreen shader pass.
   * Returns a frozen `AuraCustomPostPass` for `app.post.addPostPass(...)` —
   * the frozen `AuraEffectType` union has no shader-pass kind, so the factory
   * emits the contract object directly rather than an effect node.
   *
   * `options.fragment`/`options.glsl` accept the fragment GLSL (required —
   * the live post graph is GLSL-first); `options.wgsl` is the optional WebGPU
   * stage. `insertAt` defaults from a named `order` slot ("before-bloom" →
   * "after-taa", "after-bloom"/"before-tonemap" → "before-tonemap",
   * "after-tonemap" → "after-tonemap", number → "before-tonemap").
   */
  shaderPass: (options: AuraShaderPassOptions): AuraCustomPostPass => {
    if (typeof options !== "object" || options === null) {
      throw new AuraRuntimeError("invalid-material-spec", "effects.shaderPass requires an options object");
    }
    const glsl = options.glsl ?? options.fragment?.glsl;
    if (typeof glsl !== "string" || !glsl.trim()) {
      throw new AuraRuntimeError("invalid-material-spec", "effects.shaderPass requires GLSL fragment source (`glsl` or `fragment.glsl`)");
    }
    const wgsl = options.wgsl ?? options.fragment?.wgsl;
    if (wgsl !== undefined && (typeof wgsl !== "string" || !wgsl.trim())) {
      throw new AuraRuntimeError("invalid-material-spec", "effects.shaderPass `wgsl` must be a non-empty string when provided");
    }
    const order = options.order;
    if (order !== undefined && typeof order !== "number" && !["before-bloom", "after-bloom", "before-tonemap", "after-tonemap"].includes(order)) {
      throw new AuraRuntimeError("invalid-material-spec", `effects.shaderPass order ${String(order)} is not a named slot or number`);
    }
    if (typeof order === "number" && !Number.isFinite(order)) {
      throw new AuraRuntimeError("invalid-material-spec", "effects.shaderPass numeric order must be finite");
    }
    const insertAt = options.insertAt ?? (
      order === "before-bloom" ? "after-taa"
        : order === "after-bloom" || order === "before-tonemap" || typeof order === "number" ? "before-tonemap"
          : order === "after-tonemap" ? "after-tonemap"
            : "before-tonemap"
    );
    if (!["after-depth", "before-taa", "after-taa", "before-tonemap", "after-tonemap"].includes(insertAt)) {
      throw new AuraRuntimeError("invalid-material-spec", `effects.shaderPass insertAt ${String(insertAt)} is not a v2 anchor`);
    }
    const uniforms = options.uniforms;
    if (uniforms !== undefined) {
      if (typeof uniforms !== "object" || uniforms === null) {
        throw new AuraRuntimeError("invalid-material-spec", "effects.shaderPass uniforms must be a record of number|number[] values");
      }
      for (const [key, value] of Object.entries(uniforms)) {
        const ok = typeof value === "number" ? Number.isFinite(value)
          : Array.isArray(value) && value.length > 0 && value.length <= 4 && value.every(Number.isFinite);
        if (!ok) {
          throw new AuraRuntimeError("invalid-material-spec", `effects.shaderPass uniform "${key}" must be a finite number or 1–4 number array`);
        }
      }
    }
    const inputs = options.inputs ?? ["color"];
    for (const input of inputs) {
      if (!["color", "depth", "velocity"].includes(input)) {
        throw new AuraRuntimeError("invalid-material-spec", `effects.shaderPass input ${String(input)} is not color|depth|velocity`);
      }
    }
    return {
      name: options.name ?? `shader-pass-${customShaderPassSequence++}`,
      insertAt,
      fragment: { glsl, ...(wgsl !== undefined ? { wgsl } : {}) },
      ...(uniforms ? { uniforms } : {}),
      ...(options.inputs ? { inputs } : {}),
      ...(order !== undefined ? { order } : {}),
      ...(options.enabled !== undefined ? { enabled: options.enabled } : {})
    };
  },
};

let customShaderPassSequence = 0;

/** SH-03 `effects.shaderPass` options — mirrors `AuraCustomPostPass` with friendlier source shorthands. */
export interface AuraShaderPassOptions {
  readonly name?: string;
  /** Fragment GLSL shorthand (same as `fragment.glsl`). */
  readonly glsl?: string;
  /** WGSL fragment shorthand (same as `fragment.wgsl`). */
  readonly wgsl?: string;
  readonly fragment?: { readonly glsl?: string; readonly wgsl?: string };
  /** Numeric pass uniforms, bound by name at draw time. */
  readonly uniforms?: Readonly<Record<string, number | readonly number[]>>;
  readonly inputs?: readonly ("color" | "depth" | "velocity")[];
  /** v2 anchor — defaults from a named `order` slot when omitted. */
  readonly insertAt?: PostInsertAt;
  readonly order?: AuraPostPassOrder;
  /** `false` keeps the pass registered but skips execution. */
  readonly enabled?: boolean;
}

// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEffectNode, AuraVec3 } from "../nodes/types.js";
import { AuraNodeBuilder } from "../nodes/builder.js";
import { effects } from "../nodes/effects.composite.js";
import { createBeamDescriptor, resolveFlipbookUv } from "@aura3d/rendering";
import { particles } from "./particles.js";
import { lazyNamespace } from "../lazyNamespace.js";


export const vfxEffectBuilders = lazyNamespace(() => ({
  fog: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "fog",
      density: options.density ?? 0.12,
      color: options.color ?? "#9fb7d9",
      intensity: options.intensity
    }),
  cinematicBloom: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    effects.bloom({
      intensity: options.intensity ?? 0.58,
      color: options.color ?? "#7dfcff",
      radius: options.radius ?? 0.42,
      threshold: options.threshold ?? 0.72,
      antiBlowout: options.antiBlowout ?? true,
      maxIntensity: options.maxIntensity ?? 0.92,
      ...(options.quality !== undefined ? { quality: options.quality } : {}),
      ...(options.softKnee !== undefined ? { softKnee: options.softKnee } : {}),
      ...(options.shoulder !== undefined ? { shoulder: options.shoulder } : {})
    }),
  /**
   * A5 volumetric fog (muse3jsparity-PRD): builds a DISTINCT "volumetric-fog"
   * node (never plain fog) that submits the depth-aware inscatter pass plus
   * forward GPU height-fog terms. quality "off" keeps forward exp2 fog only.
   */
  volumetricFog: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "volumetric-fog",
      name: options.name ?? "volumetric fog inscatter",
      density: options.density ?? 0.18,
      color: options.color ?? "#6f84b9",
      intensity: options.intensity ?? 0.7,
      ...(options.volumetricQuality ? { volumetricQuality: options.volumetricQuality } : {}),
      ...(options.lightPosition ? { lightPosition: options.lightPosition } : {}),
      ...(options.heightFalloff !== undefined ? { heightFalloff: options.heightFalloff } : {}),
      ...(options.heightReference !== undefined ? { heightReference: options.heightReference } : {})
    }),
  depthFog: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    effects.fog({
      density: options.density ?? 0.14,
      color: options.color ?? "#7aa2d6",
      intensity: options.intensity ?? 0.62
    }),
  /**
   * Root outline node (muse3jsparity-PRD A3): native outline pass, width in
   * pixels clamped to the device range 1-6 by the bridge.
   */
  outline: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "outline",
      name: options.name ?? "outline",
      color: options.color ?? "#ff9822",
      width: options.width ?? 3,
      threshold: options.threshold ?? 0.12,
      intensity: options.intensity ?? 0.9
    }),
  /**
   * Root screen-space reflections node (muse3jsparity-PRD A3): submits the
   * native SSR pass against renderer-owned depth where available.
   */
  screenSpaceReflections: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "screen-space-reflections",
      name: options.name ?? "screen space reflections",
      intensity: options.intensity ?? 0.9
    }),
  /**
   * Root depth-of-field node (muse3jsparity-PRD A3). focus is a
   * linear-distance fraction (0 = near plane, 1 = far plane); aperture widens
   * the focus transition band (game-tuned control, not a physical f-stop).
   */
  depthOfField: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "depth-of-field",
      name: options.name ?? "depth of field",
      focus: options.focus ?? 0.02,
      aperture: options.aperture ?? 0.35,
      maxBlur: options.maxBlur ?? 4,
      intensity: options.intensity ?? 1
    }),
  /**
   * Root motion-blur node: renderer-owned GPU velocity for opaque rigid geometry.
   * Unsupported deforming/transparent/instanced geometry emits a named warning.
   */
  motionBlur: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "motion-blur",
      name: options.name ?? "motion blur",
      intensity: options.intensity ?? 0.5
    }),
  rain: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "rain",
      intensity: options.intensity ?? 0.4,
      density: options.density ?? 0.72,
      color: options.color ?? "#bcd7ff",
      speed: options.speed ?? 1,
      wind: options.wind ?? [-0.32, -5.4, -0.16],
      particleCount: options.particleCount,
      splashes: options.splashes ?? true,
      mist: options.mist ?? true
    }),
  snow: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "snow",
      intensity: options.intensity ?? 0.4,
      density: options.density ?? 0.68,
      color: options.color ?? "#e8f1ff",
      speed: options.speed ?? 1,
      wind: options.wind ?? [-0.85, -1.1, -0.22],
      particleCount: options.particleCount,
      splashes: options.splashes ?? false,
      mist: options.mist ?? true
    }),
  /**
   * Flipbook explosion/muzzle-flash sprite sheet (muse3jsparity-PRD D4):
   * recorded with validated sheet geometry, but withheld — root has no
   * native sprite-sheet sampler yet, so no pass is submitted.
   */
  flipbook: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) => {
    const columns = options.spriteColumns ?? 4;
    const rows = options.spriteRows ?? 4;
    resolveFlipbookUv(0, columns, rows);
    return new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "flipbook-sprite",
      name: options.name ?? "flipbook explosion sprite",
      intensity: options.intensity ?? 1,
      color: options.color ?? "#ffb347",
      spriteColumns: columns,
      spriteRows: rows,
      frameRate: options.frameRate ?? 24
    });
  },
  /**
   * Additive thick light beam / fence strip (muse3jsparity-PRD D4): recorded
   * with a validated quad-strip descriptor, but withheld — root has no native
   * beam target yet, so no pass is submitted.
   */
  beam: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) => {
    const descriptor = createBeamDescriptor({
      from: options.from ?? [0, 1, 0],
      to: options.to ?? [0, 1, -4],
      ...(options.widthWorld !== undefined ? { widthWorld: options.widthWorld } : {}),
      ...(options.segmentCount !== undefined ? { segmentCount: options.segmentCount } : {})
    });
    return new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "light-beam",
      name: options.name ?? "additive light beam",
      intensity: options.intensity ?? 0.9,
      color: options.color ?? "#9fd8ff",
      from: [...descriptor.from] as AuraVec3,
      to: [...descriptor.to] as AuraVec3,
      widthWorld: descriptor.widthWorld,
      segmentCount: descriptor.segmentCount
    });
  },
  particles: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
	    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "particles",
      name: options.name ?? `${options.emitter ?? "swirl"} particle system`,
      intensity: options.intensity ?? 0.8,
      density: options.density ?? 1,
      color: options.color ?? "#7dfcff",
      speed: options.speed ?? 1,
      particleCount: options.particleCount ?? 2400,
	      emitter: options.emitter ?? "swirl",
	      radius: options.radius ?? 1.15,
	      height: options.height ?? 2.4,
	      emissionRate: options.emissionRate,
	      gravity: options.gravity,
	      groundCollision: options.groundCollision,
	      lifetimeColorRamp: options.lifetimeColorRamp,
	      materialMode: options.materialMode ?? (options.emitter === "fountain" ? "additive-glow" : "soft-alpha"),
	      texturedBillboard: options.texturedBillboard ?? true,
	      sizeOverLife: options.sizeOverLife ?? [0.35, 1, 0.58],
	      alphaOverLife: options.alphaOverLife ?? [0, 0.92, 0],
	      velocityOverLife: options.velocityOverLife ?? [1, 0.82, 0.28],
	      turbulence: options.turbulence ?? 0.16,
	      noise: options.noise ?? 0.22
	    }),
}));

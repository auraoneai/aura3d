// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraColor, AuraAssetRef, AuraAnimationSpec, AuraSceneNode, AuraSolarSystemPrefabOptions, AuraNeonTunnelOptions, AuraPrimitiveHumanoidPrefabOptions, AuraDataBars3DPrefabOptions, AuraProductStageStyle, AuraProductViewerOptions } from "../types.js";
import { animation } from "../animation.js";
import { camera } from "../camera.js";
import { chartThemePalette, dataBarColor } from "../charts.js";
import { cityBlock } from "./cityBlock.js";
import { createLowPolyHumanoid } from "../character.js";
import { effects } from "../effects.composite.js";
import { interactions } from "../interactions.js";
import { labels } from "../labels.js";
import { lights } from "../lights.js";
import { material } from "../material.js";
import { mix3 } from "../../compiler/sceneMath.js";
import { model } from "../model.js";
import { neonPalette, neon } from "../neon.js";
import { normalizeAuraVec3 } from "../games.js";
import { particles } from "../particles.js";
import { physics } from "../physics.js";
import { primitives } from "../primitives.js";
import { productPlacement, product } from "../product.js";
import { scene } from "../scene.js";
import { seededRange } from "../../compiler/effects.js";
import { shadows } from "../shadows.js";
import { solarPlanetMaterial, solar } from "../solar.js";
import { water } from "../water.js";

export const MINI_GOLF_LAYOUT = {
  ballStart: [-1.42, 0.16, 0.58] as AuraVec3,
  cupCenter: [1.55, 0.16, -1.18] as AuraVec3,
  obstacleCenter: [0.22, 0.28, -0.48] as AuraVec3,
  aimVector: [1, 0, -0.55] as AuraVec3
} as const;

interface AuraMiniGolfPrefabOptions {
  readonly ballPosition?: AuraVec3;
  readonly shots?: number;
  readonly score?: number;
  readonly collisions?: number;
  readonly contacts?: number;
  readonly cupTriggered?: boolean;
  readonly aimVector?: AuraVec3;
}

export const prefabs = {
  particleFountain: (options: { readonly color?: AuraColor; readonly count?: number; readonly emissionRate?: number } = {}): readonly AuraSceneNode[] => {
    // Cap at 2400 (the advertised fountain maximum); the WebGL and 2D fallback renderers clamp fountain layers to the same 2400 so the scene JSON never claims more particles than render.
    const count = Math.min(2400, Math.max(320, options.count ?? 420));
    const emissionRate = options.emissionRate ?? 120;
    const splashCount = Math.round(count * 0.48);
    const mistCount = Math.round(count * 0.36);
    return [
      primitives.plane({ name: "large grid particle collision ground plane", material: material.pbr({ color: "#101822", roughness: 0.82, metallic: 0.02 }) }).position(0, -0.02, 0).scale([7, 1, 7]).toJSON(),
      primitives.torus({ name: "painted particle collision splash ring", material: material.pbr({ color: "#174456", roughness: 0.48, metallic: 0.06 }) }).position(0, 0.37, 0).rotate(1.5708, 0, 0).scale([0.72, 0.72, 0.028]).toJSON(),
      primitives.cylinder({ name: "literal nozzle particle emitter cone", material: material.metal({ color: "#1d2f3f", roughness: 0.2, metallic: 0.38 }) }).position(0, 0.4, 0).scale([0.18, 0.28, 0.18]).toJSON(),
      primitives.box({ name: "real emission rate slider track", material: material.pbr({ color: "#334155", roughness: 0.72, metallic: 0.04 }) }).position(-1.8, 0.5, 0).scale([0.8, 0.04, 0.06]).toJSON(),
      primitives.sphere({ name: "real emission rate slider knob high", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", emissiveIntensity: 0.42 }) }).position(-1.4, 0.5, 0).scale(0.04).toJSON(),
      primitives.box({ name: "hot young particle color swatch", material: material.emissive({ color: "#fff7ad", emissive: "#fff7ad", emissiveIntensity: 0.28 }) }).position(1.4, 0.52, 0).scale([0.12, 0.12, 0.02]).toJSON(),
      primitives.box({ name: "warm falling particle color swatch", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", emissiveIntensity: 0.28 }) }).position(1.6, 0.52, 0).scale([0.12, 0.12, 0.02]).toJSON(),
      primitives.box({ name: "cool old particle color swatch", material: material.emissive({ color: "#60a5fa", emissive: "#60a5fa", emissiveIntensity: 0.28 }) }).position(1.8, 0.52, 0).scale([0.12, 0.12, 0.02]).toJSON(),
      effects.particles({ name: "narrow upward lifetime colored gravity fountain plume", emitter: "fountain", color: options.color ?? "#60a5fa", particleCount: count, radius: 1.04, height: 3.05, intensity: 0.72, speed: 0.72, emissionRate, gravity: 9.8, groundCollision: true, lifetimeColorRamp: ["#fff7ad", "#fef08a", "#fb923c", "#60a5fa", "#38bdf8", "#fb7185"], materialMode: "splash", texturedBillboard: false, sizeOverLife: [0.82, 1.18, 0.8], alphaOverLife: [0.52, 0.82, 0.54], turbulence: 0.004, noise: 0.004, splashes: true, mist: false }).toJSON(),
      effects.particles({ name: "falling collision splash particle band", emitter: "fountain", color: "#bae6fd", particleCount: splashCount, radius: 1.9, height: 0.42, intensity: 0.58, speed: 0.66, emissionRate: Math.round(emissionRate * 0.32), gravity: 9.8, groundCollision: true, lifetimeColorRamp: ["#60a5fa", "#38bdf8", "#fb923c", "#fb7185", "#fff7ad", "#fef08a"], materialMode: "splash", texturedBillboard: false, sizeOverLife: [0.72, 1.02, 0.68], alphaOverLife: [0.38, 0.68, 0.34], turbulence: 0.006, noise: 0.006, splashes: true, mist: false }).toJSON(),
      effects.particles({ name: "older blue mist particles after ground collision", emitter: "swirl", color: "#60a5fa", particleCount: mistCount, radius: 2.2, height: 0.55, intensity: 0.42, speed: 0.32, emissionRate: Math.round(emissionRate * 0.24), gravity: 9.8, groundCollision: true, lifetimeColorRamp: ["#38bdf8", "#60a5fa", "#94a3b8"], materialMode: "soft-alpha", texturedBillboard: false, sizeOverLife: [0.48, 0.82, 0.42], alphaOverLife: [0.22, 0.48, 0.18], turbulence: 0.008, noise: 0.008, splashes: false, mist: true }).toJSON(),
      effects.bloom({ intensity: 0.035, color: options.color ?? "#bae6fd", threshold: 0.96, radius: 0.08, maxIntensity: 0.08 }).toJSON()
    ];
  },
  cityBlock,


  materialSwatches: (): readonly AuraSceneNode[] => [
    primitives.box({ name: "matte studio floor for material comparison", material: material.pbr({ color: "#687382", roughness: 0.56, metallic: 0.04 }) }).position(0, -0.03, -0.72).scale([8.1, 0.14, 2.35]).toJSON(),
    primitives.box({ name: "split material reflection wall", material: material.pbr({ color: "#334155", roughness: 0.38, metallic: 0.05, opacity: 0.58 }) }).position(0, 1.08, -1.82).scale([8.1, 2.0, 0.08]).toJSON(),
    primitives.box({ name: "white softbox reflection strip", material: material.emissive({ color: "#f8fbff", emissive: "#f8fbff", emissiveIntensity: 0.72, opacity: 0.68 }) }).position(0, 2.26, -1.72).scale([4.9, 0.1, 0.06]).toJSON(),
    primitives.box({ name: "black reflection contrast strip", material: material.pbr({ color: "#05070d", roughness: 0.18, metallic: 0.24 }) }).position(0, 1.78, -1.69).scale([6.1, 0.12, 0.08]).toJSON(),
    primitives.box({ name: "cool blue environment reflection panel", material: material.emissive({ color: "#77e6ff", emissive: "#77e6ff" }) }).position(-3.55, 1.12, -1.24).rotate(0, 0.16, 0).scale([0.08, 1.18, 1.38]).toJSON(),
    primitives.box({ name: "warm gold environment reflection panel", material: material.emissive({ color: "#ffd18a", emissive: "#ffd18a" }) }).position(3.55, 1.12, -1.24).rotate(0, -0.16, 0).scale([0.08, 1.18, 1.38]).toJSON(),
    primitives.box({ name: "chrome bright reflection card", material: material.emissive({ color: "#f8fbff", emissive: "#f8fbff" }) }).position(-2.8, 1.55, -0.14).rotate(0, 0.06, -0.18).scale([0.76, 0.05, 0.06]).toJSON(),
    primitives.box({ name: "chrome dark reflection card", material: material.pbr({ color: "#030712", roughness: 0.12, metallic: 0.25 }) }).position(-2.8, 1.32, -0.12).rotate(0, 0.06, -0.18).scale([0.62, 0.045, 0.06]).toJSON(),
    primitives.sphere({ name: "mirror chrome metal swatch", material: material.chrome({ color: "#f4fbff", roughness: 0.018, clearcoat: 0.18, envMapIntensity: 2 }) }).position(-2.8, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "transparent cyan glass swatch", material: material.clearGlass({ color: "#95eaff", opacity: 0.22, transmission: 1, thickness: 0.9, attenuationDistance: 0.68 }) }).position(-1.4, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "matte charcoal rubber swatch", material: material.blackRubber({ color: "#171a22", roughness: 0.99 }) }).position(0, 0.9, -0.72).scale(1.1).toJSON(),
	    primitives.sphere({ name: "emissive magenta swatch", material: material.glowingEmissive({ color: "#ff42c8", emissive: "#ff42c8", emissiveIntensity: 2.35, roughness: 0.08 }) }).position(1.4, 0.9, -0.72).scale(1.1).toJSON(),
	    primitives.sphere({ name: "large emissive magenta glow halo", material: material.emissive({ color: "#7a0f5c", emissive: "#ff42c8", emissiveIntensity: 0.72, opacity: 0.22 }) }).position(1.4, 0.9, -0.84).scale([1.56, 1.56, 0.04]).toJSON(),
	    primitives.box({ name: "emissive glow spill on lab floor", material: material.emissive({ color: "#ff42c8", emissive: "#ff42c8", emissiveIntensity: 0.42, opacity: 0.18 }) }).position(1.4, 0.07, -0.05).scale([1.24, 0.026, 0.34]).toJSON(),
    primitives.sphere({ name: "red automotive clearcoat swatch", material: material.clearcoatPaint({ color: "#ef233c", roughness: 0.045, clearcoat: 1, clearcoatRoughness: 0.018, envMapIntensity: 1.55 }) }).position(2.8, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "transparent clearcoat outer gloss layer", material: material.clearcoat({ color: "#ffffff", opacity: 0.16, roughness: 0.015, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 2.0 }) }).position(2.8, 0.9, -0.72).scale(1.15).toJSON(),
    primitives.box({ name: "clearcoat white topcoat highlight", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(2.72, 1.34, -0.13).rotate(0, -0.1, -0.22).scale([0.72, 0.055, 0.05]).toJSON(),
    primitives.box({ name: "clearcoat amber base reflection", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(2.94, 1.12, -0.14).rotate(0, -0.1, -0.22).scale([0.48, 0.04, 0.045]).toJSON(),
    primitives.box({ name: "metal label plinth", material: material.emissive({ color: "#dff4ff", emissive: "#dff4ff" }) }).position(-2.8, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "glass label plinth", material: material.emissive({ color: "#7dd3fc", emissive: "#7dd3fc" }) }).position(-1.4, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "rubber label plinth", material: material.emissive({ color: "#475569", emissive: "#475569" }) }).position(0, 0.18, 0.38).scale([1.0, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "emissive label plinth", material: material.emissive({ color: "#ff42c8", emissive: "#ff42c8" }) }).position(1.4, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "clearcoat label plinth", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(2.8, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    labels.anchor("Metal", "mirror chrome metal swatch", { name: "metal collision-avoiding material label", position: [-2.8, 0.42, 0.42], size: 0.19, collisionAvoidance: true, occlusionAware: true }).toJSON(),
    labels.anchor("Glass", "transparent cyan glass swatch", { name: "glass collision-avoiding material label", position: [-1.4, 0.42, 0.42], size: 0.19, collisionAvoidance: true, occlusionAware: true }).toJSON(),
    labels.anchor("Rubber", "matte charcoal rubber swatch", { name: "rubber collision-avoiding material label", position: [0, 0.42, 0.42], size: 0.19, collisionAvoidance: true, occlusionAware: true }).toJSON(),
    labels.anchor("Emissive", "emissive magenta swatch", { name: "emissive collision-avoiding material label", position: [1.4, 0.42, 0.42], size: 0.15, collisionAvoidance: true, occlusionAware: true }).toJSON(),
    labels.anchor("Clearcoat", "red automotive clearcoat swatch", { name: "clearcoat collision-avoiding material label", position: [2.8, 0.42, 0.42], size: 0.15, collisionAvoidance: true, occlusionAware: true }).toJSON(),
    primitives.box({ name: "glass white contrast card", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(-1.55, 0.9, -1.5).scale([0.42, 0.58, 0.04]).toJSON(),
    primitives.box({ name: "glass dark contrast card", material: material.pbr({ color: "#020617", roughness: 0.26, metallic: 0.12 }) }).position(-1.18, 0.9, -1.5).scale([0.42, 0.58, 0.04]).toJSON(),
    primitives.box({ name: "glass refracted white stripe", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(-1.42, 1.2, -1.47).scale([0.06, 0.88, 0.035]).toJSON(),
    primitives.box({ name: "glass refracted dark stripe", material: material.pbr({ color: "#05070d", roughness: 0.22, metallic: 0.1 }) }).position(-1.31, 0.9, -1.46).scale([0.06, 0.7, 0.035]).toJSON(),
    primitives.box({ name: "rubber roughness sample strip", material: material.pbr({ color: "#334155", roughness: 1, metallic: 0 }) }).position(-0.18, 1.38, -0.12).rotate(0, 0.02, 0.2).scale([0.42, 0.035, 0.04]).toJSON(),
    primitives.box({ name: "rubber diffuse edge strip", material: material.pbr({ color: "#0b0f16", roughness: 1, metallic: 0 }) }).position(0.2, 1.18, -0.11).rotate(0, -0.02, -0.18).scale([0.34, 0.032, 0.04]).toJSON(),
	    effects.bloom({ intensity: 0.18, color: "#ff42c8", threshold: 0.86, radius: 0.22, maxIntensity: 0.24 }).toJSON()
	  ],

	  productStage: (options: { readonly style?: AuraProductStageStyle; readonly showStudioRig?: boolean } = {}): readonly AuraSceneNode[] => {
	    const style = options.style ?? "hero-clean";
	    const inspection = style === "inspection";
	    const showStudioRig = options.showStudioRig ?? inspection;
	    const floorMaterial = material.pbr({ color: style === "clean" ? "#e8edf3" : "#f2f5f8", roughness: 0.68, metallic: 0.01 });
	    const backdropMaterial = material.pbr({ color: style === "clean" ? "#f5f7fa" : "#f8fafc", roughness: 0.72, metallic: 0.01 });
	    const plinthMaterial = material.clearcoat({ color: "#f8fafc", roughness: 0.24, clearcoat: 0.42, envMapIntensity: 0.85 });
	    const shadowMaterial = material.pbr({ color: "#020617", roughness: 0.96, metallic: 0.01, opacity: 0.32 });
	    const rimMaterial = material.emissive({ color: "#dbeafe", emissive: "#93c5fd", emissiveIntensity: 0.18, opacity: 0.42 });
    const nodes: AuraSceneNode[] = [
      primitives.plane({ name: "seamless matte product hero floor", material: floorMaterial }).position(0, -0.018, -0.62).scale([3.6, 1, 2.6]).toJSON(),
      primitives.plane({ name: "vertical seamless product photography backdrop", material: backdropMaterial }).position(0, 1.22, -2.28).rotate(1.5708, 0, 0).scale([6.2, 1, 2.15]).toJSON(),
      primitives.box({ name: "cool cyan studio reflection panel", material: material.emissive({ color: "#20bfe8", emissive: "#20bfe8", emissiveIntensity: 0.46 }) }).position(-2.35, 1.14, -2.18).scale([0.24, 1.38, 0.035]).toJSON(),
      primitives.box({ name: "warm amber studio reflection panel", material: material.emissive({ color: "#f0a43c", emissive: "#f0a43c", emissiveIntensity: 0.42 }) }).position(2.35, 1.14, -2.18).scale([0.24, 1.38, 0.035]).toJSON(),
      primitives.cylinder({ name: "low matte hero product plinth", material: plinthMaterial }).position(0, 0.255, -0.65).scale([1.46, 0.26, 1.46]).toJSON(),
      primitives.cylinder({ name: "soft product contact shadow from footprint", material: shadowMaterial }).position(0, 0.292, -0.65).scale([1.06, 0.01, 0.66]).toJSON(),
      primitives.box({ name: "subtle turntable orbit cue on product plinth", material: material.emissive({ color: "#93c5fd", emissive: "#38bdf8", emissiveIntensity: 0.22, opacity: 0.38 }) }).position(0, 0.52, -0.65).scale([1.02, 0.012, 1.02]).toJSON(),
      lights.rect({ name: "off camera product key softbox sneaker mesh grazing light", position: [-2.4, 2.25, 2.25], intensity: 0.9, width: 3.2, height: 1.55, color: "#ffffff" }).toJSON(),
      lights.rect({ name: "off camera cool reflection card fill softbox lace detail pin highlight", position: [2.4, 1.75, 1.85], intensity: 0.44, width: 2.6, height: 1.25, color: "#dbeafe" }).toJSON(),
      lights.rect({ name: "rear warm reflection card rim softbox rubber sole edge kicker", position: [0, 1.85, -2.85], intensity: 0.72, width: 3.4, height: 0.9, color: "#c7d2fe" }).toJSON(),
      effects.contactOcclusion({ intensity: 0.24, radius: 0.62 }).toJSON()
    ];
	    if (showStudioRig) {
	      const guideMaterial = material.pbr({ color: "#e2e8f0", roughness: 0.82, metallic: 0.01, opacity: 0.28 });
	      nodes.push(
	        primitives.plane({ name: "inspection only left softbox card", material: guideMaterial }).position(-1.95, 1.18, -0.18).rotate(0, 0.34, 0).scale([0.72, 1, 0.46]).toJSON(),
	        primitives.plane({ name: "inspection only right softbox card", material: guideMaterial }).position(1.95, 1.08, -0.28).rotate(0, -0.34, 0).scale([0.66, 1, 0.42]).toJSON(),
	        primitives.box({ name: "inspection only product bounds tick", material: rimMaterial }).position(0, 0.72, 0.16).scale([0.62, 0.025, 0.025]).toJSON()
	      );
	    }
	    return nodes;
	  },

	  productViewer: (asset: AuraAssetRef<"model">, options: AuraProductViewerOptions = {}): readonly AuraSceneNode[] => {
	    const placement = productPlacement(asset);
	    const captureTime = options.captureFrame ?? 0.32;
	    const nodes: AuraSceneNode[] = [
	      ...prefabs.productStage({ style: options.stageStyle ?? "hero-clean" }),
	      model(asset, { name: "auto-centered bounded product model" })
	        .position(...placement.position)
	        .rotate(0, -0.38, 0)
	        .scale(placement.scale)
	        .animate({ clip: "turntable", speed: 0.42, duration: 8, captureTime })
	        .toJSON()
	    ];
	    if (options.provenanceBadge === true) {
	      nodes.push(primitives.box({
	        name: "optional typed asset provenance badge off render edge",
	        material: material.emissive({ color: "#dff8ff", emissive: "#67e8f9", opacity: 0.52 })
	      }).position(-2.72, 0.3, 1.18).scale([0.54, 0.055, 0.04]).toJSON());
	    }
	    return nodes;
  },

  physicsRamp: (): readonly AuraSceneNode[] => [
    primitives.box({ name: "rigid physics ramp", material: material.pbr({ color: "#2c3642", roughness: 0.52, metallic: 0.12 }) }).position(-0.35, 0.28, -0.8).rotate(0, 0, -0.42).scale([2.4, 0.16, 0.82]).physics({ type: "static", shape: "box", halfExtents: [1.2, 0.08, 0.41], friction: 0.86 }).toJSON(),
    primitives.box({ name: "static catch platform", material: material.pbr({ color: "#151b22", roughness: 0.62, metallic: 0.08 }) }).position(0.65, 0.02, -0.55).scale([2.4, 0.12, 1.2]).physics({ type: "static", shape: "box", halfExtents: [1.2, 0.06, 0.6], friction: 0.9 }).toJSON(),
    primitives.box({ name: "settled rigid body cube 1", material: material.clearcoat({ color: "#6ee7ff" }) }).position(0.18, 0.22, -0.58).rotate(0.12, 0.34, 0.08).scale(0.24).physics({ type: "dynamic", shape: "box", halfExtents: [0.12, 0.12, 0.12], mass: 1, restitution: 0.18 }).toJSON(),
    primitives.box({ name: "settled rigid body cube 2", material: material.clearcoat({ color: "#ffd166" }) }).position(0.52, 0.22, -0.42).rotate(-0.18, 0.2, -0.12).scale(0.24).physics({ type: "dynamic", shape: "box", halfExtents: [0.12, 0.12, 0.12], mass: 1, restitution: 0.18 }).toJSON(),
    primitives.box({ name: "settled rigid body cube 3", material: material.clearcoat({ color: "#ef476f" }) }).position(0.82, 0.22, -0.72).rotate(0.08, -0.28, 0.2).scale(0.24).physics({ type: "dynamic", shape: "box", halfExtents: [0.12, 0.12, 0.12], mass: 1, restitution: 0.18 }).toJSON()
  ],

  physicsPlayground: (options: { readonly cubes?: number } = {}): readonly AuraSceneNode[] => {
	    const count = Math.max(18, Math.min(64, options.cubes ?? 50));
	    const floorMat = material.pbr({ color: "#111827", roughness: 0.78, metallic: 0.04 });
	    const rampMat = material.clearcoat({ color: "#334155", roughness: 0.32, clearcoat: 0.22 });
	    const platformMat = material.pbr({ color: "#1f2937", roughness: 0.66, metallic: 0.06 });
	    const contactMat = material.emissive({ color: "#f97316", emissive: "#f97316", emissiveIntensity: 0.36, opacity: 0.58 });
	    const guideMat = material.emissive({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 0.38, opacity: 0.66 });
	    const nodes: AuraSceneNode[] = [
	      primitives.plane({ name: "polished physics lab contact floor", material: floorMat }).position(0.35, -0.04, -0.68).scale([5.2, 1, 3.55]).physics({ type: "static", shape: "plane", friction: 0.92, restitution: 0.08 }).toJSON(),
	      primitives.box({ name: "brushed metal tilted collision ramp", material: rampMat }).position(-0.58, 0.36, -0.83).rotate(0, 0, -0.34).scale([3.12, 0.16, 1.25]).physics({ type: "static", shape: "box", halfExtents: [1.56, 0.08, 0.625], friction: 0.84, restitution: 0.12 }).toJSON(),
	      primitives.box({ name: "rubber catch tray platform", material: platformMat }).position(0.88, 0.04, -0.68).scale([2.72, 0.12, 1.74]).physics({ type: "static", shape: "box", halfExtents: [1.36, 0.06, 0.87], friction: 0.9 }).toJSON(),
	      primitives.box({ name: "rear transparent catch wall", material: material.clearcoat({ color: "#93c5fd", roughness: 0.08, clearcoat: 0.72, opacity: 0.22 }) }).position(1.25, 0.48, -1.6).scale([2.36, 0.72, 0.055]).physics({ type: "static", shape: "box", halfExtents: [1.18, 0.36, 0.0275], friction: 0.68, restitution: 0.28 }).toJSON(),
	      primitives.box({ name: "left transparent catch wall", material: material.clearcoat({ color: "#93c5fd", roughness: 0.08, clearcoat: 0.72, opacity: 0.18 }) }).position(-0.04, 0.42, -0.68).scale([0.055, 0.62, 1.62]).physics({ type: "static", shape: "box", halfExtents: [0.0275, 0.31, 0.81], friction: 0.68, restitution: 0.28 }).toJSON(),
	      primitives.cylinder({ name: "subtle collision contact patch cluster center", material: contactMat }).position(0.48, 0.13, -0.78).scale([0.56, 0.014, 0.34]).toJSON(),
	      primitives.cylinder({ name: "subtle collision contact patch under settled pile", material: material.pbr({ color: "#020617", roughness: 0.95, opacity: 0.36 }) }).position(0.92, 0.125, -0.68).scale([0.86, 0.01, 0.54]).toJSON(),
	      primitives.box({ name: "gravity direction cue shaft", material: guideMat }).position(-1.95, 1.16, -1.05).rotate(0, 0, 1.5708).scale([0.5, 0.028, 0.035]).toJSON(),
	      primitives.box({ name: "gravity direction cue head", material: guideMat }).position(-1.95, 0.84, -1.05).rotate(0, 0, 0.82).scale([0.16, 0.028, 0.035]).toJSON(),
	      primitives.box({ name: "reset simulation control button", material: material.clearcoat({ color: "#38bdf8", roughness: 0.16, clearcoat: 0.38 }) }).position(2.02, 0.18, -1.46).scale([0.34, 0.07, 0.16]).onPointer({ cursor: "pointer", onClick: "reset physics playground" }).toJSON(),
	      labels.hud("Physics: ramp, contacts, settled pile", { name: "physics contact counter HUD" }).toJSON(),
	      lights.rect({ name: "physics lab overhead softbox", position: [0.2, 2.8, 1.4], intensity: 0.86, width: 3.8, height: 1.4, color: "#e0f2fe" }).toJSON(),
	      effects.contactOcclusion({ intensity: 0.28, radius: 0.64 }).toJSON()
	    ];
	    const palette = ["#f97316", "#38bdf8", "#a3e635", "#f43f5e", "#facc15", "#c084fc"];
	    for (let index = 0; index < count; index += 1) {
	      const col = index % 8;
	      const row = Math.floor(index / 8);
	      const isFalling = index < 6;
	      const x = isFalling ? -1.58 + col * 0.32 : 0.34 + (col % 5) * 0.28 + (row % 2) * 0.07;
	      const y = isFalling ? 1.12 + (index % 3) * 0.22 : 0.24 + Math.floor((index - 6) / 5) * 0.18 + (col % 2) * 0.025;
	      const z = isFalling ? -1.22 + (index % 3) * 0.22 : -1.08 + (col % 5) * 0.2;
	      nodes.push(primitives.box({
	        name: (isFalling ? "falling" : "settled pile") + " visible rigid body cube " + (index + 1),
	        material: material.clearcoat({ color: palette[index % palette.length], roughness: isFalling ? 0.18 : 0.28, clearcoat: 0.36 })
	      }).position(x, y, z).rotate(index * 0.08, index * 0.13, index * 0.05).scale(0.18).animate(isFalling ? { clip: "float", speed: 0.28 + index * 0.025 } : { clip: "pulse", speed: 0.08 }).physics({ type: "dynamic", shape: "box", halfExtents: [0.09, 0.09, 0.09], mass: 1, friction: 0.62, restitution: 0.22 }).toJSON());
	      if (isFalling) {
	        nodes.push(primitives.box({
	          name: "subtle fall motion streak " + (index + 1),
	          material: material.emissive({ color: palette[index % palette.length], emissive: palette[index % palette.length], emissiveIntensity: 0.32, opacity: 0.4 })
	        }).position(x - 0.08, y - 0.24, z).rotate(0, 0, -0.34).scale([0.026, 0.36, 0.026]).toJSON());
	      }
	    }
	    for (let index = 0; index < 3; index += 1) {
	      nodes.push(primitives.box({
	        name: "small red contact normal vector " + (index + 1),
	        material: material.emissive({ color: "#fb7185", emissive: "#fb7185", emissiveIntensity: 0.32, opacity: 0.58 })
	      }).position(0.48 + index * 0.18, 0.34 + index * 0.025, -0.96 + index * 0.18).rotate(0, 0, -0.58).scale([0.026, 0.22, 0.026]).toJSON());
	    }
	    return nodes;
	  },

  solarSystem: (options: AuraSolarSystemPrefabOptions = {}): readonly AuraSceneNode[] => {
    const orbitSegments = Math.max(8, Math.min(24, options.orbitSegments ?? 16));
    const starCount = Math.max(24, Math.min(90, options.starCount ?? 60));
    const dustCount = Math.max(10, Math.min(48, options.dustCount ?? 24));
    const capturePhase = options.capturePhase ?? 0.42;
    const labelMode = options.labels ?? "attached";
    const planets = [
      { name: "Mercury", radius: 0.82, size: 0.09, color: "#cbd5e1", speed: 1.4, angle: 0.2, preset: "rocky" },
      { name: "Venus", radius: 1.12, size: 0.12, color: "#fbbf24", speed: 1.1, angle: 1.05, preset: "lava-venus" },
      { name: "Earth", radius: 1.46, size: 0.13, color: "#38bdf8", speed: 0.86, angle: 2.0, preset: "ice" },
      { name: "Mars", radius: 1.78, size: 0.105, color: "#f97316", speed: 0.68, angle: 2.82, preset: "rocky" },
      { name: "Jupiter", radius: 2.18, size: 0.22, color: "#f5d0a9", speed: 0.42, angle: 3.7, preset: "gas-giant" },
      { name: "Saturn", radius: 2.6, size: 0.19, color: "#fde68a", speed: 0.32, angle: 4.56, preset: "ringed" }
    ] as const;
    const nodes: AuraSceneNode[] = [
      primitives.sphere({ name: "glowing labeled sun", material: material.solarSun({ color: "#ffd166", coreColor: "#fff7ad", rimColor: "#f97316", emissiveIntensity: 2.55 }) }).position(0, 0.14, 0).scale(0.44).animate({ clip: "pulse", speed: 0.32 }).toJSON(),
      primitives.sphere({ name: "transparent golden sun corona", material: material.solarCorona({ color: "#ff9f1c", coreColor: "#ffd166", rimColor: "#f97316", opacity: 0.32, falloff: 2.6 }) }).position(0, 0.14, 0).scale(0.76).animate({ clip: "pulse", speed: 0.22 }).toJSON(),
      primitives.sphere({ name: "wide amber solar glow halo shader", material: material.solarCorona({ color: "#7c2d12", coreColor: "#ffb347", rimColor: "#f97316", opacity: 0.12, falloff: 3.4, emissiveIntensity: 0.92 }) }).position(0, 0.14, 0).scale(1.08).animate({ clip: "pulse", speed: 0.18 }).toJSON(),
      lights.point({ name: "warm solar key light", position: [0, 0.72, 0], color: "#ffd166", intensity: 0.75 }).toJSON(),
      effects.bloom({ intensity: 0.32, color: "#ffd166", threshold: 0.84, radius: 0.22, maxIntensity: 0.32 }).toJSON()
    ];
    const orbitAnimationFor = (position: AuraVec3, speed: number): AuraAnimationSpec => ({
      clip: "orbit",
      speed,
      duration: 18,
      captureTime: capturePhase,
      orbitCenter: [0, position[1], 0],
      orbitPhase: Math.atan2(position[2], position[0]),
      orbitRadius: Math.hypot(position[0], position[2])
    });
    for (let index = 0; index < starCount; index += 1) {
      nodes.push(primitives.sphere({
        name: `background star ${index + 1}`,
        material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" })
      }).position(seededRange(index, 701, -3.45, 3.45), seededRange(index, 702, 0.12, 1.2), seededRange(index, 703, -3.35, 3.05)).scale(seededRange(index, 704, 0.012, 0.034)).toJSON());
    }
    for (let index = 0; index < dustCount; index += 1) {
      nodes.push(primitives.sphere({
        name: `solar dust depth mote ${index + 1}`,
        material: material.emissive({ color: "#94a3b8", emissive: "#64748b", opacity: 0.18 })
      }).position(seededRange(index, 901, -3.1, 3.1), seededRange(index, 902, 0.02, 0.62), seededRange(index, 903, -2.8, 2.8)).scale(seededRange(index, 904, 0.01, 0.026)).toJSON());
    }
    for (const planet of planets) {
      const segmentLength = (Math.PI * 2 * planet.radius) / orbitSegments * 0.42;
      const ringOpacity = Math.max(0.08, Math.min(0.22, 0.3 - planet.radius * 0.055));
      nodes.push(primitives.torus({
        name: `${planet.name} smooth depth-faded orbit ring`,
        material: material.emissive({ color: "#64748b", emissive: "#475569", opacity: ringOpacity })
      }).position(0, 0.014, 0).rotate(Math.PI / 2, 0, 0).scale([planet.radius * 2, planet.radius * 2, 1]).toJSON());
      for (let segment = 0; segment < orbitSegments; segment += 1) {
        const angle = (segment / orbitSegments) * Math.PI * 2;
        const segmentOpacity = Number(Math.max(0.08, Math.min(0.24, 0.24 - segment / orbitSegments * 0.08)).toFixed(3));
        nodes.push(primitives.box({
          name: `${planet.name} depth-faded orbit path segment ${segment + 1}`,
          material: material.emissive({ color: "#64748b", emissive: "#475569", opacity: segmentOpacity })
        }).position(Math.cos(angle) * planet.radius, 0.012, Math.sin(angle) * planet.radius).rotate(0, Math.PI / 2 - angle, 0).scale([segmentLength, 0.006, 0.008]).toJSON());
      }
      const x = Math.cos(planet.angle) * planet.radius;
      const z = Math.sin(planet.angle) * planet.radius;
      const planetPosition = [x, 0.14, z] as const;
      nodes.push(primitives.sphere({
        name: `${planet.name} ${planet.preset} material labeled orbiting planet`,
        material: solarPlanetMaterial(planet.preset)
      }).position(...planetPosition).scale(planet.size).animate(orbitAnimationFor(planetPosition, planet.speed)).toJSON());
      if (labelMode === "attached") {
        const labelDirection = x >= 0 ? 1 : -1;
        const labelX = x + labelDirection * (0.34 + planet.size * 0.95);
        const labelZ = z + 0.18;
        const leaderPosition = [(x + labelX) / 2, 0.19, (z + labelZ) / 2] as const;
        const labelPlinthPosition = [labelX, 0.095, labelZ] as const;
        const readableLabelPosition = [labelX, 0.34, labelZ] as const;
        const spriteLabelPosition = [labelX, 0.54, labelZ] as const;
        nodes.push(
          primitives.box({
            name: `${planet.name} attached label leader line`,
            material: material.emissive({ color: planet.color, emissive: planet.color, opacity: 0.42 })
          }).position(...leaderPosition).rotate(0, labelDirection > 0 ? -0.26 : 0.26, 0).scale([Math.abs(labelX - x), 0.009, 0.012]).animate(orbitAnimationFor(leaderPosition, planet.speed)).toJSON(),
          primitives.box({
            name: `${planet.name} visible label plinth`,
            material: material.emissive({ color: planet.color, emissive: planet.color, opacity: 0.24 })
          }).position(...labelPlinthPosition).scale([0.26 + planet.name.length * 0.026, 0.018, 0.048]).animate(orbitAnimationFor(labelPlinthPosition, planet.speed)).toJSON(),
          primitives.plane({
            name: `${planet.name} readable planet label`,
            material: material.emissive({ color: "#020617", emissive: planet.color, opacity: 0.78 })
          }).position(...readableLabelPosition).scale([0.38 + planet.name.length * 0.042, 1, 0.14]).animate(orbitAnimationFor(readableLabelPosition, planet.speed)).toJSON(),
          labels.anchor(planet.name, `${planet.name} ${planet.preset} material labeled orbiting planet`, {
            name: `${planet.name} collision-avoiding orbit label`,
            position: spriteLabelPosition,
            size: 0.15,
            collisionAvoidance: true,
            occlusionAware: true,
            animation: orbitAnimationFor(spriteLabelPosition, planet.speed)
          }).toJSON()
        );
      }
    }
    const saturnPosition = [Math.cos(4.56) * 2.6, 0.14, Math.sin(4.56) * 2.6] as const;
    const jupiterBandPosition = [Math.cos(3.7) * 2.18, 0.16, Math.sin(3.7) * 2.18 + 0.01] as const;
    const moonPosition = [Math.cos(2.0) * 1.46 + 0.22, 0.17, Math.sin(2.0) * 1.46 + 0.08] as const;
    nodes.push(primitives.cylinder({
      name: "Saturn ringed planet visible ring",
      material: solarPlanetMaterial("ringed")
    }).position(...saturnPosition).rotate(0.9, 0.2, 0.1).scale([0.4, 0.012, 0.4]).animate(orbitAnimationFor(saturnPosition, 0.32)).toJSON());
    nodes.push(
      primitives.box({ name: "Jupiter visible equator band", material: material.emissive({ color: "#b45309", emissive: "#b45309" }) }).position(...jupiterBandPosition).scale([0.34, 0.026, 0.035]).animate(orbitAnimationFor(jupiterBandPosition, 0.42)).toJSON(),
      primitives.sphere({ name: "Earth small moon material companion", material: solarPlanetMaterial("moon") }).position(...moonPosition).scale(0.035).animate(orbitAnimationFor(moonPosition, 0.86)).toJSON()
    );
    return nodes;
  },

  dataBars3D: (options: AuraDataBars3DPrefabOptions = {}): readonly AuraSceneNode[] => {
    const grid = Math.max(3, Math.min(8, options.grid ?? 6));
    const spacing = 0.66;
    const halfSpan = ((grid - 1) / 2) * spacing;
    const floorSpan = Math.max(5.1, grid * 0.84);
	    const maxHeight = 2.85;
	    const theme = options.theme ?? "dark-analytics";
	    const themePalette = chartThemePalette(theme);
	    const title = options.title ?? "Revenue by Segment";
	    const subtitle = options.subtitle ?? "6x6 quarterly index";
	    const units = options.units ?? "pts";
	    const datasetValues: number[] = [];
	    for (const row of options.dataset ?? []) {
	      for (const value of row) {
	        if (typeof value === "number" && Number.isFinite(value)) datasetValues.push(value);
	      }
	    }
	    const inferredUnitRange = !options.valueRange && datasetValues.length > 0 && datasetValues.every((value) => value >= 0 && value <= 1);
	    const rangeMin = options.valueRange?.[0] ?? 0;
	    const rangeMax = options.valueRange?.[1] ?? (inferredUnitRange ? 1 : 100);
    const selectedRow = options.selected === false || !options.selected
      ? null
      : Math.max(1, Math.min(grid, options.selected.row ?? grid));
    const selectedCol = options.selected === false || !options.selected
      ? null
      : Math.max(1, Math.min(grid, options.selected.col ?? grid));
    const nodes: AuraSceneNode[] = [
      primitives.box({ name: "matte chart floor slab", material: material.pbr({ color: themePalette.floor, roughness: 0.68, metallic: 0.08 }) }).position(0, -0.035, 0).scale([floorSpan, 0.035, floorSpan]).toJSON(),
      primitives.box({ name: "dark rear chart wall", material: material.pbr({ color: themePalette.wall, roughness: 0.52, metallic: 0.1, opacity: 0.72 }) }).position(0, 1.12, -halfSpan - 0.55).scale([floorSpan, 2.3, 0.055]).toJSON(),
      primitives.box({ name: "left analytics side wall", material: material.pbr({ color: themePalette.side, roughness: 0.58, metallic: 0.08, opacity: 0.58 }) }).position(-halfSpan - 0.55, 1.0, 0).scale([0.055, 2.0, floorSpan]).toJSON(),
      primitives.box({ name: "readable 3D chart title backplate", material: material.emissive({ color: "#0f172a", emissive: "#38bdf8", emissiveIntensity: 0.42, opacity: 0.78 }) }).position(0, 2.38, -halfSpan - 0.48).scale([2.6, 0.28, 0.04]).toJSON(),
      primitives.box({ name: "selected metric hover readout panel", material: material.pbr({ color: "#020617", roughness: 0.68, metallic: 0.02, opacity: 0.56 }) }).position(halfSpan + 0.62, 1.85, -halfSpan - 0.42).scale([0.72, 0.52, 0.04]).toJSON(),
      primitives.box({ name: "x axis rail", material: material.emissive({ color: "#d9f8ff", emissive: "#d9f8ff" }) }).position(0, 0.025, halfSpan + 0.36).scale([floorSpan - 0.55, 0.035, 0.035]).toJSON(),
      primitives.box({ name: "z axis rail", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-halfSpan - 0.36, 0.025, 0).scale([0.035, 0.035, floorSpan - 0.55]).toJSON(),
      primitives.box({ name: "height axis rail", material: material.emissive({ color: "#8fd7e8", emissive: "#4bb7d0" }) }).position(-halfSpan - 0.36, maxHeight / 2, halfSpan + 0.36).scale([0.04, maxHeight, 0.04]).toJSON(),
      labels.axisTick("X", {
        name: "collision-avoiding x axis label",
        position: [0, 0.32, halfSpan + 1.18],
        size: 0.22,
        collisionAvoidance: true,
        occlusionAware: true
      }).toJSON(),
      labels.axisTick("Z", {
        name: "collision-avoiding z axis label",
        position: [-halfSpan - 1.18, 0.32, 0],
        size: 0.22,
        collisionAvoidance: true,
        occlusionAware: true
      }).toJSON(),
      labels.axisTick("Height", {
        name: "collision-avoiding height axis label",
        position: [-halfSpan - 0.58, maxHeight + 0.42, halfSpan + 0.36],
        size: 0.2,
        collisionAvoidance: true,
        occlusionAware: true
      }).toJSON(),
      primitives.box({ name: "blue low value legend swatch", material: material.emissive({ color: "#2563eb", emissive: "#2563eb" }) }).position(-0.42, 0.07, halfSpan + 0.95).scale([0.22, 0.04, 0.12]).toJSON(),
      primitives.box({ name: "yellow mid value legend swatch", material: material.emissive({ color: "#facc15", emissive: "#facc15" }) }).position(0, 0.07, halfSpan + 0.95).scale([0.22, 0.04, 0.12]).toJSON(),
      primitives.box({ name: "red high value legend swatch", material: material.emissive({ color: "#ef4444", emissive: "#ef4444" }) }).position(0.42, 0.07, halfSpan + 0.95).scale([0.22, 0.04, 0.12]).toJSON()
    ];
    // Dense grid rails, back-wall ticks, caps, shadows, and grounded labels make
    // the prefab read as an authored analytics scene rather than raw boxes.
    for (let index = 0; index < grid; index += 1) {
      const offset = (index - (grid - 1) / 2) * spacing;
      nodes.push(primitives.box({
        name: `x grid floor guide ${index + 1}`,
        material: material.emissive({ color: "#244b5a", emissive: "#2e7187" })
      }).position(offset, 0.004, 0).scale([0.018, 0.012, floorSpan - 0.8]).toJSON());
      nodes.push(primitives.box({
        name: `z grid floor guide ${index + 1}`,
        material: material.emissive({ color: "#5f5228", emissive: "#8a7636" })
      }).position(0, 0.006, offset).scale([floorSpan - 0.8, 0.012, 0.018]).toJSON());
      nodes.push(primitives.box({
	        name: `readable X${index + 1} axis label chip`,
	        material: material.emissive({ color: index % 2 === 0 ? "#7dd3fc" : "#c084fc", emissive: index % 2 === 0 ? "#7dd3fc" : "#c084fc", emissiveIntensity: 1.6 })
	      }).position(offset, 0.085, halfSpan + 0.68).scale([0.36, 0.075, 0.11]).toJSON());
	      nodes.push(primitives.box({
	        name: `readable Z${index + 1} axis label chip`,
	        material: material.emissive({ color: index % 2 === 0 ? "#fde68a" : "#fb7185", emissive: index % 2 === 0 ? "#fde68a" : "#fb7185", emissiveIntensity: 1.6 })
	      }).position(-halfSpan - 0.68, 0.085, offset).scale([0.11, 0.075, 0.36]).toJSON());
    }
    for (let tick = 1; tick <= 4; tick += 1) {
	      const y = tick * (maxHeight / 4);
      nodes.push(primitives.box({
        name: `height tick ${tick} back wall line`,
        material: material.emissive({ color: "#44606f", emissive: "#5f8498" })
      }).position(0, y, -halfSpan - 0.51).scale([floorSpan - 0.85, 0.018, 0.028]).toJSON());
      nodes.push(primitives.box({
	        name: `height tick ${tick} marker chip`,
	        material: material.emissive({ color: "#93c5fd", emissive: "#38bdf8" })
	      }).position(-halfSpan - 0.48, y, halfSpan + 0.36).scale([0.16, 0.034, 0.05]).toJSON());
	      nodes.push(primitives.box({
	        name: `readable height value label ${tick}`,
	        material: material.emissive({ color: "#bfdbfe", emissive: "#60a5fa", emissiveIntensity: 1.35 })
	      }).position(-halfSpan - 0.72, y, halfSpan + 0.36).scale([0.24, 0.06, 0.045]).toJSON());
    }
    for (let row = 0; row < grid; row += 1) {
      for (let col = 0; col < grid; col += 1) {
        const fallbackNormalized = ((row * 5 + col * 7) % 17) / 16;
        const rawValue = options.dataset?.[row]?.[col];
        const normalized = typeof rawValue === "number" && Number.isFinite(rawValue) && rangeMax !== rangeMin
          ? Math.max(0, Math.min(1, (rawValue - rangeMin) / (rangeMax - rangeMin)))
          : fallbackNormalized;
		        const height = 0.22 + Math.pow(normalized, 0.82) * (maxHeight - 0.22);
        const x = (col - (grid - 1) / 2) * spacing;
        const z = (row - (grid - 1) / 2) * spacing;
        const color = dataBarColor(normalized, options.colorScale);
        const isSelected = selectedRow === row + 1 && selectedCol === col + 1;
        nodes.push(primitives.box({
          name: `soft data bar footprint ${row + 1}-${col + 1}`,
          material: material.pbr({ color: "#020617", roughness: 0.94, opacity: 0.34 })
        }).position(x, 0.012, z).scale([0.38, 0.014, 0.38]).toJSON());
        nodes.push(primitives.box({
          name: `glowing data bar base ${row + 1}-${col + 1}`,
          material: material.emissive({ color, emissive: color })
        }).position(x, 0.045, z).scale([0.38, 0.035, 0.38]).toJSON());
        nodes.push(primitives.box({
          name: `height-colored data bar ${row + 1}-${col + 1}`,
          material: material.clearcoat({
            color: isSelected ? "#f97316" : color,
            emissive: isSelected ? "#f97316" : color,
            roughness: 0.24,
            clearcoat: isSelected ? 0.92 : 0.62
          })
        }).position(x, height / 2, z).scale([isSelected ? 0.46 : 0.34, height, isSelected ? 0.46 : 0.34]).animate({ clip: "bar-height-grow", loop: false, speed: 0.24 + normalized * 0.36, duration: 1.1, captureTime: 1.1, easing: "easeInOut" }).onPointer({ cursor: "pointer", onHover: "highlight bar, brighten cap, and update hover readout value" }).toJSON());
        nodes.push(primitives.box({
          name: `bright data bar top cap ${row + 1}-${col + 1}`,
          material: material.emissive({ color: isSelected ? "#fff7ad" : color, emissive: isSelected ? "#f97316" : color, emissiveIntensity: isSelected ? 0.9 : 0.45 })
        }).position(x, height + 0.03, z).scale([isSelected ? 0.54 : 0.4, isSelected ? 0.06 : 0.04, isSelected ? 0.54 : 0.4]).animate({ clip: "pulse", speed: 0.18 + normalized * 0.3 }).toJSON());
        if (normalized > 0.72) {
          nodes.push(
            primitives.box({
              name: `attached high value cap outline front ${row + 1}-${col + 1}`,
              material: material.emissive({ color, emissive: color, emissiveIntensity: 1.9 })
            }).position(x, height + 0.062, z + 0.23).scale([0.48, 0.024, 0.028]).toJSON(),
            primitives.box({
              name: `attached high value cap outline side ${row + 1}-${col + 1}`,
              material: material.emissive({ color, emissive: color, emissiveIntensity: 1.9 })
            }).position(x + 0.23, height + 0.062, z).scale([0.028, 0.024, 0.48]).toJSON()
          );
        }
        if (isSelected) {
          nodes.push(
            primitives.box({
              name: `selected data bar outline ${row + 1}-${col + 1}`,
              material: material.emissive({ color: "#fff7ad", emissive: "#f97316", emissiveIntensity: 1.2 })
            }).position(x, height + 0.095, z).scale([0.62, 0.034, 0.62]).toJSON(),
            primitives.box({
              name: `hovered data bar readout leader ${row + 1}-${col + 1}`,
              material: material.emissive({ color: "#f97316", emissive: "#f97316", emissiveIntensity: 0.9 })
            }).position((x + halfSpan + 0.36) / 2, height + 0.16, (z - halfSpan - 0.42) / 2).rotate(0, -0.42, 0).scale([0.86, 0.026, 0.03]).toJSON(),
            labels.callout(`${Math.round(rangeMin + normalized * (rangeMax - rangeMin))} ${units}`, `height-colored data bar ${row + 1}-${col + 1}`, {
              name: `selected value label ${row + 1}-${col + 1}`,
              position: [x + 0.34, height + 0.36, z - 0.22],
              size: 0.15,
              collisionAvoidance: true,
              occlusionAware: true
            }).toJSON()
          );
        }
      }
    }
    nodes.push(
      primitives.box({ name: "grounded dashboard legend panel", material: material.pbr({ color: "#07121e", roughness: 0.82, metallic: 0.02, opacity: 0.74 }) }).position(2.46, 0.2, 1.62).scale([1.2, 0.04, 0.34]).toJSON(),
      labels.anchor("Low   Mid   High", "grounded dashboard legend panel", { name: "large grounded legend text", position: [2.46, 0.46, 1.62], size: 0.21, collisionAvoidance: true, occlusionAware: true }).toJSON()
    );
    nodes.push(effects.bloom({ intensity: 0.14, color: "#7dd3fc", threshold: 0.82, radius: 0.2, maxIntensity: 0.24 }).toJSON());
    return nodes;
  },

  neonTunnel: (options: AuraNeonTunnelOptions = {}): readonly AuraSceneNode[] => {
    const rings = Math.max(8, Math.min(12, options.rings ?? 10));
    const palette = neonPalette(options.palette ?? "cyan-magenta");
    const nodes: AuraSceneNode[] = [
      primitives.plane({ name: "glossy black neon tunnel floor", material: material.emissive({ color: "#071426", emissive: "#0b2444", emissiveIntensity: 0.18 }) }).position(0, -0.54, -4.2).scale([5.1, 1, 9.4]).toJSON(),
      primitives.box({ name: "left cyan tunnel wall wash", material: material.emissive({ color: "#0f3b57", emissive: "#0ea5e9", emissiveIntensity: 0.22, opacity: 0.54 }) }).position(-1.78, 0.18, -4.2).rotate(0, -0.18, 0).scale([0.08, 1.55, 8.4]).toJSON(),
      primitives.box({ name: "right magenta tunnel wall wash", material: material.emissive({ color: "#4a1647", emissive: "#e879f9", emissiveIntensity: 0.2, opacity: 0.5 }) }).position(1.78, 0.18, -4.2).rotate(0, 0.18, 0).scale([0.08, 1.55, 8.4]).toJSON(),
      primitives.box({ name: "left vanishing light rail", material: material.emissive({ color: "#38bdf8", emissive: "#38bdf8", emissiveIntensity: 1.18 }) }).position(-1.12, -0.42, -3.9).rotate(0, -0.11, 0).scale([0.055, 0.04, 8.2]).toJSON(),
      primitives.box({ name: "right vanishing light rail", material: material.emissive({ color: "#ff5bd7", emissive: "#ff5bd7", emissiveIntensity: 1.12 }) }).position(1.12, -0.42, -3.9).rotate(0, 0.11, 0).scale([0.055, 0.04, 8.2]).toJSON(),
      primitives.box({ name: "center flythrough camera path glow", material: material.emissive({ color: "#2d98ba", emissive: "#67e8f9", emissiveIntensity: 0.92 }) }).position(0, -0.5, -3.9).scale([0.04, 0.028, 8.0]).toJSON(),
      primitives.box({ name: "tiny vanishing point glow beyond tunnel", material: material.emissive({ color: "#4c1d95", emissive: "#a78bfa", emissiveIntensity: 1.05 }) }).position(0, 0.32, -10.4).scale([0.42, 0.42, 0.052]).toJSON()
    ];
    for (let index = 0; index < rings; index += 1) {
      const progress = rings <= 1 ? 0 : index / (rings - 1);
      const z = 0.45 - index * 0.38;
      const scale = 1.36 - progress * 0.58;
      const color = palette[index % palette.length];
      const mat = material.emissive({ color, emissive: color, emissiveIntensity: 1.02 - progress * 0.5 });
      nodes.push(primitives.box({ name: `receding neon tunnel top segment ${index + 1}`, material: mat }).position(0, 1.12 * scale, z).scale([1.94 * scale, 0.035, 0.18]).animate({ clip: "pulse", speed: 0.16 + (index % 4) * 0.04 }).toJSON());
      nodes.push(primitives.torus({ name: `true circular neon tunnel tube ring ${index + 1}`, material: mat }).position(0, 0.32 * scale, z - 0.018).scale([1.94 * scale, 1.48 * scale, 1]).animate({ clip: "pulse", speed: 0.16 + (index % 4) * 0.04 }).toJSON());
      nodes.push(primitives.box({ name: `floor reflection streak ${index + 1}`, material: material.emissive({ color, emissive: color, opacity: 0.34, emissiveIntensity: 0.62 }) }).position(0, -0.505, z + 0.06).scale([1.08 * scale, 0.018, 0.082]).animate({ clip: "pulse", speed: 0.12 + (index % 3) * 0.05 }).toJSON());
      nodes.push(primitives.box({ name: `left wall speed dash ${index + 1}`, material: material.emissive({ color, emissive: color, opacity: 0.52, emissiveIntensity: 0.72 }) }).position(-1.04 * scale, 0.18, z).rotate(0, 0, 0.12).scale([0.028, 0.12, 0.18]).animate({ clip: "pulse", speed: 0.14 + (index % 5) * 0.03 }).toJSON());
    }
    for (let index = 0; index < rings * 2; index += 1) {
      const progress = rings <= 1 ? 0 : (index % rings) / (rings - 1);
      const z = 0.45 - (index % rings) * 0.38;
      const scale = 1.36 - progress * 0.58;
      const color = palette[index % palette.length];
      const isLeft = index % 2 === 0;
      nodes.push(primitives.box({
        name: `${isLeft ? "left" : "right"} curved tube wall chord ${index + 1}`,
        material: material.emissive({ color, emissive: color, opacity: 0.28, emissiveIntensity: 0.48 })
      }).position(isLeft ? -0.97 * scale : 0.97 * scale, 0.72 * scale, z).rotate(0, isLeft ? 0.18 : -0.18, 0).scale([0.035, 0.82 * scale, 0.18]).toJSON());
    }
    for (let index = 0; index < rings * 4; index += 1) {
      const ringIndex = Math.floor(index / 4);
      const progress = rings <= 1 ? 0 : ringIndex / (rings - 1);
      const z = 0.45 - ringIndex * 0.38;
      const scale = 1.36 - progress * 0.58;
      const color = palette[index % palette.length];
      const offset = (index % 4) * 0.25;
      nodes.push(primitives.box({
        name: `neon tunnel diagonal brace ${index + 1}`,
        material: material.emissive({ color, emissive: color, opacity: 0.38, emissiveIntensity: 0.58 })
      }).position(-0.82 * scale + offset * scale, 0.45 * scale, z).rotate(0, 0, 0.42 + offset * 0.3).scale([0.24 * scale, 0.028, 0.028]).toJSON());
    }
    for (let index = 0; index < 14; index += 1) {
      const color = palette[index % palette.length];
      nodes.push(primitives.sphere({
        name: `floating tunnel spark ${index + 1}`,
        material: material.emissive({ color, emissive: color })
      }).position(seededRange(index, 901, -0.92, 0.92), seededRange(index, 902, -0.42, 1.12), seededRange(index, 903, -9.2, -0.6)).scale(seededRange(index, 904, 0.018, 0.048)).animate({ clip: "float", speed: seededRange(index, 905, 0.14, 0.46) }).toJSON());
    }
    nodes.push(effects.fog({ density: 0.065, color: "#3b4f7a" }).toJSON());
    nodes.push(effects.particles({ name: "ambient tunnel dust particles", emitter: "ambient", color: "#a5f3fc", particleCount: 1100, radius: 2.4, height: 1.6, intensity: 0.28, speed: 0.38 }).toJSON());
    nodes.push(effects.bloom({ intensity: Math.min(0.3, options.bloomIntensity ?? 0.2), color: palette[1], threshold: 0.9, radius: 0.22, maxIntensity: 0.28 }).toJSON());
    return nodes;
  },

  miniGolfHole: (options: AuraMiniGolfPrefabOptions = {}): readonly AuraSceneNode[] => {
	    const green = material.pbr({ color: "#2f9b52", roughness: 0.76, metallic: 0.01 });
	    const fairwayLight = material.pbr({ color: "#46b965", roughness: 0.72, metallic: 0.01 });
	    const fairwayDark = material.pbr({ color: "#218447", roughness: 0.8, metallic: 0.01 });
	    const rail = material.clearcoat({ color: "#14532d", roughness: 0.28, clearcoat: 0.3 });
	    const railCap = material.clearcoat({ color: "#86efac", roughness: 0.2, clearcoat: 0.42 });
	    const sand = material.pbr({ color: "#d9b86c", roughness: 0.92, metallic: 0 });
	    const water = material.clearcoat({ color: "#0ea5e9", roughness: 0.08, clearcoat: 0.8, opacity: 0.72 });
	    const aim = material.emissive({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 0.72, opacity: 0.86 });
	    const power = material.emissive({ color: "#22c55e", emissive: "#22c55e", emissiveIntensity: 0.7, opacity: 0.88 });
	    const ballPosition = options.ballPosition ?? MINI_GOLF_LAYOUT.ballStart;
	    const aimVector = normalizeAuraVec3(options.aimVector ?? MINI_GOLF_LAYOUT.aimVector);
	    const shots = options.shots ?? 0;
	    const score = options.score ?? 0;
	    const collisions = options.collisions ?? 0;
	    const contacts = options.contacts ?? 0;
	    const cupTriggered = options.cupTriggered ?? false;
	    const ghost1 = mix3(MINI_GOLF_LAYOUT.ballStart, ballPosition, 0.38);
	    const ghost2 = mix3(MINI_GOLF_LAYOUT.ballStart, ballPosition, 0.68);
	    const aimAngle = Math.atan2(aimVector[0], aimVector[2]);
	    const nodes: AuraSceneNode[] = [
	      primitives.plane({ name: "designed mini golf felt base course boundaries", material: green }).position(0, -0.03, -0.42).scale([5.4, 1, 3.7]).physics({ type: "static", shape: "plane", friction: 0.94, restitution: 0.08 }).toJSON(),
	      primitives.box({ name: "curved fairway left approach lane", material: fairwayLight }).position(-1.05, -0.01, 0.24).rotate(0, -0.12, 0).scale([1.28, 0.018, 1.65]).toJSON(),
	      primitives.box({ name: "curved fairway center bridge lane", material: fairwayDark }).position(-0.05, -0.008, -0.38).rotate(0, -0.38, 0).scale([1.18, 0.018, 1.9]).toJSON(),
	      primitives.box({ name: "curved fairway right cup approach lane", material: fairwayLight }).position(1.06, -0.007, -1.02).rotate(0, 0.12, 0).scale([1.28, 0.018, 1.28]).toJSON(),
	      primitives.cylinder({ name: "sand trap hazard left of cup", material: sand }).position(0.72, 0.006, -1.18).scale([0.52, 0.012, 0.32]).toJSON(),
	      primitives.cylinder({ name: "blue water hazard pocket", material: water }).position(-0.42, 0.005, -0.72).scale([0.42, 0.01, 0.28]).toJSON(),
	      primitives.box({ name: "left course boundary wall", material: rail }).position(-2.48, 0.13, -0.42).scale([0.1, 0.25, 3.24]).physics({ type: "static", shape: "box", halfExtents: [0.05, 0.125, 1.62], friction: 0.72, restitution: 0.48 }).toJSON(),
	      primitives.box({ name: "right course boundary wall", material: rail }).position(2.48, 0.13, -0.42).scale([0.1, 0.25, 3.24]).physics({ type: "static", shape: "box", halfExtents: [0.05, 0.125, 1.62], friction: 0.72, restitution: 0.48 }).toJSON(),
	      primitives.box({ name: "back course boundary wall", material: rail }).position(0, 0.13, -2.08).scale([5.0, 0.25, 0.1]).physics({ type: "static", shape: "box", halfExtents: [2.5, 0.125, 0.05], friction: 0.72, restitution: 0.48 }).toJSON(),
	      primitives.box({ name: "front tee boundary wall left", material: rail }).position(-1.82, 0.12, 1.18).scale([1.28, 0.22, 0.1]).physics({ type: "static", shape: "box", halfExtents: [0.64, 0.11, 0.05], friction: 0.72, restitution: 0.48 }).toJSON(),
	      primitives.box({ name: "front tee boundary wall right", material: rail }).position(1.82, 0.12, 1.18).scale([1.28, 0.22, 0.1]).physics({ type: "static", shape: "box", halfExtents: [0.64, 0.11, 0.05], friction: 0.72, restitution: 0.48 }).toJSON(),
	      primitives.box({ name: "left rail rounded bevel highlight", material: railCap }).position(-2.41, 0.28, -0.42).scale([0.12, 0.045, 3.18]).toJSON(),
	      primitives.box({ name: "right rail rounded bevel highlight", material: railCap }).position(2.41, 0.28, -0.42).scale([0.12, 0.045, 3.18]).toJSON(),
	      primitives.box({ name: "back rail rounded bevel highlight", material: railCap }).position(0, 0.28, -2.0).scale([4.82, 0.045, 0.12]).toJSON(),
	      primitives.box({ name: "tee mat with visible start marker", material: material.pbr({ color: "#166534", roughness: 0.58 }) }).position(-1.42, 0.012, 0.58).scale([0.78, 0.024, 0.52]).toJSON(),
	      primitives.sphere({ name: "white physics golf ball", material: material.clearcoat({ color: "#f8fafc", roughness: 0.12, clearcoat: 0.65 }) }).position(...ballPosition).scale(0.16).animate({ clip: "roll", speed: 0.72 }).onPointer({ cursor: "crosshair", onClick: "aim and shoot ball" }).physics({ type: "dynamic", shape: "sphere", radius: 0.16, mass: 0.045, friction: 0.38, restitution: 0.54 }).toJSON(),
	      primitives.cylinder({ name: "ball contact shadow on felt", material: material.pbr({ color: "#052e16", roughness: 0.95, opacity: 0.38 }) }).position(ballPosition[0], 0.018, ballPosition[2]).scale([0.24, 0.01, 0.18]).toJSON(),
	      primitives.cylinder({ name: "ball aim selection ring", material: aim }).position(ballPosition[0], 0.035, ballPosition[2]).scale([0.34, 0.014, 0.34]).toJSON(),
	      primitives.box({ name: "cyan aim direction line", material: aim }).position(ballPosition[0] + aimVector[0] * 0.54, 0.085, ballPosition[2] + aimVector[2] * 0.54).rotate(0, -aimAngle, 0).scale([1.0, 0.035, 0.052]).toJSON(),
	      primitives.sphere({ name: "transparent moving ball ghost 1", material: material.emissive({ color: "#bae6fd", emissive: "#38bdf8", opacity: shots > 0 ? 0.34 : 0.12, emissiveIntensity: 0.38 }) }).position(...ghost1).scale(0.105).toJSON(),
	      primitives.sphere({ name: "transparent moving ball ghost 2", material: material.emissive({ color: "#fef08a", emissive: "#facc15", opacity: shots > 0 ? 0.3 : 0.1, emissiveIntensity: 0.34 }) }).position(...ghost2).scale(0.082).toJSON(),
	      primitives.box({ name: "shot power meter track", material: material.pbr({ color: "#082f49", roughness: 0.56 }) }).position(-2.08, 0.08, 0.72).scale([0.08, 0.04, 0.86]).toJSON(),
	      primitives.box({ name: "shot power meter fill", material: power }).position(-2.08, 0.13, 0.5).scale([0.1, 0.08 + Math.min(0.1, shots * 0.018), 0.42]).toJSON(),
	      primitives.cylinder({ name: "windmill obstacle base", material: material.clearcoat({ color: "#ef4444", roughness: 0.18, clearcoat: 0.45 }) }).position(0.22, 0.22, -0.48).scale([0.28, 0.42, 0.28]).physics({ type: "static", shape: "capsule", radius: 0.18, halfHeight: 0.22, friction: 0.48, restitution: 0.72 }).toJSON(),
	      primitives.box({ name: "windmill obstacle blade horizontal", material: material.emissive({ color: "#fef3c7", emissive: "#facc15", emissiveIntensity: 0.45 }) }).position(0.22, 0.72, -0.48).scale([0.78, 0.045, 0.045]).animate({ clip: "spin", speed: 0.34 }).toJSON(),
	      primitives.box({ name: "windmill obstacle blade vertical", material: material.emissive({ color: "#fef3c7", emissive: "#facc15", emissiveIntensity: 0.45 }) }).position(0.22, 0.72, -0.48).scale([0.045, 0.78, 0.045]).animate({ clip: "spin", speed: 0.34 }).toJSON(),
	      primitives.box({ name: "subtle dotted shot preview before obstacle", material: material.emissive({ color: "#bae6fd", emissive: "#bae6fd", emissiveIntensity: 0.36, opacity: 0.64 }) }).position(-0.56, 0.07, 0.08).rotate(0, -0.42, 0).scale([0.32, 0.024, 0.036]).toJSON(),
	      primitives.box({ name: "subtle dotted rebound preview after obstacle", material: material.emissive({ color: "#fef08a", emissive: "#fef08a", emissiveIntensity: 0.36, opacity: 0.62 }) }).position(0.78, 0.07, -0.86).rotate(0, 0.36, 0).scale([0.48, 0.026, 0.04]).toJSON(),
	      primitives.cylinder({ name: "orange obstacle contact flash", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", opacity: collisions > 0 ? 0.62 : 0.18, emissiveIntensity: collisions > 0 ? 1.2 : 0.24 }) }).position(0.22, 0.035, -0.48).scale([0.22 + Math.min(0.16, collisions * 0.025), 0.012, 0.22 + Math.min(0.16, collisions * 0.025)]).toJSON(),
	      primitives.cylinder({ name: "dark cup hole", material: material.pbr({ color: "#050608", roughness: 0.9 }) }).position(1.55, 0.012, -1.18).scale([0.2, 0.02, 0.2]).toJSON(),
	      primitives.cylinder({ name: "cup capture ring", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.34 }) }).position(1.55, 0.026, -1.18).scale([0.28, 0.012, 0.28]).physics({ type: "static", shape: "sphere", radius: 0.28, sensor: true }).toJSON(),
	      primitives.cylinder({ name: "raised beveled cup rim outer lip", material: material.clearcoat({ color: "#e5e7eb", roughness: 0.2, clearcoat: 0.52 }) }).position(1.55, 0.045, -1.18).scale([0.34, 0.024, 0.34]).toJSON(),
	      primitives.box({ name: "flag pole", material: material.metal({ color: "#f8fafc" }) }).position(1.7, 0.48, -1.18).scale([0.025, 0.9, 0.025]).toJSON(),
	      primitives.box({ name: "orange flag", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", emissiveIntensity: 0.62 }) }).position(1.9, 0.78, -1.18).scale([0.32, 0.18, 0.035]).toJSON(),
	      primitives.box({ name: "score counter stroke digit bar", material: material.emissive({ color: score > 0 ? "#fef08a" : "#86efac", emissive: score > 0 ? "#facc15" : "#22c55e", emissiveIntensity: 0.72 }) }).position(-2.28, 0.36, 0.72).scale([0.055, 0.22 + score * 0.1 + shots * 0.035, 0.035]).toJSON(),
	      primitives.sphere({ name: "cup success glow marker", material: material.emissive({ color: cupTriggered ? "#fef08a" : "#64748b", emissive: cupTriggered ? "#facc15" : "#334155", opacity: cupTriggered ? 0.64 : 0.18, emissiveIntensity: cupTriggered ? 1.1 : 0.18 }) }).position(1.55, 0.14, -1.18).scale(cupTriggered ? 0.18 : 0.08).toJSON(),
	      primitives.box({ name: "floating mini golf score hud backboard", material: material.pbr({ color: "#04111f", roughness: 0.42, metallic: 0.08 }) }).position(-0.8, 1.34, -2.18).scale([1.72, 0.38, 0.06]).toJSON(),
	      primitives.box({ name: "floating mini golf score hud top text stroke", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.82 }) }).position(-0.98, 1.48, -2.12).scale([0.82, 0.045, 0.035]).toJSON(),
	      primitives.box({ name: "floating mini golf aim hud arrow stroke", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 0.92 }) }).position(-1.16, 1.28, -2.1).rotate(0, -0.32, 0).scale([0.58, 0.04, 0.035]).toJSON(),
	      primitives.box({ name: "floating mini golf aim hud arrow head", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 0.92 }) }).position(-0.86, 1.27, -2.02).rotate(0, -0.32, -0.65).scale([0.18, 0.04, 0.035]).toJSON(),
	      primitives.box({ name: "floating mini golf power meter track", material: material.pbr({ color: "#0f172a", roughness: 0.5, metallic: 0.08 }) }).position(-0.16, 1.24, -2.12).scale([0.12, 0.22, 0.04]).toJSON(),
	      primitives.box({ name: "floating mini golf power meter fill", material: material.emissive({ color: "#22c55e", emissive: "#22c55e", emissiveIntensity: 0.86 }) }).position(-0.16, 1.2, -2.08).scale([0.14, 0.16, 0.035]).toJSON(),
	      primitives.box({ name: "floating mini golf shot count tick one", material: material.emissive({ color: "#fef08a", emissive: "#facc15", emissiveIntensity: 0.78 }) }).position(0.24, 1.34, -2.1).scale([0.045, 0.22, 0.035]).toJSON(),
	      primitives.box({ name: "floating mini golf shot count tick two", material: material.emissive({ color: "#fef08a", emissive: "#facc15", emissiveIntensity: 0.78 }) }).position(0.38, 1.34, -2.1).scale([0.045, 0.22, 0.035]).toJSON(),
	      labels.hud(`Mini golf: shots ${shots} score ${score} contacts ${contacts}`, { name: "mini golf score and shot HUD" }).toJSON(),
	      primitives.sphere({ name: "follow camera target beacon above ball", material: material.emissive({ color: "#38bdf8", emissive: "#38bdf8", opacity: 0.46 }) }).position(ballPosition[0], ballPosition[1] + 0.46, ballPosition[2]).scale(0.055).toJSON(),
	      interactions.dragVector({ target: "white physics golf ball", vector: [1, 0, -0.55] }).toJSON(),
	      interactions.clickImpulse({ target: "white physics golf ball", impulse: 1.2, vector: [1, 0, -0.55] }).toJSON()
	    ];
	    return nodes;
	  },

  miniGolfCourse: (): readonly AuraSceneNode[] => prefabs.miniGolfHole(),

  primitiveHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => {
    const showJoints = options.showJoints ?? false;
    const motionTrail = options.motionTrail ?? true;
    const nodes: AuraSceneNode[] = [
    primitives.plane({ name: "walk cycle ground plane", material: material.pbr({ color: "#1f5130", roughness: 0.7 }) }).position(0, -0.04, -0.5).scale([4.8, 1, 3]).toJSON(),
    primitives.box({ name: "painted walking path", material: material.pbr({ color: "#2d3748", roughness: 0.78 }) }).position(0, 0.01, -0.45).scale([3.8, 0.025, 0.42]).toJSON(),
    primitives.box({ name: "white dashed stride marker 1", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" }) }).position(-1.05, 0.04, -0.45).scale([0.42, 0.025, 0.045]).toJSON(),
    primitives.box({ name: "white dashed stride marker 2", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" }) }).position(0.05, 0.04, -0.45).scale([0.42, 0.025, 0.045]).toJSON(),
    primitives.box({ name: "white dashed stride marker 3", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" }) }).position(1.15, 0.04, -0.45).scale([0.42, 0.025, 0.045]).toJSON(),
    primitives.box({ name: "cyan walk motion arrow shaft", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9" }) }).position(0.76, 0.06, -0.23).rotate(0, -0.18, 0).scale([0.58, 0.025, 0.035]).toJSON(),
    primitives.box({ name: "cyan walk motion arrow head", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9" }) }).position(1.07, 0.06, -0.17).rotate(0, -0.18, -0.72).scale([0.18, 0.025, 0.035]).toJSON(),
    primitives.cylinder({ name: "humanoid contact shadow", material: material.pbr({ color: "#050608", roughness: 0.94, opacity: 0.48 }) }).position(0.04, 0.035, -0.5).scale([0.72, 0.014, 0.44]).toJSON(),
    primitives.cylinder({ name: "connected blue humanoid torso", material: material.clearcoat({ color: "#2563eb", roughness: 0.16 }) }).position(0, 0.9, -0.55).scale([0.3, 0.72, 0.23]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.cylinder({ name: "short humanoid neck connector", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.22 }) }).position(0, 1.31, -0.55).scale([0.095, 0.18, 0.095]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.sphere({ name: "humanoid head", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.2 }) }).position(0, 1.48, -0.55).scale(0.205).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.sphere({ name: "left humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a" }) }).position(-0.058, 1.52, -0.36).scale(0.025).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.sphere({ name: "right humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a" }) }).position(0.058, 1.52, -0.36).scale(0.025).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.box({ name: "humanoid mouth line", material: material.emissive({ color: "#7f1d1d", emissive: "#7f1d1d" }) }).position(0, 1.44, -0.35).scale([0.1, 0.014, 0.016]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.box({ name: "shoulder bar connecting arms", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0, 1.1, -0.55).scale([0.58, 0.09, 0.12]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
	    primitives.capsule({ name: "left attached swinging arm", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(-0.31, 0.96, -0.45).rotate(0.42, 0, -0.2).scale([0.1, 0.36, 0.1]).animate({ clip: "walk", speed: 0.9 }).toJSON(),
	    primitives.capsule({ name: "right attached swinging arm", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0.31, 0.96, -0.65).rotate(-0.42, 0, 0.2).scale([0.1, 0.36, 0.1]).animate({ clip: "walk", speed: 0.9 }).toJSON(),
	    primitives.capsule({ name: "left bent forearm", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(-0.35, 0.72, -0.35).rotate(-0.34, 0, -0.08).scale([0.088, 0.3, 0.088]).animate({ clip: "walk", speed: 0.9 }).toJSON(),
	    primitives.capsule({ name: "right bent forearm", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0.35, 0.72, -0.75).rotate(0.34, 0, 0.08).scale([0.088, 0.3, 0.088]).animate({ clip: "walk", speed: 0.9 }).toJSON(),
	    primitives.sphere({ name: "left humanoid hand", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.24 }) }).position(-0.37, 0.54, -0.29).scale(0.07).animate({ clip: "walk", speed: 0.9 }).toJSON(),
	    primitives.sphere({ name: "right humanoid hand", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.24 }) }).position(0.37, 0.54, -0.81).scale(0.07).animate({ clip: "walk", speed: 0.9 }).toJSON(),
    primitives.box({ name: "hip bar connecting legs", material: material.clearcoat({ color: "#1d4ed8", roughness: 0.2 }) }).position(0, 0.51, -0.55).scale([0.42, 0.1, 0.14]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
	    primitives.capsule({ name: "forward connected walking leg", material: material.clearcoat({ color: "#172033", roughness: 0.24 }) }).position(-0.13, 0.36, -0.4).rotate(-0.36, 0, -0.04).scale([0.12, 0.36, 0.12]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
	    primitives.capsule({ name: "back connected walking leg", material: material.clearcoat({ color: "#172033", roughness: 0.24 }) }).position(0.15, 0.36, -0.7).rotate(0.36, 0, 0.04).scale([0.12, 0.36, 0.12]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
	    primitives.capsule({ name: "forward lower walking shin", material: material.clearcoat({ color: "#172033", roughness: 0.24 }) }).position(-0.23, 0.17, -0.21).rotate(0.28, 0, -0.03).scale([0.11, 0.34, 0.11]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
	    primitives.capsule({ name: "back lower walking shin", material: material.clearcoat({ color: "#172033", roughness: 0.24 }) }).position(0.25, 0.17, -0.87).rotate(-0.28, 0, 0.03).scale([0.11, 0.34, 0.11]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
	    primitives.box({ name: "forward foot planted on path", material: material.clearcoat({ color: "#0f172a", roughness: 0.2 }) }).position(-0.28, 0.07, -0.06).rotate(0, -0.16, 0).scale([0.32, 0.08, 0.18]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
	    primitives.box({ name: "back foot pushing off path", material: material.clearcoat({ color: "#0f172a", roughness: 0.2 }) }).position(0.31, 0.07, -1.02).rotate(0, 0.16, 0).scale([0.32, 0.08, 0.18]).animate({ clip: "walk", speed: 0.95 }).toJSON()
    ];
    if (showJoints) {
      nodes.push(
        primitives.sphere({ name: "left shoulder ball joint", material: material.clearcoat({ color: "#93c5fd", roughness: 0.16 }) }).position(-0.31, 1.1, -0.55).scale(0.07).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "right shoulder ball joint", material: material.clearcoat({ color: "#93c5fd", roughness: 0.16 }) }).position(0.31, 1.1, -0.55).scale(0.07).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "left elbow hinge", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(-0.34, 0.82, -0.39).scale(0.062).animate({ clip: "walk", speed: 0.9 }).toJSON(),
        primitives.sphere({ name: "right elbow hinge", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0.34, 0.82, -0.71).scale(0.062).animate({ clip: "walk", speed: 0.9 }).toJSON(),
        primitives.sphere({ name: "left hip ball joint", material: material.clearcoat({ color: "#1d4ed8", roughness: 0.18 }) }).position(-0.18, 0.51, -0.55).scale(0.07).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "right hip ball joint", material: material.clearcoat({ color: "#1d4ed8", roughness: 0.18 }) }).position(0.18, 0.51, -0.55).scale(0.07).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "forward knee hinge", material: material.clearcoat({ color: "#172033", roughness: 0.18 }) }).position(-0.2, 0.24, -0.29).scale(0.064).animate({ clip: "walk", speed: 0.95 }).toJSON(),
        primitives.sphere({ name: "back knee hinge", material: material.clearcoat({ color: "#172033", roughness: 0.18 }) }).position(0.22, 0.24, -0.81).scale(0.064).animate({ clip: "walk", speed: 0.95 }).toJSON()
      );
    }
    if (motionTrail) {
      nodes.push(
	        primitives.box({ name: "cyan body motion trail ribbon behind torso", material: material.emissive({ color: "#38bdf8", emissive: "#38bdf8", opacity: 0.22 }) }).position(-0.38, 0.92, -0.96).rotate(0, -0.08, 0).scale([0.68, 0.032, 0.04]).toJSON(),
	        primitives.box({ name: "blue shoulder motion streak", material: material.emissive({ color: "#93c5fd", emissive: "#93c5fd", opacity: 0.24 }) }).position(-0.28, 1.12, -0.98).rotate(0, -0.08, 0).scale([0.46, 0.028, 0.035]).toJSON(),
	        primitives.box({ name: "orange forward foot motion streak", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", opacity: 0.42 }) }).position(-0.08, 0.055, -0.18).rotate(0, -0.18, 0).scale([0.48, 0.024, 0.04]).toJSON(),
	        primitives.box({ name: "blue rear foot motion streak", material: material.emissive({ color: "#60a5fa", emissive: "#60a5fa", opacity: 0.34 }) }).position(0.16, 0.055, -0.9).rotate(0, 0.18, 0).scale([0.42, 0.022, 0.038]).toJSON()
	      );
	    }
    return nodes;
  },

  lowPolyHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => {
    return createLowPolyHumanoid(options);
  }
} as const;

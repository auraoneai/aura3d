// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraPromptPlan } from "../../nodes/types.js";
import { prefabs } from "../prefabs/index.js";
import { AuraSceneBuilder } from "../scene.js";
import { effects } from "../effects.composite.js";
import { model } from "../model.js";
import { primitives } from "../primitives.js";
import { scene } from "../scene.js";
import { timeline } from "../timeline.js";
import { camera } from "../camera.js";
import { lights } from "../lights.js";
import { material } from "../material.js";
import { interactionNode } from "./promptPlan.js";

export const promptRecipes = {
	  "product-viewer": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
	    scene()
	      .background("#070b10")
	      .addMany(prefabs.productViewer(asset))
	      .add(lights.ambient({ intensity: 0.28, color: "#e8f1ff" }))
      .add(lights.studio({ intensity: 1.35 }))
      .add(lights.point({ name: "large cool product softbox", position: [-2.2, 2.45, 2.25], color: "#eef6ff", intensity: 2.75 }))
      .add(lights.point({ name: "front product fill", position: [0.35, 1.25, 2.2], color: "#f7fbff", intensity: 1.8 }))
      .add(lights.point({ name: "warm product rim", position: [2.1, 1.72, 0.15], color: "#ffd09a", intensity: 1.22 }))
      .add(effects.bloom({ intensity: 0.18, color: "#cfefff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.perspective({ position: [1.65, 1.18, 4.0], target: [0, 0.72, -0.65], fov: 38 }))
      .timeline(timeline.loop({ seconds: 8 })),

  "cinematic-scene": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#02040a")
      .add(primitives.plane({ name: "rainy alley back wall", material: material.emissive({ color: "#03070e", emissive: "#050b13" }) }).position(0, 1.06, -2.55).rotate(1.5708, 0, 0).scale([6.25, 1, 3.1]))
      .add(primitives.plane({ name: "black wet asphalt", material: material.pbr({ color: "#03070c", roughness: 0.08, metallic: 0.5 }) }).position(0, -0.07, -0.55).scale([7.0, 1, 5.9]))
      .add(primitives.box({ name: "left alley slab", material: material.pbr({ color: "#03060b", roughness: 0.46, metallic: 0.1 }) }).position(-2.9, 0.9, -0.95).rotate(0, 0.18, 0).scale([0.42, 2.25, 3.25]))
      .add(primitives.box({ name: "right alley slab", material: material.pbr({ color: "#03050a", roughness: 0.46, metallic: 0.1 }) }).position(2.95, 0.92, -1.05).rotate(0, -0.16, 0).scale([0.42, 2.35, 3.15]))
      .add(primitives.box({ name: "foreground left shadow frame", material: material.pbr({ color: "#010207", roughness: 0.5, metallic: 0.05 }) }).position(-3.35, 0.72, 1.0).rotate(0, -0.18, 0).scale([0.5, 1.72, 1.65]))
      .add(primitives.box({ name: "foreground right shadow frame", material: material.pbr({ color: "#010207", roughness: 0.5, metallic: 0.05 }) }).position(3.28, 0.7, 0.96).rotate(0, 0.18, 0).scale([0.5, 1.72, 1.65]))
      .add(primitives.box({ name: "rear door depth plane", material: material.pbr({ color: "#07111c", roughness: 0.35, metallic: 0.18 }) }).position(0.02, 0.6, -2.38).scale([1.14, 1.18, 0.08]))
      .add(primitives.box({ name: "cyan neon sign", material: material.emissive({ color: "#32ddff", emissive: "#32ddff" }) }).position(-2.22, 1.35, -1.55).rotate(0.05, 0, -0.24).scale([0.055, 1.48, 0.12]))
      .add(primitives.box({ name: "short cyan practical", material: material.emissive({ color: "#63eaff", emissive: "#63eaff" }) }).position(-1.82, 0.74, -1.85).rotate(0.05, 0, 0.12).scale([0.045, 0.76, 0.12]))
      .add(primitives.sphere({ name: "warm street practical", material: material.emissive({ color: "#ffbd68", emissive: "#ffbd68" }) }).position(1.86, 0.78, -1.28).scale(0.34))
      .add(primitives.box({ name: "amber wet reflection", material: material.emissive({ color: "#b36d39", emissive: "#c77f45" }) }).position(1.62, -0.005, -0.42).rotate(0, -0.08, 0).scale([0.86, 0.035, 0.24]))
      .add(primitives.box({ name: "cyan wet reflection", material: material.emissive({ color: "#1a6d86", emissive: "#2398b7" }) }).position(-1.22, -0.005, -0.34).rotate(0, 0.16, 0).scale([0.72, 0.03, 0.18]))
      .add(primitives.box({ name: "long cyan puddle streak", material: material.emissive({ color: "#0f4356", emissive: "#1b8ba8" }) }).position(-0.34, -0.002, 0.28).rotate(0, 0.22, 0).scale([1.18, 0.026, 0.12]))
      .add(primitives.box({ name: "warm puddle streak", material: material.emissive({ color: "#835331", emissive: "#be7a43" }) }).position(0.9, -0.002, 0.12).rotate(0, -0.16, 0).scale([0.92, 0.026, 0.13]))
      .add(primitives.sphere({ name: "rain splash foreground", material: material.emissive({ color: "#c8f4ff", emissive: "#c8f4ff" }) }).position(-0.88, 0.035, 0.72).scale([0.07, 0.018, 0.07]))
      .add(primitives.sphere({ name: "rain splash key side", material: material.emissive({ color: "#ffe1ad", emissive: "#ffe1ad" }) }).position(1.14, 0.035, 0.44).scale([0.08, 0.018, 0.08]))
      .add(model(asset, { name: plan.subject.label }).position(-0.08, 0.02, -0.86).rotate(-0.08, -0.74, 0.02).scale(1.48))
      .add(lights.ambient({ intensity: 0.22, color: "#b4c9e8" }))
      .add(lights.point({ name: "hard cyan rim", position: [-2.35, 2.65, 0.85], color: "#38d6ff", intensity: 3.25 }))
      .add(lights.point({ name: "warm practical key", position: [2.35, 1.7, -0.25], color: "#ffd08a", intensity: 1.6 }))
      .add(lights.point({ name: "low floor bounce", position: [0.1, 0.45, 1.1], color: "#7edfff", intensity: 0.62 }))
      .add(lights.point({ name: "cinematic hero front fill", position: [0.15, 1.45, 3.1], color: "#e8f2ff", intensity: 5.2 }))
      .add(effects.rain({ intensity: 0.46, color: "#c3e6ff" }))
      .add(effects.fog({ density: 0.08, color: "#32435a" }))
      .add(effects.bloom({ intensity: 0.36, color: "#6edfff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.dolly({ from: [0.46, 1.05, 4.28], to: [0.08, 0.86, 3.14], target: [-0.08, 0.56, -0.86], seconds: 8, fov: 39 }))
      .timeline(timeline.loop({ seconds: 8 })),

  "mini-game": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#030711")
      .add(primitives.plane({ name: "neon game board", material: material.pbr({ color: "#10222d", roughness: 0.5, metallic: 0.16 }) }).position(0, -0.08, -0.35).scale([5.8, 1, 4.05]))
      .add(primitives.box({ name: "north glass rail", material: material.emissive({ color: "#1b5e70", emissive: "#228aa4" }) }).position(0, 0.18, -2.18).scale([5.85, 0.32, 0.14]))
      .add(primitives.box({ name: "south glass rail", material: material.pbr({ color: "#18313e", roughness: 0.42, metallic: 0.12 }) }).position(0, 0.18, 1.52).scale([5.85, 0.32, 0.14]))
      .add(primitives.box({ name: "left glass rail", material: material.pbr({ color: "#172f3c", roughness: 0.42, metallic: 0.12 }) }).position(-2.76, 0.18, -0.35).scale([0.14, 0.32, 3.86]))
      .add(primitives.box({ name: "right glass rail", material: material.emissive({ color: "#1b5e70", emissive: "#228aa4" }) }).position(2.76, 0.18, -0.35).scale([0.14, 0.32, 3.86]))
      .add(primitives.box({ name: "hud score panel", material: material.pbr({ color: "#06131a", roughness: 0.34, metallic: 0.18 }) }).position(-1.82, 0.075, 1.05).scale([1.2, 0.045, 0.24]))
      .add(primitives.sphere({ name: "health pip 1", material: material.emissive({ color: "#5cff87", emissive: "#5cff87" }) }).position(-2.28, 0.17, 1.06).scale(0.12))
      .add(primitives.sphere({ name: "health pip 2", material: material.emissive({ color: "#5cff87", emissive: "#5cff87" }) }).position(-2.02, 0.17, 1.06).scale(0.12))
      .add(primitives.sphere({ name: "health pip 3", material: material.emissive({ color: "#5cff87", emissive: "#5cff87" }) }).position(-1.76, 0.17, 1.06).scale(0.12))
      .add(primitives.box({ name: "timer bar", material: material.emissive({ color: "#55e7ff", emissive: "#55e7ff" }) }).position(-0.22, 0.11, 1.04).scale([1.18, 0.052, 0.1]))
      .add(primitives.box({ name: "objective bar", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(1.34, 0.11, 1.04).scale([0.96, 0.052, 0.1]))
      .add(primitives.box({ name: "start lane glow", material: material.emissive({ color: "#55e7ff", emissive: "#55e7ff" }) }).position(-1.98, 0.03, 0.62).scale([0.94, 0.045, 0.15]))
      .add(primitives.box({ name: "center lane stripe", material: material.emissive({ color: "#225f75", emissive: "#2c91ad" }) }).position(0.1, 0.025, 0.3).rotate(0, -0.28, 0).scale([1.75, 0.035, 0.08]))
      .add(model(asset, { name: plan.subject.label ?? "player" }).position(-1.42, 0.02, 0.54).rotate(0, 0.72, 0).scale(0.74))
      .add(primitives.box({ name: "orange boost pack", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(-1.08, 0.42, 0.48).rotate(0, 0.52, 0).scale([0.28, 0.08, 0.12]))
      .add(primitives.sphere({ name: "player shield ring", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }).position(-1.42, 0.08, 0.54).scale([0.72, 0.06, 0.72]))
      .add(primitives.box({ name: "cyan motion trail", material: material.emissive({ color: "#4fd7ff", emissive: "#4fd7ff" }) }).position(-2.08, 0.1, 0.58).scale([0.82, 0.075, 0.16]))
      .add(primitives.box({ name: "route arrow shaft", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }).position(-0.86, 0.08, 0.18).rotate(0, -0.42, 0).scale([0.86, 0.04, 0.08]))
      .add(primitives.box({ name: "route arrow head", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }).position(-0.42, 0.1, -0.04).rotate(0, -0.42, 0.78).scale([0.28, 0.045, 0.08]))
      .add(primitives.box({ name: "danger floor plate", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(-0.18, 0.055, -0.58).rotate(0, 0.08, 0).scale([0.92, 0.04, 0.2]))
      .add(primitives.box({ name: "moving red hazard", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(-0.18, 0.34, -0.18).rotate(0, 0.56, 0).scale([0.86, 0.58, 0.38]))
      .add(primitives.sphere({ name: "hazard warning pulse", material: material.emissive({ color: "#ff2a42", emissive: "#ff2a42" }) }).position(-0.18, 0.84, -0.18).scale(0.22))
      .add(primitives.box({ name: "laser gate lower", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(0.95, 0.22, -0.9).rotate(0, -0.14, 0).scale([1.02, 0.075, 0.1]))
      .add(primitives.box({ name: "laser gate upper", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(0.95, 0.58, -0.9).rotate(0, -0.14, 0).scale([1.02, 0.075, 0.1]))
      .add(primitives.sphere({ name: "coin 1", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(-0.42, 0.48, 0.8).scale(0.34))
      .add(primitives.sphere({ name: "coin 2", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(0.48, 0.48, 0.18).scale(0.34))
      .add(primitives.sphere({ name: "coin 3", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(1.26, 0.48, -0.62).scale(0.34))
      .add(primitives.box({ name: "goal portal left", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(1.72, 0.48, -1.22).scale([0.14, 0.92, 0.18]))
      .add(primitives.box({ name: "goal portal right", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(2.12, 0.48, -1.22).scale([0.14, 0.92, 0.18]))
      .add(primitives.box({ name: "goal portal top", material: material.emissive({ color: "#ffbd68", emissive: "#ffbd68" }) }).position(1.92, 0.94, -1.22).scale([0.52, 0.12, 0.18]))
      .add(lights.ambient({ intensity: 0.16, color: "#b3f7ff" }))
      .add(lights.point({ name: "arena key", position: [-1.55, 2.1, 1.6], color: "#8ef6ff", intensity: 2.25 }))
      .add(lights.point({ name: "goal glow", position: [2.0, 1.16, -1.2], color: "#ff9d5c", intensity: 2.0 }))
      .add(effects.bloom({ intensity: 0.28, color: "#9af0ff" }))
      .add(interactionNode(plan.interaction ?? "keyboard", "player"))
      .camera(camera.perspective({ position: [0, 3.22, 4.38], target: [0, 0.26, -0.42], fov: 39 }))
      .timeline(timeline.loop({ seconds: 6 })),

  "material-studio": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#080a0d")
      .add(primitives.plane({ name: "neutral material studio floor", material: material.pbr({ color: "#1b1f24", roughness: 0.32, metallic: 0.08 }) }).position(0, -0.08, -0.5).scale([6.0, 1, 3.6]))
      .add(model(asset, { name: plan.subject.label }).position(-1.25, 0.02, -0.72).rotate(-0.08, -0.42, 0).scale(0.92))
      .add(primitives.sphere({ name: "matte swatch", material: material.pbr({ color: "#c7d2e2", roughness: 0.88, metallic: 0 }) }).position(0.3, 0.5, -0.85).scale(0.44))
      .add(primitives.sphere({ name: "metal swatch", material: material.pbr({ color: "#dde8f2", roughness: 0.18, metallic: 0.86 }) }).position(1.08, 0.5, -0.85).scale(0.44))
      .add(primitives.sphere({ name: "emissive swatch", material: material.emissive({ color: "#ff4bd8", emissive: "#ff4bd8", roughness: 0.22 }) }).position(1.86, 0.5, -0.85).scale(0.44))
      .add(lights.ambient({ intensity: 0.22, color: "#edf4ff" }))
      .add(lights.point({ name: "large material softbox", position: [-1.8, 2.35, 2.25], color: "#f4f8ff", intensity: 2.45 }))
      .add(lights.point({ name: "material rim", position: [2.2, 1.6, 0.4], color: "#ffc98f", intensity: 1.2 }))
      .add(effects.bloom({ intensity: 0.2, color: "#f4f8ff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.perspective({ position: [0.15, 1.35, 4.1], target: [0.25, 0.45, -0.75], fov: 43 }))
      .timeline(timeline.loop({ seconds: 8 }))
} as const;

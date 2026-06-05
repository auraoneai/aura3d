import { camera, effects, game, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "../aura-assets";
import { createFighterAuraRing, createFighterNode, type AuraClashTypedFighterAsset } from "./createFighterNodes";

export interface FightSceneFighterInput {
  name: string;
  asset: AuraClashTypedFighterAsset;
  x: number;
  y?: number;
  facing: -1 | 1;
  animation: string;
  attacking?: boolean;
}

export function createFightScene(options: {
  player: FightSceneFighterInput;
  opponent: FightSceneFighterInput;
  specialActive?: boolean;
  impactActive?: boolean;
  reducedMotion?: boolean;
}) {
  const centerAura = material.emissive({ color: "#d7fff0", emissive: "#d7fff0" });
  const shake = options.specialActive ? 0.08 : options.impactActive ? 0.035 : 0;

  return scene()
    .background("#020806")
    .add(model(assets.auraClashDuelStage, { name: "Aura Clash duel stage", receiveShadow: true }).position(0, -0.16, 0.12).scale(1.38))
    .add(createFighterNode({ ...options.player, auraColor: "#00ffbf", runtimeNodeId: "aura-clash-player-fighter", runtimeTags: ["fighter", "player", "typed-glb", `asset:${options.player.asset}`] }))
    .add(createFighterNode({ ...options.opponent, auraColor: "#ffbd4f", runtimeNodeId: "aura-clash-rival-fighter", runtimeTags: ["fighter", "opponent", "typed-glb", `asset:${options.opponent.asset}`] }))
    .add(createFighterAuraRing({ x: options.player.x, color: "#00ffbf", attacking: options.player.attacking, runtimeNodeId: "aura-clash-player-aura-ring", runtimeTags: ["runtime-vfx", "player"] }))
    .add(createFighterAuraRing({ x: options.opponent.x, color: "#ffbd4f", attacking: options.opponent.attacking, runtimeNodeId: "aura-clash-rival-aura-ring", runtimeTags: ["runtime-vfx", "opponent"] }))
    .add(primitives.torus({ name: "center hit spark ring", material: centerAura }).position(0, options.impactActive ? 0.74 : 0.48, 0.12).rotate(Math.PI / 2, 0, 0).scale([options.specialActive ? 0.36 : options.impactActive ? 0.24 : 0.14, options.specialActive ? 0.36 : options.impactActive ? 0.24 : 0.14, 0.012]).animate({ clip: "turntable", speed: options.specialActive ? 8.8 : 4.4 }).runtime(game.runtimeNode("aura-clash-center-impact-ring", { tags: ["runtime-vfx", "hitbox-evidence"] })))
    .add(lights.ambient({ name: "low emerald arena ambience", intensity: 0.22, color: "#83ffd3" }))
    .add(lights.directional({ name: "high rooftop key light", position: [1.2, 3.8, 4.6], intensity: 1.75, color: "#f3fff8" }))
    .add(effects.fog({ name: "neon rooftop atmospheric depth", density: 0.032, color: "#08251b" }))
    .add(effects.bloom({ name: "controlled aura signage bloom", intensity: options.specialActive ? 0.38 : 0.28, color: "#00ff9f", threshold: 0.78, radius: 0.28, maxIntensity: 0.38 }))
    .camera(camera.perspective({ position: [options.reducedMotion ? 0 : shake, 0.82 + (options.reducedMotion ? 0 : shake), 4.65], target: [0, 0.58, 0.12], fov: options.specialActive ? 34 : 32 }));
}

import { game, material, model, primitives } from "@aura3d/engine";
import { assets } from "../aura-assets";

export type AuraClashTypedFighterAsset =
  | "fighterMaraVolt"
  | "fighterRookAtlas"
  | "fighterNyxVale"
  | "fighterKadeEmber"
  | "fighterSableIron"
  | "fighterJinFlux";

const assetByKey = {
  fighterMaraVolt: assets.fighterMaraVolt,
  fighterRookAtlas: assets.fighterRookAtlas,
  fighterNyxVale: assets.fighterNyxVale,
  fighterKadeEmber: assets.fighterKadeEmber,
  fighterSableIron: assets.fighterSableIron,
  fighterJinFlux: assets.fighterJinFlux,
} as const;

export function createFighterNode(options: {
  asset: AuraClashTypedFighterAsset;
  name: string;
  x: number;
  y?: number;
  z?: number;
  facing: -1 | 1;
  animation: string;
  auraColor: string;
  runtimeNodeId?: string;
  runtimeTags?: readonly string[];
}) {
  return model(assetByKey[options.asset], {
    name: `Aura Clash fighter ${options.name} ${options.animation}`,
    castShadow: true,
    receiveShadow: true,
  })
    .position(options.x, options.y ?? 0.02, options.z ?? 0.18)
    .rotate(0, options.facing > 0 ? 0.22 : -0.22, 0)
    .scale(options.animation === "special" ? 0.62 : 0.55)
    .animate({ clip: "float", speed: options.animation === "idle" ? 3.2 : 6.2, duration: 0.72 })
    .runtime(game.runtimeNode(options.runtimeNodeId ?? runtimeIdFor(options.name, "fighter"), {
      tags: options.runtimeTags ?? ["fighter", "typed-glb", `asset:${options.asset}`],
    }));
}

export function createFighterAuraRing(options: { x: number; color: string; attacking?: boolean; runtimeNodeId?: string; runtimeTags?: readonly string[] }) {
  const aura = material.emissive({ color: options.color, emissive: options.color });
  return primitives.torus({ name: "fighter aura foot ring", material: aura })
    .position(options.x, 0.035, 0.16)
    .rotate(Math.PI / 2, 0, 0)
    .scale([options.attacking ? 0.44 : 0.34, options.attacking ? 0.44 : 0.34, 0.018])
    .animate({ clip: "turntable", speed: options.attacking ? 6.4 : 2.6 })
    .runtime(game.runtimeNode(options.runtimeNodeId ?? runtimeIdFor(`${options.color}-${options.x}`, "aura-ring"), {
      tags: options.runtimeTags ?? ["runtime-vfx", "fighter"],
    }));
}

function runtimeIdFor(name: string, suffix: string): string {
  return `aura-clash-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${suffix}`;
}

import {
  AnimationController,
  type AuraAssetRef,
  type AuraNamedAnimationClipDefinition,
  game,
  material,
  model,
  primitives
} from "@aura3d/engine";

export type FighterId = "player" | "rival";
export type FighterAssetKey = "playerFighter" | "rivalFighter";
export type FighterClip = "idle" | "walk" | "jump" | "dash" | "guard" | "light" | "heavy" | "special" | "hitstun";

export type TypedFighterAssets = Partial<Record<FighterAssetKey, AuraAssetRef<"model">>>;

export interface ResolvedFighterAssets {
  readonly typedFighterAssets: TypedFighterAssets;
  readonly missingFighterAssets: readonly FighterAssetKey[];
  readonly typedFighterAssetCount: number;
}

export const REQUIRED_FIGHTER_ASSETS: readonly FighterAssetKey[] = ["playerFighter", "rivalFighter"];
export const REQUIRED_FIGHTER_CLIPS: readonly FighterClip[] = [
  "idle",
  "walk",
  "jump",
  "dash",
  "guard",
  "light",
  "heavy",
  "special",
  "hitstun"
];

export const publicAssetInstructions = [
  "npx @aura3d/cli@latest assets add ./assets/player-fighter.glb --name playerFighter",
  "npx @aura3d/cli@latest assets add ./assets/rival-fighter.glb --name rivalFighter",
  "npx @aura3d/cli@latest assets validate-game"
] as const;

export const fighterAnimationClips: readonly AuraNamedAnimationClipDefinition<FighterClip>[] = REQUIRED_FIGHTER_CLIPS.map((id) => ({
  id,
  duration: animationDuration(id),
  frameRate: 60,
  loop: id === "idle" || id === "walk" || id === "guard" || id === "jump",
  layer: animationLayer(id),
  layerMetadata: {
    id: animationLayer(id),
    role: id === "light" || id === "heavy" || id === "special" ? "attack" : "base",
    bodyMask: id === "light" || id === "heavy" || id === "special" ? "upper-body" : "full-body",
    restartFromFrameZero: id === "light" || id === "heavy" || id === "special" || id === "dash"
  },
  restartFromFrameZero: id === "light" || id === "heavy" || id === "special" || id === "dash",
  suppressRootMotion: true,
  attack: id === "light" || id === "heavy" || id === "special",
  tracks: [],
  metadata: {
    source: "fighting-game-template-pose-fallback",
    poseBakedFallback: true,
    suppressRootMotion: true,
    templateReadiness: "source-only"
  }
}));

export function resolveTypedFighterAssets(assetManifest: TypedFighterAssets): ResolvedFighterAssets {
  const typedFighterAssets: TypedFighterAssets = {
    playerFighter: assetManifest.playerFighter,
    rivalFighter: assetManifest.rivalFighter
  };
  const missingFighterAssets = REQUIRED_FIGHTER_ASSETS.filter((key) => !typedFighterAssets[key]);
  return {
    typedFighterAssets,
    missingFighterAssets,
    typedFighterAssetCount: REQUIRED_FIGHTER_ASSETS.length - missingFighterAssets.length
  };
}

export function createFighterAnimationController(
  id: FighterId,
  asset?: AuraAssetRef<"model">
): AnimationController<FighterClip> {
  return new AnimationController<FighterClip>({
    id: `${id}-animation-controller`,
    ...(asset ? { clipRegistry: asset } : {}),
    clips: fighterAnimationClips,
    requiredClips: REQUIRED_FIGHTER_CLIPS,
    suppressRootMotion: true,
    layers: [
      { id: "base", role: "base", bodyMask: "full-body" },
      { id: "upper-body", role: "attack", bodyMask: "upper-body", restartFromFrameZero: true }
    ]
  });
}

export function createFighterNode(
  id: FighterId,
  assetKey: FighterAssetKey,
  label: string,
  position: readonly [number, number, number],
  facing: 1 | -1,
  color: string,
  typedFighterAssets: TypedFighterAssets
) {
  const asset = typedFighterAssets[assetKey];
  const runtime = game.runtimeNode(id, {
    tags: ["fighter", id, asset ? "typed-asset" : "source-placeholder"]
  });

  if (asset) {
    return model(asset, { name: label })
      .position(position[0], position[1], position[2])
      .rotate(0, facing < 0 ? Math.PI : 0, 0)
      .scale(0.72)
      .runtime(runtime);
  }

  return primitives
    .capsule({
      name: `${label} source placeholder - add ${assetKey} with the Aura3D CLI`,
      material: material.pbr({ color, roughness: 0.62 })
    })
    .position(position[0], position[1] + 0.82, position[2])
    .rotate(0, facing < 0 ? Math.PI : 0, 0)
    .scale([0.34, 0.74, 0.34])
    .runtime(runtime);
}

export function isLoopingFighterClip(clip: FighterClip): boolean {
  return clip === "idle" || clip === "walk" || clip === "guard" || clip === "jump";
}

export function animationLayer(clip: FighterClip): "base" | "upper-body" {
  return clip === "light" || clip === "heavy" || clip === "special" ? "upper-body" : "base";
}

function animationDuration(clip: FighterClip): number {
  switch (clip) {
    case "light":
      return 0.28;
    case "heavy":
      return 0.46;
    case "special":
      return 0.72;
    case "dash":
      return 0.22;
    case "hitstun":
      return 0.34;
    default:
      return 1;
  }
}

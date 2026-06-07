import { compilePromptEpisodePlan, type AuraAssetRef } from "@aura3d/engine";
import { assets } from "./aura-assets";
import { AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID } from "./contract";

export const episodeContractId = AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID;

export type CartoonAssetKey = "miko" | "luma" | "glowBroom" | "glowStones" | "moonLilies";

type TypedCartoonAssets = Partial<Record<CartoonAssetKey, AuraAssetRef<"model">>>;

const typedCartoonAssets = assets as TypedCartoonAssets;

export const requiredCartoonCharacterAssets = ["miko", "luma"] as const;
export const optionalCartoonPropAssets = ["glowBroom", "glowStones", "moonLilies"] as const;
export const publicCartoonAssetInstructions = [
  "npx @aura3d/cli@latest assets add ./assets/miko.glb --name miko",
  "npx @aura3d/cli@latest assets add ./assets/luma.glb --name luma",
  "npx @aura3d/cli@latest assets validate-cartoon"
] as const;

export const missingCartoonCharacterAssets = requiredCartoonCharacterAssets.filter((key) => !typedCartoonAssets[key]);
export const typedCartoonAssetSummary = {
  requiredCharacterAssets: requiredCartoonCharacterAssets,
  optionalPropAssets: optionalCartoonPropAssets,
  typedCharacterAssetCount: requiredCartoonCharacterAssets.length - missingCartoonCharacterAssets.length,
  missingCharacterAssets: missingCartoonCharacterAssets
} as const;

function typedAsset(key: CartoonAssetKey): AuraAssetRef<"model"> | undefined {
  return typedCartoonAssets[key];
}

export const youtubeDraftMetadata = {
  contractId: episodeContractId,
  title: "Moon Garden Cleanup | Aura3D Cartoon Studio",
  description: "Two tiny robots clean a glowing moon garden with soft captions and reduced-flash visuals.",
  tags: ["Aura3D", "kids cartoon", "moon garden", "robots"],
  madeForKids: true,
  thumbnailCaptureTime: 10,
  defaultLanguage: "en",
  privacyStatus: "private"
} as const;

export const episodeAudioCues = [
  {
    id: "music:moon-garden-lullaby",
    role: "music",
    path: "assets/audio/music/moon-garden-lullaby-loop.wav",
    startTime: 0,
    duration: 60,
    gainDb: -18,
    ducking: "under-dialogue"
  },
  {
    id: "ambience:moon-garden-night",
    role: "ambience",
    path: "assets/audio/ambience/moon-garden-night.wav",
    startTime: 0,
    duration: 60,
    gainDb: -22,
    ducking: "none"
  },
  {
    id: "sfx:glow-stone-chime",
    role: "sfx",
    path: "assets/audio/sfx/glow-stone-chime.wav",
    startTime: 38.5,
    duration: 1.25,
    gainDb: -9,
    ducking: "none"
  }
] as const;

export const episodeSampleDescription = {
  contractId: episodeContractId,
  runtimeSeconds: 60,
  shotCount: 3,
  speakingCharacters: ["miko", "luma"],
  captionSource: "captions are derived one-to-one from the AuraVoice dialogue track",
  performanceSource: "body, facial, gesture, blocking, and gaze cues are generated from the cartoon director",
  musicAmbience: ["music:moon-garden-lullaby", "ambience:moon-garden-night"],
  sfxCue: "sfx:glow-stone-chime",
  thumbnailCaptureTime: youtubeDraftMetadata.thumbnailCaptureTime,
  thumbnailSource: "same Aura3D scene state and AuraVoice timestamp as the render queue capture",
  typedAssetSource: "./src/aura-assets",
  requiredTypedAssets: requiredCartoonCharacterAssets,
  missingTypedAssets: missingCartoonCharacterAssets,
  assetCommands: publicCartoonAssetInstructions,
  reviewPackageRequiredPaths: ["video", "captions", "thumbnail", "timeline", "audio-stems", "evidence-json", "youtube-draft-metadata"],
  accessibilityProof: ["captions", "reduced motion", "high contrast"]
} as const;

export const episode = compilePromptEpisodePlan({
  episodeId: "moon-garden-cleanup-001",
  title: "Moon Garden Cleanup",
  prompt: "Two tiny robots clean a glowing moon garden.",
  language: "en",
  runtime: {
    duration: 60,
    frameRate: 30,
    resolution: { width: 1920, height: 1080 },
    aspectRatio: "16:9",
    reducedMotion: true,
    highContrast: true,
    maxTimingDriftFrames: 1
  },
  route: "/",
  characters: [
    {
      id: "miko",
      name: "Miko",
      role: "hero",
      voiceId: "auravoice-miko-soft",
      style: "round cyan robot",
      ...(typedAsset("miko") ? { asset: typedAsset("miko") } : {})
    },
    {
      id: "luma",
      name: "Luma",
      role: "sidekick",
      voiceId: "auravoice-luma-bright",
      style: "small gold garden helper",
      ...(typedAsset("luma") ? { asset: typedAsset("luma") } : {})
    }
  ],
  locations: [
    {
      id: "moon-garden",
      name: "Moon Garden",
      description: "A tiny crater garden with glowing pebbles, sleepy flowers, and a blue planet skyline.",
      mood: "soft neon bedtime"
    }
  ],
  props: [
    {
      id: "glow-broom",
      name: "Glow Broom",
      role: "hero-prop",
      description: "A soft crescent broom that sweeps moon dust without sharp motion.",
      ownerCharacterId: "miko",
      locationId: "moon-garden",
      ...(typedAsset("glowBroom") ? { asset: typedAsset("glowBroom") } : {}),
      primitiveFallback: "thin rounded cylinder handle with a crescent brush head",
      styleNotes: ["cyan rim light", "oversized safe silhouette"],
      safetyNotes: ["not a weapon", "slow sweeping arcs only"]
    },
    {
      id: "glow-stones",
      name: "Glow Stones",
      role: "interactive",
      description: "Small moon pebbles that pulse gently after cleanup.",
      locationId: "moon-garden",
      ...(typedAsset("glowStones") ? { asset: typedAsset("glowStones") } : {}),
      primitiveFallback: "small low-poly spheres with bloom",
      styleNotes: ["warm yellow glow", "reduced-flash pulse"],
      safetyNotes: ["no rapid flashing"]
    },
    {
      id: "moon-lilies",
      name: "Moon Lilies",
      role: "set-dressing",
      description: "Sleepy flowers that brighten when the garden is clean.",
      locationId: "moon-garden",
      ...(typedAsset("moonLilies") ? { asset: typedAsset("moonLilies") } : {}),
      primitiveFallback: "rounded petal cards around tiny stems",
      styleNotes: ["soft white petals", "blue shadow edges"]
    }
  ],
  styleGuide: {
    visualStyle: "rounded bedtime sci-fi cartoon with toy-like robot silhouettes",
    palette: ["#081b2a", "#7de2ff", "#ffe18e", "#40ffbf", "#f8fff2"],
    shapeLanguage: "circles, capsules, crescent props, and chunky moon-garden forms",
    lighting: "soft blue night key, warm prop glows, no hard flashes",
    cameraLanguage: "wide establishing shot, medium teamwork shot, gentle final push-in, cuts only at shot boundaries",
    motionRules: [
      "Keep brooms, waves, and glow pulses reduced-motion safe.",
      "Mouth cards and GLB blendshapes sample AuraVoice visemes at the same frame rate as captions.",
      "Do not change storyboard, shot, line, caption, or character ids during dubbing."
    ],
    captionStyle: "bottom-center high-contrast rounded plate with line-safe captions",
    continuityRules: [
      "Miko stays cyan on screen-left unless shot blocking explicitly moves them.",
      "Luma stays warm gold on screen-right unless shot blocking explicitly moves them.",
      "Glow stones brighten only after the teamwork shot begins."
    ]
  },
  continuityRules: [
    "Story bible ids, shot ids, caption ids, and AuraVoice line ids stay stable across language dubs.",
    "Props can upgrade to typed GLBs only through generated ./aura-assets imports."
  ],
  safety: {
    childSafe: true,
    captionRequired: true,
    reducedMotionDefault: true,
    highContrastDefault: true,
    flashing: "reduced"
  },
  beats: [
    {
      id: "beat-open",
      sceneId: "storyboard-moon-garden",
      shotId: "shot-moon-garden-open",
      locationId: "moon-garden",
      summary: "Miko notices moon dust dimming the garden lights.",
      visualIntent: "Wide moon-garden reveal with two robot silhouettes and readable bottom captions.",
      duration: 20,
      characters: ["miko", "luma"],
      props: ["moon-lilies", "glow-stones"],
      gestureByCharacterId: { miko: "gentle-point", luma: "soft-nod" },
      blockingByCharacterId: {
        miko: { position: [-0.8, 0.75, 0], layer: "midground" },
        luma: { position: [0.8, 0.72, 0], layer: "midground" }
      },
      dialogue: [
        {
          speakerId: "miko",
          text: "Luma, the moon lilies are losing their sparkle.",
          emotion: "concerned",
          delivery: "natural",
          audioFile: "assets/audio/en/shot-moon-garden-open-line-1.wav"
        },
        {
          speakerId: "luma",
          text: "Then we sweep softly and wake the glow stones.",
          emotion: "happy",
          delivery: "slow",
          audioFile: "assets/audio/en/shot-moon-garden-open-line-2.wav"
        }
      ]
    },
    {
      id: "beat-teamwork",
      sceneId: "storyboard-moon-garden",
      shotId: "shot-glow-stone-teamwork",
      locationId: "moon-garden",
      summary: "The robots clean in rhythm while the glow stones pulse back on.",
      visualIntent: "Medium two-shot with gentle broom arcs, stable character ids, and no flashing.",
      duration: 22,
      characters: ["miko", "luma"],
      props: ["glow-broom", "glow-stones"],
      gestureByCharacterId: { miko: "curious-lean", luma: "small-wave" },
      blockingByCharacterId: {
        miko: { position: [-0.55, 0.75, 0.05], layer: "foreground" },
        luma: { position: [0.62, 0.72, -0.02], layer: "foreground" }
      },
      dialogue: [
        {
          speakerId: "miko",
          text: "I will polish the blue stones one tiny circle at a time.",
          emotion: "curious",
          delivery: "natural",
          audioFile: "assets/audio/en/shot-glow-stone-teamwork-line-1.wav"
        },
        {
          speakerId: "luma",
          text: "And I will hum the garden's sleepy cleanup song.",
          emotion: "happy",
          delivery: "sing-song",
          audioFile: "assets/audio/en/shot-glow-stone-teamwork-line-2.wav"
        }
      ]
    },
    {
      id: "beat-finish",
      sceneId: "storyboard-moon-garden",
      shotId: "shot-moon-garden-finish",
      locationId: "moon-garden",
      summary: "The moon garden glows again and the robots wave goodnight.",
      visualIntent: "Soft push-in to a finished garden, thumbnail-safe framing, and final caption hold.",
      duration: 18,
      characters: ["miko", "luma"],
      props: ["moon-lilies", "glow-stones"],
      gestureByCharacterId: { miko: "small-wave", luma: "two-hand-wave" },
      blockingByCharacterId: {
        miko: { position: [-0.65, 0.75, 0], layer: "midground" },
        luma: { position: [0.68, 0.72, 0], layer: "midground" }
      },
      dialogue: [
        {
          speakerId: "luma",
          text: "The moon lilies are twinkling again.",
          emotion: "excited",
          delivery: "natural",
          audioFile: "assets/audio/en/shot-moon-garden-finish-line-1.wav"
        },
        {
          speakerId: "miko",
          text: "Goodnight, little garden. Keep glowing.",
          emotion: "happy",
          delivery: "slow",
          audioFile: "assets/audio/en/shot-moon-garden-finish-line-2.wav"
        }
      ]
    }
  ],
  generatedAt: "2026-06-03T00:00:00.000Z"
});

export const storyBible = episode.storyBible;
export const shotList = storyBible.shotList;

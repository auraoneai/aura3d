import type { AuraAssetRef } from "./index.js";
import {
  createPromptAnimationEpisodePlan,
  createPromptAnimationStoryBible,
  promptAnimationContractVersion,
  type PromptAnimationAccessibilityProofMetadata,
  type PromptAnimationCharacter,
  type PromptAnimationEpisodePlan,
  type PromptAnimationId,
  type PromptAnimationLanguageCode,
  type PromptAnimationLocation,
  type PromptAnimationProp,
  type PromptAnimationRuntimeSpec,
  type PromptAnimationSafetyMetadata,
  type PromptAnimationSeconds,
  type PromptAnimationShotListItem,
  type PromptAnimationStoryboard,
  type PromptAnimationStoryBible,
  type PromptAnimationStyleGuide
} from "./PromptAnimationContract.js";
import {
  createAnimationPerformance,
  resolveAnimationEmotionPose,
  resolveAnimationGesture,
  type AnimationPerformanceArtifact,
  type AnimationPerformanceCue,
  type AnimationPerformanceGestureState
} from "./AnimationPerformance.js";
import {
  createDialogueTrack,
  deriveCaptionTrackFromDialogue,
  type CaptionTrackArtifact,
  type DialogueLine,
  type DialogueTrackArtifact
} from "./DialoguePerformance.js";
import {
  createAnimationRenderOutputPackageMetadata,
  createAnimationRenderQueue,
  type AnimationRenderOutputPackageMetadata,
  type AnimationRenderQueueArtifact,
  type AnimationViewport
} from "./AnimationRenderQueue.js";
import { createShotTimeline, type ShotTimelineArtifact, type ShotTimelineShot } from "./ShotTimeline.js";

export interface AnimationDirectorCharacterInput {
  readonly id: PromptAnimationId;
  readonly name: string;
  readonly role?: PromptAnimationCharacter["role"] | undefined;
  readonly voiceId?: string | undefined;
  readonly asset?: AuraAssetRef<"model"> | undefined;
  readonly style?: string | undefined;
}

export interface AnimationDirectorLocationInput {
  readonly id: PromptAnimationId;
  readonly name: string;
  readonly description?: string | undefined;
  readonly mood?: string | undefined;
}

export interface AnimationDirectorPropInput {
  readonly id: PromptAnimationId;
  readonly name: string;
  readonly role?: PromptAnimationProp["role"] | undefined;
  readonly description?: string | undefined;
  readonly ownerCharacterId?: PromptAnimationId | undefined;
  readonly locationId?: PromptAnimationId | undefined;
  readonly asset?: AuraAssetRef<"model"> | undefined;
  readonly primitiveFallback?: string | undefined;
  readonly styleNotes?: readonly string[] | undefined;
  readonly safetyNotes?: readonly string[] | undefined;
}

export interface AnimationDirectorDialogueInput {
  readonly speakerId: PromptAnimationId;
  readonly text: string;
  readonly emotion?: string | undefined;
  readonly delivery?: string | undefined;
  readonly audioFile?: string | undefined;
}

export interface AnimationDirectorBeatInput {
  readonly id: PromptAnimationId;
  readonly sceneId?: PromptAnimationId | undefined;
  readonly shotId?: PromptAnimationId | undefined;
  readonly locationId: PromptAnimationId;
  readonly summary: string;
  readonly visualIntent: string;
  readonly duration?: PromptAnimationSeconds | undefined;
  readonly characters: readonly PromptAnimationId[];
  readonly props?: readonly PromptAnimationId[] | undefined;
  readonly dialogue?: readonly AnimationDirectorDialogueInput[] | undefined;
  readonly mood?: string | undefined;
  readonly gestureByCharacterId?: Record<string, PromptAnimationId> | undefined;
  readonly blockingByCharacterId?: Record<string, { readonly position?: readonly [number, number, number] | undefined; readonly layer?: string | undefined }> | undefined;
}

export interface AnimationDirectorInput {
  readonly episodeId: PromptAnimationId;
  readonly title: string;
  readonly prompt: string;
  readonly language: PromptAnimationLanguageCode;
  readonly runtime: PromptAnimationRuntimeSpec;
  readonly characters: readonly AnimationDirectorCharacterInput[];
  readonly locations: readonly AnimationDirectorLocationInput[];
  readonly props?: readonly AnimationDirectorPropInput[] | undefined;
  readonly styleGuide?: Partial<PromptAnimationStyleGuide> | undefined;
  readonly continuityRules?: readonly string[] | undefined;
  readonly beats: readonly AnimationDirectorBeatInput[];
  readonly safety?: Partial<PromptAnimationSafetyMetadata> | undefined;
  readonly accessibilityProof?: PromptAnimationAccessibilityProofMetadata | undefined;
  readonly route?: string | undefined;
  readonly viewport?: AnimationViewport | undefined;
  readonly generatedAt?: string | undefined;
}

export interface AnimationDirectorPlan {
  readonly kind: "animation-director-plan";
  readonly episodePlan: PromptAnimationEpisodePlan;
  readonly storyBible: PromptAnimationStoryBible;
  readonly storyboard: PromptAnimationStoryboard;
  readonly shotTimeline: ShotTimelineArtifact;
  readonly dialogueTrack: DialogueTrackArtifact;
  readonly captionTrack: CaptionTrackArtifact;
  readonly performance: AnimationPerformanceArtifact;
  readonly renderQueue: AnimationRenderQueueArtifact;
  readonly renderOutputPackage: AnimationRenderOutputPackageMetadata;
  readonly assetSlots: readonly AnimationDirectorAssetSlot[];
  readonly motionRequirements: readonly AnimationDirectorMotionRequirement[];
  readonly reviewGates: readonly AnimationDirectorReviewGate[];
}

export interface AnimationDirectorAssetSlot {
  readonly id: PromptAnimationId;
  readonly kind: "character" | "location" | "prop";
  readonly required: boolean;
  readonly assetId?: string | undefined;
  readonly readiness: "typed-asset" | "needs-asset" | "primitive-fallback";
  readonly requirements: readonly string[];
}

export interface AnimationDirectorMotionRequirement {
  readonly id: PromptAnimationId;
  readonly targetId: PromptAnimationId;
  readonly kind: "body" | "mouth" | "gesture" | "camera" | "caption";
  readonly required: boolean;
  readonly evidence: string;
}

export interface AnimationDirectorReviewGate {
  readonly id: PromptAnimationId;
  readonly required: boolean;
  readonly status: "pending" | "pass";
  readonly detail: string;
}

export function defineAnimationDirectorPlan<const TPlan extends AnimationDirectorPlan>(plan: TPlan): TPlan {
  return plan;
}

export function createAnimationDirectorPlan(input: AnimationDirectorInput): AnimationDirectorPlan {
  const characters = input.characters.map((character): PromptAnimationCharacter => ({
    id: character.id,
    name: character.name,
    role: character.role ?? "hero",
    ...(character.voiceId ? { voiceId: character.voiceId } : {}),
    language: input.language,
    ...(character.style ? { style: character.style } : {}),
    rig: {
      ...(character.asset ? { asset: character.asset } : {}),
      facing: "camera",
      scale: 1,
      mouthFallback: character.asset ? "blendshape" : "primitive-mouth-card"
    }
  }));

  const locations = input.locations.map((location): PromptAnimationLocation => ({
    id: location.id,
    name: location.name,
    ...(location.description ? { description: location.description } : {}),
    ...(location.mood ? { mood: location.mood } : {})
  }));

  const props = (input.props ?? []).map((prop): PromptAnimationProp => ({
    id: prop.id,
    name: prop.name,
    role: prop.role ?? "set-dressing",
    ...(prop.description ? { description: prop.description } : {}),
    ...(prop.ownerCharacterId ? { ownerCharacterId: prop.ownerCharacterId } : {}),
    ...(prop.locationId ? { locationId: prop.locationId } : {}),
    ...(prop.asset ? { asset: prop.asset } : {}),
    ...(prop.primitiveFallback ? { primitiveFallback: prop.primitiveFallback } : {}),
    ...(prop.styleNotes ? { styleNotes: prop.styleNotes } : {}),
    ...(prop.safetyNotes ? { safetyNotes: prop.safetyNotes } : {})
  }));

  const episodePlan = createPromptAnimationEpisodePlan({
    episodeId: input.episodeId,
    title: input.title,
    language: input.language,
    runtime: input.runtime,
    characters,
    locations,
    production: {
      sourcePrompt: input.prompt,
      target: "youtube",
      reviewStatus: "draft"
    },
    safety: input.safety,
    accessibilityProof: input.accessibilityProof,
    generatedAt: input.generatedAt
  });

  const beatDuration = input.beats.length > 0 ? input.runtime.duration / input.beats.length : input.runtime.duration;
  let cursor = 0;
  const shots: ShotTimelineShot[] = [];
  const dialogueLines: DialogueLine[] = [];
  const performanceCues: AnimationPerformanceCue[] = [];

  for (const [index, beat] of input.beats.entries()) {
    const duration = beat.duration ?? beatDuration;
    const startTime = cursor;
    const endTime = cursor + duration;
    const sceneId = beat.sceneId ?? `scene-${index + 1}`;
    const shotId = beat.shotId ?? `shot-${index + 1}`;
    const midpoint = startTime + duration / 2;

    shots.push({
      id: shotId,
      shotId,
      sceneId,
      startTime,
      endTime,
      transitionIn: index === 0 ? "cut" : "match-cut",
      transitionOut: "cut",
      camera: {
        move: index % 3 === 0 ? "push-in" : "static",
        notes: [beat.visualIntent]
      },
      characters: beat.characters.map((characterId) => ({
        characterId,
        ...(beat.blockingByCharacterId?.[characterId]?.position
          ? { position: beat.blockingByCharacterId[characterId].position }
          : { position: defaultCharacterBlockingPosition(beat.characters.indexOf(characterId), beat.characters.length) }),
        action: beat.dialogue?.some((line) => line.speakerId === characterId) ? "speak" : "listen",
        facing: "camera",
        emotion: beat.dialogue?.find((line) => line.speakerId === characterId)?.emotion ?? "neutral",
        pose: resolveAnimationEmotionPose(beat.dialogue?.find((line) => line.speakerId === characterId)?.emotion).id,
        gestureId: beat.gestureByCharacterId?.[characterId]
      })),
      ...(beat.props
        ? {
            props: beat.props.map((propId) => ({
              propId,
              visible: true,
              action: "storyboard-required"
            }))
          }
        : {}),
      captureTimes: [startTime, midpoint],
      ...(beat.dialogue && beat.dialogue.length > 0
        ? { captions: beat.dialogue.map((_, lineIndex) => `${shotId}:line-${lineIndex + 1}:caption`) }
        : {}),
      intent: beat.visualIntent
    });

    const dialogue = beat.dialogue ?? [];
    const lineDuration = dialogue.length > 0 ? duration / dialogue.length : 0;
    dialogue.forEach((line, lineIndex) => {
      const lineStart = startTime + lineDuration * lineIndex;
      const lineEnd = lineIndex === dialogue.length - 1 ? endTime : lineStart + lineDuration;
      const lineId = `${shotId}:line-${lineIndex + 1}`;
      dialogueLines.push({
        lineId,
        speakerId: line.speakerId,
        text: line.text,
        language: input.language,
        ...(line.audioFile ? { audioFile: line.audioFile } : {}),
        startTime: lineStart,
        endTime: lineEnd,
        emotion: line.emotion ?? "neutral",
        delivery: line.delivery ?? "natural",
        direction: beat.summary
      });
      performanceCues.push({
        id: `${lineId}:speak`,
        shotId,
        characterId: line.speakerId,
        lineId,
        startTime: lineStart,
        endTime: lineEnd,
        action: "speak",
        emotion: line.emotion ?? "neutral",
        emotionPoseId: resolveAnimationEmotionPose(line.emotion ?? "neutral").id,
        intensity: line.emotion === "excited" ? 1 : 0.66,
        body: resolveAnimationEmotionPose(line.emotion ?? "neutral").body,
        facial: resolveAnimationEmotionPose(line.emotion ?? "neutral").facial,
        gestureId: beat.gestureByCharacterId?.[line.speakerId] ?? defaultGestureForEmotion(line.emotion),
        ...(createCueGestureState(beat.gestureByCharacterId?.[line.speakerId] ?? defaultGestureForEmotion(line.emotion))
          ? { gesture: createCueGestureState(beat.gestureByCharacterId?.[line.speakerId] ?? defaultGestureForEmotion(line.emotion)) }
          : {}),
        blocking: {
          position:
            beat.blockingByCharacterId?.[line.speakerId]?.position ??
            defaultCharacterBlockingPosition(beat.characters.indexOf(line.speakerId), beat.characters.length),
          visible: true,
          layer: beat.blockingByCharacterId?.[line.speakerId]?.layer ?? "midground"
        },
        gaze: {
          mode: "listener",
          targetId: beat.characters.find((characterId) => characterId !== line.speakerId),
          intensity: 0.72
        },
        notes: [line.delivery ?? "natural"]
      });
    });

    for (const characterId of beat.characters) {
      if (dialogue.some((line) => line.speakerId === characterId)) continue;
      const listenPose = resolveAnimationEmotionPose(beat.mood === "soft neon bedtime" ? "happy" : "neutral");
      performanceCues.push({
        id: `${shotId}:${characterId}:listen`,
        shotId,
        characterId,
        startTime,
        endTime,
        action: "listen",
        emotion: listenPose.emotion,
        emotionPoseId: listenPose.id,
        intensity: 0.45,
        body: listenPose.body,
        facial: listenPose.facial,
        gestureId: beat.gestureByCharacterId?.[characterId] ?? "soft-nod",
        gesture: resolveAnimationGesture(beat.gestureByCharacterId?.[characterId] ?? "soft-nod")?.gesture,
        blocking: {
          position:
            beat.blockingByCharacterId?.[characterId]?.position ??
            defaultCharacterBlockingPosition(beat.characters.indexOf(characterId), beat.characters.length),
          visible: true,
          layer: beat.blockingByCharacterId?.[characterId]?.layer ?? "midground"
        },
        gaze: {
          mode: "speaker",
          targetId: dialogue[0]?.speakerId,
          intensity: 0.58
        },
        notes: [`Listening during ${beat.summary}`]
      });
    }

    cursor = endTime;
  }

  const storyboard: PromptAnimationStoryboard = {
    artifact: "storyboard",
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    title: input.title,
    scenes: input.beats.map((beat, index) => {
      const sceneId = beat.sceneId ?? `scene-${index + 1}`;
      const shotId = beat.shotId ?? `shot-${index + 1}`;
      return {
        id: sceneId,
        sceneId,
        locationId: beat.locationId,
        storyBeat: beat.summary,
        ...(beat.mood ? { mood: beat.mood } : {}),
        shots: [
          {
            id: shotId,
            shotId,
            storyBeat: beat.summary,
            characters: beat.characters,
            ...(beat.props ? { props: beat.props } : {}),
            ...(beat.mood ? { mood: beat.mood } : {}),
            visualIntent: beat.visualIntent,
            ...(beat.duration ? { suggestedDuration: beat.duration } : {})
          }
        ]
      };
    }),
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };

  const shotTimeline = createShotTimeline({
    episodeId: input.episodeId,
    frameRate: input.runtime.frameRate,
    duration: input.runtime.duration,
    shots,
    generatedAt: input.generatedAt
  });
  const dialogueTrack = createDialogueTrack({
    episodeId: input.episodeId,
    language: input.language,
    lines: dialogueLines,
    duration: input.runtime.duration,
    generatedAt: input.generatedAt
  });
  const captionTrack = deriveCaptionTrackFromDialogue(dialogueTrack, { generatedAt: input.generatedAt });
  const performance = createAnimationPerformance({
    episodeId: input.episodeId,
    frameRate: input.runtime.frameRate,
    cues: performanceCues,
    generatedAt: input.generatedAt
  });
  const styleGuide = createAnimationStoryBibleStyleGuide(input.styleGuide);
  const storyBible = createPromptAnimationStoryBible({
    episodeId: input.episodeId,
    title: input.title,
    logline: input.prompt,
    characters,
    locations,
    props,
    styleGuide,
    shotList: shots.map((shot): PromptAnimationShotListItem => {
      const matchingBeat = input.beats.find((beat) => (beat.shotId ?? `shot-${input.beats.indexOf(beat) + 1}`) === shot.shotId);
      return {
        shotId: shot.shotId,
        sceneId: shot.sceneId,
        locationId: matchingBeat?.locationId ?? input.locations[0]?.id ?? "location",
        purpose: shot.intent ?? matchingBeat?.summary ?? shot.shotId,
        characters: shot.characters.map((character) => character.characterId),
        ...(matchingBeat?.props ? { props: matchingBeat.props } : {}),
        startTime: shot.startTime,
        endTime: shot.endTime,
        duration: shot.endTime - shot.startTime,
        camera: shot.camera.move,
        ...(shot.captions ? { captionIds: shot.captions } : {}),
        continuityNotes: [
          `Scene ${shot.sceneId} and shot ${shot.shotId} ids must stay stable across AuraVoice dubbing and rerender passes.`
        ]
      };
    }),
    continuityRules:
      input.continuityRules ??
      [
        "Do not change character ids, storyboard scene ids, shot ids, caption ids, or dialogue line ids during dubbing.",
        "AuraVoice timing artifacts remain the master clock for captions, visemes, audio stems, and render captures.",
        "Primitive fallback props may be replaced by typed GLB assets only through generated ./aura-assets imports."
      ],
    generatedAt: input.generatedAt
  });
  const renderQueue = createAnimationRenderQueue({
    episodePlan,
    shotTimeline,
    route: input.route ?? "/prompt-animation",
    viewport: input.viewport,
    generatedAt: input.generatedAt
  });
  const renderOutputPackage = createAnimationRenderOutputPackageMetadata({
    episodePlan,
    shotTimeline,
    renderQueue,
    generatedAt: input.generatedAt
  });

  return {
    kind: "animation-director-plan",
    episodePlan,
    storyBible,
    storyboard,
    shotTimeline,
    dialogueTrack,
    captionTrack,
    performance,
    renderQueue,
    renderOutputPackage,
    assetSlots: createAnimationDirectorAssetSlots(characters, locations, props),
    motionRequirements: createAnimationDirectorMotionRequirements(shots, dialogueLines, performanceCues),
    reviewGates: createAnimationDirectorReviewGates(renderOutputPackage)
  };
}

export function compilePromptEpisodePlan(input: AnimationDirectorInput): AnimationDirectorPlan {
  return createAnimationDirectorPlan(input);
}

export const animationDirector = {
  compile: compilePromptEpisodePlan,
  createPlan: createAnimationDirectorPlan,
  definePlan: defineAnimationDirectorPlan
} as const;

function createAnimationStoryBibleStyleGuide(input: Partial<PromptAnimationStyleGuide> | undefined): PromptAnimationStyleGuide {
  return {
    visualStyle: input?.visualStyle ?? "rounded bedtime sci-fi animation with readable silhouettes",
    palette: input?.palette ?? ["#081b2a", "#7de2ff", "#ffe18e", "#40ffbf", "#f8fff2"],
    shapeLanguage: input?.shapeLanguage ?? "soft circles, chunky robot forms, oversized safe props, and simple moon-garden silhouettes",
    lighting: input?.lighting ?? "soft high-contrast blue key light with warm prop glows and reduced flash",
    cameraLanguage: input?.cameraLanguage ?? "stable wide and medium shots, gentle push-ins, hard cuts only at shot boundaries",
    motionRules:
      input?.motionRules ??
      [
        "Keep character gestures small enough for reduced-motion playback.",
        "Use app.onFrame shot playback rather than recreating the Aura app per frame.",
        "Captions, visemes, and mouth cards sample from the AuraVoice master clock."
      ],
    captionStyle: input?.captionStyle ?? "bottom-center high-contrast rounded plate with line-safe caption text",
    ...(input?.continuityRules ? { continuityRules: input.continuityRules } : {})
  };
}

function defaultCharacterBlockingPosition(index: number, total: number): readonly [number, number, number] {
  if (total <= 1) return [0, 0.7, 0];
  const spacing = 1.55 / Math.max(1, total - 1);
  return [-0.775 + spacing * index, 0.72, 0];
}

function defaultGestureForEmotion(emotion: string | undefined): PromptAnimationId | undefined {
  if (emotion === "excited") return "two-hand-wave";
  if (emotion === "happy") return "small-wave";
  if (emotion === "curious") return "curious-lean";
  if (emotion === "concerned") return "gentle-point";
  return undefined;
}

function createCueGestureState(gestureId: PromptAnimationId | undefined): AnimationPerformanceGestureState | undefined {
  return resolveAnimationGesture(gestureId)?.gesture;
}

function createAnimationDirectorAssetSlots(
  characters: readonly PromptAnimationCharacter[],
  locations: readonly PromptAnimationLocation[],
  props: readonly PromptAnimationProp[]
): readonly AnimationDirectorAssetSlot[] {
  return [
    ...characters.map((character): AnimationDirectorAssetSlot => ({
      id: character.id,
      kind: "character",
      required: true,
      ...(character.rig.asset?.id ? { assetId: character.rig.asset.id } : {}),
      readiness: character.rig.asset ? "typed-asset" : "primitive-fallback",
      requirements: ["animation-character profile", "mouth or blendshape evidence", "body motion evidence"]
    })),
    ...locations.map((location): AnimationDirectorAssetSlot => ({
      id: location.id,
      kind: "location",
      required: true,
      readiness: location.sceneNodes && location.sceneNodes.length > 0 ? "typed-asset" : "needs-asset",
      requirements: ["animation-set or authored scene nodes", "walkable/composition evidence"]
    })),
    ...props.map((prop): AnimationDirectorAssetSlot => ({
      id: prop.id,
      kind: "prop",
      required: prop.role === "hero-prop" || prop.role === "interactive",
      ...(prop.asset?.id ? { assetId: prop.asset.id } : {}),
      readiness: prop.asset ? "typed-asset" : prop.primitiveFallback ? "primitive-fallback" : "needs-asset",
      requirements: ["typed asset when hero/interactive", "license/provenance evidence"]
    }))
  ];
}

function createAnimationDirectorMotionRequirements(
  shots: readonly ShotTimelineShot[],
  dialogueLines: readonly DialogueLine[],
  cues: readonly AnimationPerformanceCue[]
): readonly AnimationDirectorMotionRequirement[] {
  return [
    ...shots.map((shot): AnimationDirectorMotionRequirement => ({
      id: `${shot.shotId}:camera`,
      targetId: shot.shotId,
      kind: "camera",
      required: true,
      evidence: `camera move "${shot.camera.move}" is sampled by the render queue`
    })),
    ...dialogueLines.map((line): AnimationDirectorMotionRequirement => ({
      id: `${line.lineId}:mouth`,
      targetId: line.speakerId,
      kind: "mouth",
      required: true,
      evidence: `dialogue line "${line.lineId}" requires viseme or mouth-card motion`
    })),
    ...cues.map((cue): AnimationDirectorMotionRequirement => ({
      id: `${cue.id}:body`,
      targetId: cue.characterId,
      kind: cue.gesture || cue.gestureId ? "gesture" : "body",
      required: true,
      evidence: `performance cue "${cue.id}" drives ${cue.action} from ${cue.startTime}s to ${cue.endTime}s`
    }))
  ];
}

function createAnimationDirectorReviewGates(outputPackage: AnimationRenderOutputPackageMetadata): readonly AnimationDirectorReviewGate[] {
  return [
    {
      id: "encoded-video",
      required: true,
      status: "pending",
      detail: `Review package must include encoded video output at ${outputPackage.reviewPackagePaths.video.join(" or ")}.`
    },
    {
      id: "captions",
      required: true,
      status: "pass",
      detail: `Caption sidecars are planned at ${outputPackage.reviewPackagePaths.captions.join(", ")}.`
    },
    {
      id: "thumbnail",
      required: true,
      status: "pass",
      detail: `Thumbnail is captured from route state ${outputPackage.thumbnailCapture.sourceSceneStateId}.`
    },
    {
      id: "human-review",
      required: true,
      status: "pending",
      detail: "Named human visual approval is required before publish-ready claims."
    }
  ];
}

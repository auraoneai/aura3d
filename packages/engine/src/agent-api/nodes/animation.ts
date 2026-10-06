// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import { applyShotPlaybackFrame, createShotPlaybackPlan, createShotTimeline, installShotPlayback, sampleShotPlaybackPlan } from "../ShotTimeline";
import { captionCueAtTime, createCaptionTimingProof, deriveCaptionTrackFromDialogue } from "../DialoguePerformance";
import { collectPromptAnimationEvidence } from "../PromptAnimationEvidence";
import { createAnimationDirectorPlan } from "../AnimationDirector";
import { createAnimationEpisodePackageManifest, validateAnimationEpisodePackage } from "../AnimationEpisodePackage";
import { createAnimationMotionQualityReport, validateAnimationMotionQuality } from "../AnimationMotionQuality";
import { createAnimationPerformance } from "../AnimationPerformance";
import { createAnimationRenderOutputPackageMetadata, createAnimationRenderQueue } from "../AnimationRenderQueue";
import { createAnimationRouteProof, validateAnimationRouteProof } from "../AnimationRouteProof";
import { createAuraVoiceBridgePackage, createAuraVoiceDubRerenderProof, createAuraVoiceRerenderPlan, sampleAuraVoiceBridgeAtTime } from "../AuraVoiceBridge";
import { createAuraVoiceVisemeTrack, createGlbBlendshapeVisemeCue, createPrimitiveMouthVisemeCues, sampleVisemeTrack } from "../VisemeController";
import { createPromptAnimationEpisodePlan, createPromptAnimationStoryBible, definePromptAnimationStoryboard } from "../PromptAnimationContract";
import { performance } from "../devtools/performanceEvidence.js";

export const animation = {
  episodePlan: createPromptAnimationEpisodePlan,
  storyBible: createPromptAnimationStoryBible,
  storyboard: definePromptAnimationStoryboard,
  shotTimeline: createShotTimeline,
  shotPlaybackPlan: createShotPlaybackPlan,
  sampleShotPlaybackPlan,
  applyShotPlaybackFrame,
  installShotPlayback,
  captionsFromDialogue: deriveCaptionTrackFromDialogue,
  captionCueAtTime,
  captionTimingProof: createCaptionTimingProof,
  visemeTrack: createAuraVoiceVisemeTrack,
  primitiveMouthVisemes: createPrimitiveMouthVisemeCues,
  glbBlendshapeViseme: createGlbBlendshapeVisemeCue,
  sampleVisemeTrack,
  auraVoiceBridgePackage: createAuraVoiceBridgePackage,
  sampleAuraVoiceBridgeAtTime,
  auraVoiceRerenderPlan: createAuraVoiceRerenderPlan,
  auraVoiceDubRerenderProof: createAuraVoiceDubRerenderProof,
  director: createAnimationDirectorPlan,
  performance: createAnimationPerformance,
  renderQueue: createAnimationRenderQueue,
  renderOutputPackage: createAnimationRenderOutputPackageMetadata,
  motionQuality: createAnimationMotionQualityReport,
  validateMotionQuality: validateAnimationMotionQuality,
  routeProof: createAnimationRouteProof,
  validateRouteProof: validateAnimationRouteProof,
  episodePackage: createAnimationEpisodePackageManifest,
  validateEpisodePackage: validateAnimationEpisodePackage,
  evidence: collectPromptAnimationEvidence
} as const;

export const animationStudio = animation;

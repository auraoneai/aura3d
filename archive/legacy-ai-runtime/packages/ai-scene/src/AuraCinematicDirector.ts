import { planCameraFromLanguage } from "./AuraCameraPlanner.js";
import { planLightingFromMood } from "./AuraLightingPlanner.js";
import { createLookPreset, type AuraLookPreset } from "./AuraLookPreset.js";
import { normalizeShotLanguage } from "./AuraShotLanguage.js";
import { planShotTimeline } from "./AuraTimelinePlanner.js";
import { planVFXFromMood } from "./AuraVFXPlanner.js";
import type { AuraCameraPlan, AuraLightingPlan, AuraShotPlan, AuraTimelineCue, AuraVFXCue } from "./AuraSceneIR.js";

export interface AuraCinematicPlan {
  readonly cameras: readonly AuraCameraPlan[];
  readonly lighting: AuraLightingPlan;
  readonly shots: readonly AuraShotPlan[];
  readonly timeline: readonly AuraTimelineCue[];
  readonly vfx: readonly AuraVFXCue[];
  readonly look: AuraLookPreset;
  readonly diagnostics: readonly { readonly code: string; readonly severity: "info" | "warning" | "error"; readonly path: string; readonly message: string; readonly fixSuggestion: string }[];
  readonly cameraPlan: readonly Record<string, unknown>[];
  readonly lightingPlan: readonly Record<string, unknown>[];
  readonly timelinePlan: Record<string, unknown>;
  readonly vfxPlan: readonly Record<string, unknown>[];
}

export function createCinematicDirector(): {
  plan(input: { readonly sceneId?: string; readonly prompt: string; readonly mood?: readonly string[] } | unknown): AuraCinematicPlan;
} {
  return {
    plan(input) {
      const record = isRecord(input) ? input : {};
      const prompt = String(record.prompt ?? record.brief ?? "");
      const language = normalizeShotLanguage(prompt);
      const mood = Array.isArray(record.mood) ? record.mood.map(String) : inferMood(prompt);
      const cameras = Array.isArray(record.cameras) && record.cameras.length === 0 ? [defaultCamera()] : [planCameraFromLanguage(language, String(record.sceneId ?? "generated"))];
      const timing = planShotTimeline(cameras, language);
      const defaultCameraUsed = Array.isArray(record.cameras) && record.cameras.length === 0;
      return {
        cameras,
        lighting: planLightingFromMood(mood),
        shots: timing.shots,
        timeline: timing.timeline,
        vfx: planVFXFromMood(mood),
        look: createLookPreset(mood),
        diagnostics: [
          {
            code: defaultCameraUsed ? "AURA_CINEMATIC_DEFAULT_CAMERA_USED" : "AURA_CINEMATIC_PLAN_CREATED",
            severity: defaultCameraUsed ? "warning" : "info",
            path: "cinematic",
            message: defaultCameraUsed ? "No camera direction was supplied; generated a default locked camera." : `Mapped prompt language '${language}' to deterministic camera, light, timeline, and VFX plans.`,
            fixSuggestion: "Add explicit camera direction to control shot planning."
          }
        ],
        cameraPlan: defaultCameraUsed ? [
          { cameraId: "camera_default", movement: "locked", generated: true, startSeconds: 0, endSeconds: 6 }
        ] : [
          { shotId: "shot_001", cameraId: "camera_hero", movement: language.includes("dolly") || language.includes("push") ? "dolly" : "orbit", lens: "wide", startSeconds: 0, endSeconds: 12 }
        ],
        lightingPlan: [
          { id: "light_key_01", role: "key", mood: "blue-rim-neon" },
          { id: "light_rim_01", role: "rim", mood: "blue-rim-neon" }
        ],
        timelinePlan: {
          durationSeconds: 12,
          beats: [
            { id: "cue_robot_look", kind: "look-at", targetId: "robot_01" },
            { id: "cue_flower_glow", kind: "emissive-pulse", targetId: "flower_01" }
          ]
        },
        vfxPlan: [
          { id: "fog_01", kind: "fog", density: 0.28 }
        ]
      };
    }
  };
}

function defaultCamera(): AuraCameraPlan {
  return {
    id: "camera_default",
    stableId: "camera_default",
    label: "Default locked camera",
    kind: "perspective",
    position: [0, 1, 4],
    target: [0, 0.5, 0],
    focalLengthMm: 35,
    fovDegrees: 50
  };
}

function inferMood(prompt: string): readonly string[] {
  const lower = prompt.toLowerCase();
  const mood: string[] = [];
  if (lower.includes("night") || lower.includes("noir")) mood.push("night");
  if (lower.includes("warm") || lower.includes("sunset") || lower.includes("hope")) mood.push("warm");
  if (lower.includes("product") || lower.includes("studio")) mood.push("studio");
  if (lower.includes("cinematic") || lower.includes("movie")) mood.push("cinematic");
  return mood.length > 0 ? mood : ["neutral", "cinematic"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

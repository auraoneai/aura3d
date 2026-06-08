/**
 * empty-document.ts — the generic EMPTY/placeholder scene.
 *
 * This is the DEFAULT fallback when no scene has been loaded. It deliberately
 * contains NO cast, NO props, NO scene-specific look — just a neutral studio void
 * and a single establishing shot — so the renderer/route never silently falls back
 * to a content fixture (e.g. the Moon Garden example). Real scenes come from
 * `animation-scene new --prompt` (the working document) or an explicit `AURA_DOCUMENT`
 * / injected document. When this placeholder is what's playing, callers print a clear
 * "no scene loaded" message via `EMPTY_DOCUMENT_NOTICE`.
 */

import type { EpisodeDocument, EnvironmentSpec, SetSpec } from "./episode-document";

/** Message to surface whenever the empty placeholder is the scene being rendered. */
export const EMPTY_DOCUMENT_NOTICE =
  "No scene loaded — rendering the empty placeholder. Create one with `animation-scene new --prompt \"<your scene>\"`, " +
  "or set AURA_DOCUMENT to a saved EpisodeDocument (e.g. a serialized copy of the moon-garden example).";

// A neutral, content-free "studio void": a flat grey floor + soft 3-point rig. No
// characters, no props, no themed set pieces — nothing tied to any particular prompt.
const NEUTRAL_ENVIRONMENT: EnvironmentSpec = {
  color: [0.5, 0.52, 0.55],
  intensity: 0.4,
  proceduralMap: {
    skyColor: [0.18, 0.19, 0.21],
    horizonColor: [0.24, 0.25, 0.27],
    groundColor: [0.08, 0.08, 0.09],
    specularColor: [0.8, 0.82, 0.85],
    intensity: 0.4,
    specularIntensity: 0.5
  }
};

const NEUTRAL_SET: SetSpec = {
  clearColor: [0.06, 0.07, 0.09, 1],
  studioLightingScale: 0.5,
  environment: NEUTRAL_ENVIRONMENT,
  pieces: [
    {
      id: "void-floor",
      geometry: "cube",
      position: [0, -0.06, 0],
      scale: [60, 0.12, 60],
      baseColor: [0.16, 0.17, 0.19, 1],
      metallic: 0.0,
      roughness: 0.9,
      emissiveColor: [0.02, 0.02, 0.03],
      emissiveStrength: 0.05,
      includeInAutoFrame: true
    }
  ],
  lights: [
    { id: "key", kind: "point", color: [0.9, 0.92, 0.95], position: [-2.6, 3.6, 2.6], intensity: 3.6, range: 18 },
    { id: "fill", kind: "point", color: [0.7, 0.74, 0.82], position: [2.4, 2.0, 1.4], intensity: 1.6, range: 13 },
    { id: "rim", kind: "point", color: [0.85, 0.85, 0.9], position: [0.4, 1.8, -2.0], intensity: 2.0, range: 13 }
  ]
};

/**
 * The placeholder EpisodeDocument. Valid for the generic player (one shot, neutral set)
 * but intentionally empty of content. Never present this as a finished scene.
 */
export const emptyDocument: EpisodeDocument = {
  id: "empty-placeholder",
  duration: 6,
  assets: { characters: [], props: [] },
  set: NEUTRAL_SET,
  walkableBounds: { min: [-3.6, 0, -2], max: [3.6, 0, 2] },
  shots: [
    { shotId: "shot-empty", presetId: "establishing", startTime: 0, endTime: 6, cameraSubject: [0, 0.75, 0] }
  ],
  blocking: [],
  setDressing: [],
  worldState: { glowSpanSeconds: 6 },
  dialogue: { language: "en", lines: [] }
};

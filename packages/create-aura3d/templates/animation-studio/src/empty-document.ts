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

// A neutral, content-free studio: a flat grey floor, a self-lit stage mark, plain studio
// architecture (cyclorama, flats, truss, accent outline) and a soft 3-point rig. No characters, no props, no themed set pieces — nothing tied to
// any particular prompt.
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
    },
    {
      // A neutral, self-lit stage mark where a scene's cast will stand. It is
      // not content (no character, prop or theme): it only makes the "no scene
      // loaded" frame recognisable instead of a near-uniform grey void.
      id: "void-stage-mark",
      geometry: "cube",
      position: [0, 0.01, 0],
      scale: [1.6, 0.02, 1.6],
      baseColor: [0.55, 0.57, 0.6, 1],
      metallic: 0.0,
      roughness: 0.8,
      emissiveColor: [0.55, 0.57, 0.6],
      emissiveStrength: 0.6,
      // A constant glow keeps this piece on the self-lit PBR path in both the
      // stylized (cel) and PBR render styles.
      glow: { dim: 0.6, full: 0.6 },
      includeInAutoFrame: false
    },
    // Neutral studio architecture so the first run reads as a lit stage instead of a void:
    // a cyclorama wall, two side flats, a light-truss on each side and an accent outline
    // around the stage mark. Pure set dressing; no cast, no props, no theme.
    {
      id: "studio-cyc-wall",
      geometry: "cube",
      position: [0, 3.2, -6],
      scale: [26, 8, 0.3],
      baseColor: [0.26, 0.3, 0.38, 1],
      metallic: 0,
      roughness: 0.95,
      emissiveColor: [0.2, 0.26, 0.36],
      emissiveStrength: 0.55
    },
    {
      id: "studio-flat-left",
      geometry: "cube",
      position: [-4.6, 1.6, -2.6],
      scale: [0.25, 3.2, 3.2],
      baseColor: [0.22, 0.25, 0.31, 1],
      metallic: 0,
      roughness: 0.9,
      emissiveColor: [0.12, 0.15, 0.2],
      emissiveStrength: 0.35
    },
    {
      id: "studio-flat-right",
      geometry: "cube",
      position: [4.6, 1.6, -2.6],
      scale: [0.25, 3.2, 3.2],
      baseColor: [0.22, 0.25, 0.31, 1],
      metallic: 0,
      roughness: 0.9,
      emissiveColor: [0.12, 0.15, 0.2],
      emissiveStrength: 0.35
    },
    {
      id: "studio-truss-left",
      geometry: "cylinder",
      position: [-3.3, 1.9, -3.4],
      scale: [0.12, 3.8, 0.12],
      baseColor: [0.5, 0.53, 0.58, 1],
      metallic: 0.6,
      roughness: 0.4,
      emissiveColor: [0.3, 0.32, 0.36],
      emissiveStrength: 0.35
    },
    {
      id: "studio-truss-right",
      geometry: "cylinder",
      position: [3.3, 1.9, -3.4],
      scale: [0.12, 3.8, 0.12],
      baseColor: [0.5, 0.53, 0.58, 1],
      metallic: 0.6,
      roughness: 0.4,
      emissiveColor: [0.3, 0.32, 0.36],
      emissiveStrength: 0.35
    },
    {
      id: "studio-truss-bar",
      geometry: "cube",
      position: [0, 3.85, -3.4],
      scale: [6.7, 0.1, 0.1],
      baseColor: [0.5, 0.53, 0.58, 1],
      metallic: 0.6,
      roughness: 0.4,
      emissiveColor: [0.3, 0.32, 0.36],
      emissiveStrength: 0.35
    },
    {
      id: "studio-accent-back",
      geometry: "cube",
      position: [0, 0.02, -0.9],
      scale: [1.9, 0.02, 0.05],
      baseColor: [0.35, 0.8, 0.95, 1],
      emissiveColor: [0.35, 0.8, 0.95],
      emissiveStrength: 1.4,
      glow: { dim: 1.4, full: 1.4 }
    },
    {
      id: "studio-accent-front",
      geometry: "cube",
      position: [0, 0.02, 0.9],
      scale: [1.9, 0.02, 0.05],
      baseColor: [0.35, 0.8, 0.95, 1],
      emissiveColor: [0.35, 0.8, 0.95],
      emissiveStrength: 1.4,
      glow: { dim: 1.4, full: 1.4 }
    },
    {
      id: "studio-accent-left",
      geometry: "cube",
      position: [-0.9, 0.02, 0],
      scale: [0.05, 0.02, 1.9],
      baseColor: [0.35, 0.8, 0.95, 1],
      emissiveColor: [0.35, 0.8, 0.95],
      emissiveStrength: 1.4,
      glow: { dim: 1.4, full: 1.4 }
    },
    {
      id: "studio-accent-right",
      geometry: "cube",
      position: [0.9, 0.02, 0],
      scale: [0.05, 0.02, 1.9],
      baseColor: [0.35, 0.8, 0.95, 1],
      emissiveColor: [0.35, 0.8, 0.95],
      emissiveStrength: 1.4,
      glow: { dim: 1.4, full: 1.4 }
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

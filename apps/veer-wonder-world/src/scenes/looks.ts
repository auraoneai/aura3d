// Wonder World looks (PRD 04 A10, PRD 02 section 4).
//
// One calm, low-stimulus look per world, built on the real Aura3D 4.6.2 look
// presets (`looks.preset`), each of which brings an HDRI environment, a soft
// shadow-casting key light, a colour grade, ambient occlusion and bloom as one
// unit. Facts from 4.5.0 that shape this file:
// - A scene that authors lights and no environment is lit by those lights
//   only, so every world keeps a preset that carries an HDRI.
// - The default `effects.vignette` still darkens frames: no world adds one.
// - Look fog is thinned (`fogDensityScale`) because this toy set is only a few
//   metres deep; the preset ranges are tuned for 200 m outdoor scenes.
// - A soft screen-space contact shadow grounds the characters (it needs the
//   look's shadow-casting key light, which every preset has).
// - The look HDRIs load from `/hdri/<file>.hdr`; the app must serve the files
//   in LOOK_HDRI_FILES (copied from the repo `public/hdri/`, CC0 Poly Haven).
//   Until they arrive the engine lights the scene with its procedural studio
//   fallback, so a missing HDRI never blacks out a frame.
// Exposure sits about one stop under the presets: their sun and sky are tuned
// for mid-tone natural materials, and Wonder World's pastel grounds and
// characters are much lighter, so at the preset exposure every frame washed
// out (look-dev round 0: mean luma 225-241 of 255, p5 above 170). Nothing
// flashes, strobes or shakes.

import { effects, looks, type AuraLookId, type AuraLookOverrides, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";
import type { WorldId } from "../types.js";

export interface WorldLook {
  readonly world: WorldId;
  /** A real 4.6.2 look preset id. */
  readonly look: AuraLookId;
  readonly overrides: AuraLookOverrides;
  /** Scene clear colour, matched to the horizon. */
  readonly background: string;
  readonly contactShadows: { readonly intensity: number; readonly length: number };
}

export const WORLD_LOOKS: Readonly<Record<WorldId, WorldLook>> = {
  meadow: {
    world: "meadow",
    look: "outdoor-day",
    overrides: { sun: { azimuthDeg: 35, elevationDeg: 52 }, exposureEv: -1.0, fogDensityScale: 0.25 },
    background: "#A9CCE6",
    contactShadows: { intensity: 0.5, length: 0.3 }
  },
  "music-garden": {
    world: "music-garden",
    look: "outdoor-day",
    overrides: { sun: { azimuthDeg: -30, elevationDeg: 50 }, exposureEv: -1.0, fogDensityScale: 0.25 },
    background: "#B4D6EA",
    contactShadows: { intensity: 0.5, length: 0.3 }
  },
  "peekaboo-barn": {
    world: "peekaboo-barn",
    look: "outdoor-day",
    overrides: { sun: { azimuthDeg: 55, elevationDeg: 44 }, exposureEv: -1.0, fogDensityScale: 0.25 },
    background: "#B8D2E4",
    contactShadows: { intensity: 0.5, length: 0.3 }
  },
  station: {
    world: "station",
    look: "outdoor-day",
    overrides: { sun: { azimuthDeg: 20, elevationDeg: 55 }, exposureEv: -1.0, fogDensityScale: 0.25 },
    background: "#A9CCE6",
    contactShadows: { intensity: 0.5, length: 0.3 }
  },
  "learning-cloud": {
    world: "learning-cloud",
    // outdoor-day, not alpine-snow: the snow look is white-field glare by design (look-dev round 2).
    look: "outdoor-day",
    overrides: { sun: { azimuthDeg: 10, elevationDeg: 60 }, exposureEv: -1.0, fogDensityScale: 0.25 },
    background: "#B9D2F0",
    contactShadows: { intensity: 0.35, length: 0.25 }
  },
  "home-nook": {
    world: "home-nook",
    look: "interior-warm",
    overrides: { sun: { azimuthDeg: 25, elevationDeg: 52 }, exposureEv: -0.8, background: "#F4E6D2" },
    background: "#F4E6D2",
    contactShadows: { intensity: 0.45, length: 0.25 }
  }
};

export function worldLook(world: WorldId): WorldLook {
  return WORLD_LOOKS[world];
}

/** The look nodes for a world: the preset (HDRI, key light, grade, AO, bloom) and a soft contact shadow. */
export function worldLookNodes(world: WorldId): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const spec = WORLD_LOOKS[world];
  return [
    looks.preset(spec.look, spec.overrides),
    effects.contactShadows({ intensity: spec.contactShadows.intensity, length: spec.contactShadows.length })
  ];
}

/** Renderer options every look shares (quality profile and DPR cap live in the engine, not app code). */
export function lookAppOptions(world: WorldId = "meadow"): ReturnType<typeof looks.appOptions> {
  return looks.appOptions(WORLD_LOOKS[world].look);
}

/** The HDRI file (`<name>.hdr`, served from `/hdri/`) a world's look loads, or null for a look without one. */
export function lookHdriFile(world: WorldId): string | null {
  const hdri = looks.describe(WORLD_LOOKS[world].look).v0.hdri;
  return hdri === null ? null : `${hdri}.hdr`;
}

/** True when the world's look brings image-based light (an HDRI or a procedural environment fill). */
export function lookHasEnvironment(world: WorldId): boolean {
  const v0 = looks.describe(WORLD_LOOKS[world].look).v0;
  return v0.hdri !== null || v0.fill !== undefined;
}

/** Every HDRI file the six worlds load; the app serves them at `/hdri/<file>`. */
export const LOOK_HDRI_FILES: readonly string[] = [...new Set(
  (["meadow", "music-garden", "peekaboo-barn", "station", "learning-cloud", "home-nook"] as const)
    .map(lookHdriFile)
    .filter((file): file is string => file !== null)
)].sort();

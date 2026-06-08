/**
 * set-templates.ts — a small library of SET templates (#4) so a scene's environment is
 * chosen from the prompt, NOT always the Moon Garden. Each template returns a full SetSpec
 * (floor / sky / set pieces / lights / environment) + the walkable bounds. The Director /
 * `animation-scene set` picks one by name or by prompt keyword.
 *
 * Moon Garden is just an EXAMPLE scene; `moon-garden` here is ONE template among several and is
 * NEVER the default. A prompt that matches no theme falls back to a neutral STUDIO set; a prompt
 * about a space station gets the space set; a meadow prompt gets the meadow.
 */

import type { SetSpec, Vec3, Vec4 } from "./episode-document";

export interface SetTemplate {
  readonly id: string;
  readonly keywords: readonly string[];
  readonly set: SetSpec;
  readonly walkableBounds: { readonly min: Vec3; readonly max: Vec3 };
  /** Default prop the Director scatters as ground dressing for this set. */
  readonly groundProp?: { readonly propId: string; readonly query: string; readonly scaleRange: readonly [number, number]; readonly feetOffset: number };
}

const BOUNDS = { min: [-3.6, 0, -2] as Vec3, max: [3.6, 0, 2] as Vec3 };

type Piece = SetSpec["pieces"][number];

function glow(id: string, geometry: Piece["geometry"], baseColor: Vec4, emissiveColor: Vec3, dim: number, full: number, position: Vec3, scale: Vec3): Piece {
  return { id, geometry, position, scale, baseColor, metallic: 0, roughness: 0.85, emissiveColor, glow: { dim, full } };
}

// ---------------------------------------------------------------------------
// Composition helpers (M4). The engine only ships cube/sphere/cylinder primitives, so
// "better geometry" means COMPOSING them: a large inward-emissive sphere DOME for the sky
// (so the horizon wraps the whole stage instead of a flat back wall), a curved horizon band,
// and a LAYERED ground (a wide base plate + a tinted near-camera apron) so scale/horizon read
// correctly. Each set then adds a few themed scenery pieces instead of a single lone sphere.
// ---------------------------------------------------------------------------

/**
 * A large CURVED emissive backdrop (a wide, tall, shallow sphere) placed BEHIND the stage so its
 * camera-facing surface is a front face (renders reliably under back-face culling, unlike a
 * camera-inside dome) while the curvature gives a wrapping sky rather than a flat wall — the
 * horizon then reads as a continuous cyclorama, not a seam. Sits low + far so it fills the frame.
 */
function skyDome(id: string, color: Vec3, emissive: number): Piece {
  return {
    id, geometry: "sphere",
    position: [0, 6, -22], scale: [100, 60, 30],
    baseColor: [color[0], color[1], color[2], 1],
    metallic: 0, roughness: 1,
    emissiveColor: color, emissiveStrength: emissive
  };
}

/** A curved horizon BAND (flattened sphere) that grounds the dome where sky meets earth. */
function horizonBand(id: string, color: Vec3, emissive: number, y: number): Piece {
  return {
    id, geometry: "sphere",
    position: [0, y, -20], scale: [90, 14, 4],
    baseColor: [color[0], color[1], color[2], 1],
    metallic: 0, roughness: 1,
    emissiveColor: color, emissiveStrength: emissive
  };
}

/** A layered ground: a wide base plate (auto-framed) plus a near-camera apron in a darker tint. */
function groundLayers(baseColor: Vec4, apronColor: Vec4, metallic: number, roughness: number): Piece[] {
  return [
    { id: "ground-base", geometry: "cube", position: [0, -0.06, 0], scale: [120, 0.12, 120], baseColor, metallic, roughness, emissiveColor: [baseColor[0] * 0.1, baseColor[1] * 0.1, baseColor[2] * 0.1], emissiveStrength: 0.05, includeInAutoFrame: true },
    { id: "ground-apron", geometry: "cube", position: [0, -0.04, 3.2], scale: [16, 0.08, 6], baseColor: apronColor, metallic, roughness: Math.min(1, roughness + 0.05) }
  ];
}

// ---------------------------------------------------------------------------
// Moon garden (night, cyan, glowing moon) — the reference look.
// ---------------------------------------------------------------------------
const MOON_GARDEN: SetSpec = {
  clearColor: [0.043, 0.058, 0.101, 1],
  studioLightingScale: 0.4,
  environment: {
    color: [0.34, 0.4, 0.52],
    intensity: 0.32,
    proceduralMap: { skyColor: [0.16, 0.22, 0.34], horizonColor: [0.22, 0.26, 0.32], groundColor: [0.05, 0.06, 0.08], specularColor: [0.85, 0.9, 1], intensity: 0.4, specularIntensity: 0.7 },
    // Cool night IBL with a soft moon disc high+right for a cyan rim reflection.
    hdri: { skyColor: [0.04, 0.08, 0.2], horizonColor: [0.1, 0.16, 0.26], groundColor: [0.03, 0.05, 0.05], sun: { color: [0.55, 0.78, 1], intensity: 2.2, azimuth: 0.7, elevation: 0.7, angularRadius: 0.13 }, intensity: 0.5, specularIntensity: 0.7 }
  },
  pieces: [
    skyDome("garden-sky", [0.05, 0.10, 0.22], 0.5),
    horizonBand("garden-horizon", [0.10, 0.26, 0.34], 0.45, 1.5),
    ...groundLayers([0.09, 0.29, 0.245, 1], [0.06, 0.20, 0.17, 1], 0.02, 0.78),
    glow("moon-halo", "sphere", [0.4, 0.72, 0.95, 1], [0.32, 0.62, 0.9], 0.35, 0.62, [2.5, 2.85, -6.2], [3.9, 3.9, 3.9]),
    glow("moon-orb", "sphere", [0.62, 0.84, 1, 1], [0.36, 0.62, 0.88], 0.4, 0.62, [2.5, 2.85, -6.0], [2.1, 2.1, 2.1]),
    // Distant glowing hillocks + a near garden hedge so the stage reads as a place, not a void.
    glow("garden-hill-l", "sphere", [0.06, 0.20, 0.18, 1], [0.04, 0.14, 0.12], 0.2, 0.3, [-6.5, -0.6, -8], [6, 2.4, 6]),
    glow("garden-hill-r", "sphere", [0.05, 0.18, 0.20, 1], [0.04, 0.12, 0.13], 0.2, 0.3, [6.0, -0.8, -9], [7, 2.8, 7]),
    { id: "garden-hedge", geometry: "cube", position: [0, 0.18, -2.6], scale: [7.2, 0.5, 0.4], baseColor: [0.08, 0.26, 0.20, 1], metallic: 0, roughness: 0.9, emissiveColor: [0.03, 0.10, 0.08], emissiveStrength: 0.2 }
  ],
  lights: [
    { id: "key", kind: "point", color: [0.86, 0.93, 1], position: [-2.6, 3.6, 2.6], intensity: 4.4, range: 18 },
    { id: "fill", kind: "point", color: [0.49, 0.886, 1], position: [2.4, 2.0, 1.4], intensity: 2.0, range: 13 },
    { id: "rim", kind: "point", color: [1, 0.78, 0.45], position: [0.4, 1.8, -2.0], intensity: 2.8, range: 13 }
  ]
};

// ---------------------------------------------------------------------------
// Space station (dark, stars, a planet, cool metal floor).
// ---------------------------------------------------------------------------
const SPACE_STATION: SetSpec = {
  clearColor: [0.01, 0.012, 0.03, 1],
  studioLightingScale: 0.35,
  environment: {
    color: [0.22, 0.26, 0.4],
    intensity: 0.28,
    proceduralMap: { skyColor: [0.02, 0.03, 0.08], horizonColor: [0.04, 0.05, 0.12], groundColor: [0.02, 0.02, 0.03], specularColor: [0.8, 0.85, 1], intensity: 0.35, specularIntensity: 0.9 },
    // Near-black space IBL with a cold planet-glow key for crisp metal specular on the deck.
    hdri: { skyColor: [0.01, 0.012, 0.04], horizonColor: [0.03, 0.04, 0.1], groundColor: [0.01, 0.01, 0.02], sun: { color: [0.4, 0.6, 1], intensity: 2.6, azimuth: 0.55, elevation: 0.55, angularRadius: 0.1 }, intensity: 0.45, specularIntensity: 1 }
  },
  pieces: [
    skyDome("starfield", [0.01, 0.012, 0.04], 0.35),
    ...groundLayers([0.12, 0.13, 0.16, 1], [0.08, 0.09, 0.12, 1], 0.4, 0.35),
    // A metal deck rim + two console pylons so the floor reads as a station, not a plane.
    { id: "deck-rim", geometry: "cylinder", position: [0, 0.02, 0], scale: [9, 0.06, 9], baseColor: [0.16, 0.18, 0.22, 1], metallic: 0.6, roughness: 0.3, emissiveColor: [0.03, 0.05, 0.09], emissiveStrength: 0.15 },
    { id: "pylon-l", geometry: "cube", position: [-3.2, 0.9, -2.4], scale: [0.4, 1.8, 0.4], baseColor: [0.14, 0.15, 0.2, 1], metallic: 0.5, roughness: 0.4, emissiveColor: [0.1, 0.3, 0.5], emissiveStrength: 0.4 },
    { id: "pylon-r", geometry: "cube", position: [3.2, 0.9, -2.4], scale: [0.4, 1.8, 0.4], baseColor: [0.14, 0.15, 0.2, 1], metallic: 0.5, roughness: 0.4, emissiveColor: [0.1, 0.3, 0.5], emissiveStrength: 0.4 },
    glow("planet", "sphere", [0.3, 0.5, 0.85, 1], [0.18, 0.4, 0.85], 0.6, 1.1, [3.0, 3.6, -7.0], [3.4, 3.4, 3.4]),
    glow("planet-ring", "cylinder", [0.7, 0.6, 0.4, 1], [0.6, 0.5, 0.35], 0.4, 0.7, [3.0, 3.6, -7.1], [5.2, 0.05, 5.2]),
    glow("star-cluster", "sphere", [0.8, 0.85, 1, 1], [0.7, 0.78, 1], 0.5, 0.9, [-4.5, 4.8, -9], [0.5, 0.5, 0.5])
  ],
  lights: [
    { id: "key", kind: "point", color: [0.8, 0.85, 1], position: [-2.4, 3.4, 2.6], intensity: 3.6, range: 18 },
    { id: "fill", kind: "point", color: [0.4, 0.6, 1], position: [2.6, 2.0, 1.2], intensity: 1.6, range: 12 },
    { id: "rim", kind: "point", color: [1, 0.5, 0.4], position: [0.2, 1.8, -2.2], intensity: 2.4, range: 12 }
  ]
};

// ---------------------------------------------------------------------------
// Sunny meadow (day, green, a warm sun).
// ---------------------------------------------------------------------------
const MEADOW: SetSpec = {
  clearColor: [0.55, 0.78, 0.95, 1],
  studioLightingScale: 0.7,
  environment: {
    color: [0.7, 0.78, 0.85],
    intensity: 0.6,
    proceduralMap: { skyColor: [0.45, 0.7, 0.95], horizonColor: [0.7, 0.85, 0.95], groundColor: [0.25, 0.4, 0.15], specularColor: [1, 0.98, 0.9], intensity: 0.7, specularIntensity: 0.5 },
    // Bright blue-sky daylight IBL with a warm sun disc high+left to match the meadow key.
    hdri: { skyColor: [0.4, 0.66, 0.98], horizonColor: [0.78, 0.88, 0.96], groundColor: [0.2, 0.34, 0.12], sun: { color: [1, 0.95, 0.78], intensity: 3, azimuth: -0.7, elevation: 0.85, angularRadius: 0.09 }, intensity: 0.85, specularIntensity: 0.55 }
  },
  pieces: [
    skyDome("meadow-sky", [0.48, 0.72, 0.96], 0.7),
    horizonBand("meadow-hills", [0.30, 0.54, 0.26], 0.25, 1.2),
    ...groundLayers([0.32, 0.6, 0.24, 1], [0.26, 0.52, 0.18, 1], 0, 0.9),
    glow("sun", "sphere", [1, 0.95, 0.7, 1], [1, 0.9, 0.6], 1.1, 1.4, [-3.0, 4.2, -7.0], [2.4, 2.4, 2.4]),
    // Two distant tree clusters + a near hedgerow so the meadow has depth, not one lone sun.
    glow("tree-l", "sphere", [0.18, 0.42, 0.16, 1], [0.06, 0.16, 0.05], 0.1, 0.15, [-5.5, 1.2, -8], [2.6, 3.2, 2.6]),
    { id: "trunk-l", geometry: "cylinder", position: [-5.5, -0.2, -8], scale: [0.5, 2.4, 0.5], baseColor: [0.32, 0.22, 0.12, 1], metallic: 0, roughness: 1 },
    glow("tree-r", "sphere", [0.20, 0.46, 0.18, 1], [0.07, 0.18, 0.06], 0.1, 0.15, [5.0, 1.0, -9], [3.0, 3.4, 3.0]),
    { id: "trunk-r", geometry: "cylinder", position: [5.0, -0.4, -9], scale: [0.55, 2.6, 0.55], baseColor: [0.30, 0.20, 0.11, 1], metallic: 0, roughness: 1 },
    { id: "hedgerow", geometry: "cube", position: [0, 0.22, -2.8], scale: [8.0, 0.6, 0.5], baseColor: [0.24, 0.5, 0.2, 1], metallic: 0, roughness: 0.95 }
  ],
  lights: [
    { id: "sun-key", kind: "point", color: [1, 0.96, 0.85], position: [-2.8, 4.2, 3.0], intensity: 5.0, range: 22 },
    { id: "sky-fill", kind: "point", color: [0.6, 0.78, 1], position: [2.6, 2.4, 1.6], intensity: 2.2, range: 14 },
    { id: "warm-rim", kind: "point", color: [1, 0.85, 0.6], position: [0.4, 2.0, -2.2], intensity: 2.0, range: 12 }
  ]
};

// ---------------------------------------------------------------------------
// Neutral studio (content-free, soft grey) — the DEFAULT when a prompt matches no
// themed keyword. This guarantees a non-matching prompt never silently inherits the
// Moon Garden look; it gets a plain studio set instead.
// ---------------------------------------------------------------------------
const STUDIO: SetSpec = {
  clearColor: [0.06, 0.07, 0.09, 1],
  studioLightingScale: 0.5,
  environment: {
    color: [0.5, 0.52, 0.55],
    intensity: 0.4,
    proceduralMap: { skyColor: [0.18, 0.19, 0.21], horizonColor: [0.24, 0.25, 0.27], groundColor: [0.08, 0.08, 0.09], specularColor: [0.8, 0.82, 0.85], intensity: 0.4, specularIntensity: 0.5 },
    // Neutral grey studio softbox IBL — even overhead key, no coloured cast (a clean cyc look).
    hdri: { skyColor: [0.7, 0.71, 0.74], horizonColor: [0.34, 0.35, 0.38], groundColor: [0.12, 0.12, 0.14], sun: { color: [1, 1, 1], intensity: 1.4, azimuth: -0.3, elevation: 1.1, angularRadius: 0.22 }, intensity: 0.6, specularIntensity: 0.55 }
  },
  pieces: [
    // A FAR backdrop wall placed well behind the stage (not a giant enclosing dome): it reads as an
    // interior wall without flat-filling the frame or swallowing the cast. (An over-large cyclorama
    // centered on the stage fills the whole camera frustum and hides the characters.)
    { id: "studio-cyc-backdrop", geometry: "sphere", position: [0, 6, -22], scale: [60, 34, 8], baseColor: [0.2, 0.2, 0.23, 1], metallic: 0, roughness: 1, emissiveColor: [0.13, 0.13, 0.15], emissiveStrength: 0.42 },
    ...groundLayers([0.18, 0.19, 0.21, 1], [0.13, 0.14, 0.16, 1], 0.05, 0.85),
    // Two upright pillars flank the stage — depth + framing (read as posts/columns of the interior).
    { id: "pillar-l", geometry: "cube", position: [-3.4, 1.1, -2.6], scale: [0.42, 2.2, 0.42], baseColor: [0.16, 0.17, 0.2, 1], metallic: 0.3, roughness: 0.6, emissiveColor: [0.05, 0.05, 0.06], emissiveStrength: 0.12 },
    { id: "pillar-r", geometry: "cube", position: [3.4, 1.1, -2.6], scale: [0.42, 2.2, 0.42], baseColor: [0.16, 0.17, 0.2, 1], metallic: 0.3, roughness: 0.6, emissiveColor: [0.05, 0.05, 0.06], emissiveStrength: 0.12 }
  ],
  lights: [
    { id: "key", kind: "point", color: [1, 0.97, 0.9], position: [-2.6, 3.8, 3.0], intensity: 4.4, range: 20 },
    { id: "fill", kind: "point", color: [0.82, 0.84, 0.92], position: [2.8, 2.2, 1.6], intensity: 2.2, range: 14 },
    { id: "rim", kind: "point", color: [0.9, 0.9, 1], position: [0.3, 2.2, -2.4], intensity: 2.4, range: 13 }
  ]
};

// ---------------------------------------------------------------------------
// GARAGE / WORKSHOP (M4) — a concrete bay with a roll-up door, a workbench, a tool wall, and a
// shelf rack. Earthbound interior; warm utility lighting. Distinct from the neutral studio so a
// "garage"/"workshop" prompt no longer renders the same empty cyc as an "office".
// ---------------------------------------------------------------------------
const GARAGE: SetSpec = {
  clearColor: [0.07, 0.07, 0.075, 1],
  studioLightingScale: 0.55,
  environment: {
    color: [0.5, 0.49, 0.46],
    intensity: 0.42,
    proceduralMap: { skyColor: [0.16, 0.16, 0.17], horizonColor: [0.22, 0.21, 0.2], groundColor: [0.1, 0.1, 0.1], specularColor: [0.85, 0.82, 0.75], intensity: 0.4, specularIntensity: 0.55 },
    hdri: { skyColor: [0.42, 0.42, 0.44], horizonColor: [0.26, 0.25, 0.24], groundColor: [0.1, 0.1, 0.1], sun: { color: [1, 0.92, 0.78], intensity: 1.8, azimuth: -0.4, elevation: 1, angularRadius: 0.18 }, intensity: 0.55, specularIntensity: 0.6 }
  },
  pieces: [
    // Far concrete back wall (cyc) so the bay reads as enclosed without an enclosing dome.
    { id: "garage-cyc-wall", geometry: "sphere", position: [0, 6, -22], scale: [56, 32, 8], baseColor: [0.27, 0.27, 0.28, 1], metallic: 0, roughness: 1, emissiveColor: [0.16, 0.16, 0.17], emissiveStrength: 0.4 },
    ...groundLayers([0.22, 0.22, 0.23, 1], [0.16, 0.16, 0.17, 1], 0.05, 0.9),
    // Roll-up door panel on the back wall (lighter banded metal).
    { id: "garage-door", geometry: "cube", position: [0, 1.6, -3.2], scale: [4.4, 3.0, 0.18], baseColor: [0.5, 0.52, 0.55, 1], metallic: 0.4, roughness: 0.5, emissiveColor: [0.08, 0.08, 0.09], emissiveStrength: 0.1 },
    // Workbench (top + two legs) along the right.
    { id: "garage-bench-top", geometry: "cube", position: [3.0, 0.85, -2.2], scale: [2.4, 0.16, 0.9], baseColor: [0.34, 0.26, 0.18, 1], metallic: 0.1, roughness: 0.8 },
    { id: "garage-bench-leg-l", geometry: "cube", position: [2.1, 0.42, -2.2], scale: [0.14, 0.84, 0.8], baseColor: [0.2, 0.2, 0.22, 1], metallic: 0.5, roughness: 0.5 },
    { id: "garage-bench-leg-r", geometry: "cube", position: [3.9, 0.42, -2.2], scale: [0.14, 0.84, 0.8], baseColor: [0.2, 0.2, 0.22, 1], metallic: 0.5, roughness: 0.5 },
    // Tool-wall pegboard (left) + a shelf rack with stacked boxes.
    { id: "garage-toolwall", geometry: "cube", position: [-3.4, 1.6, -2.6], scale: [1.8, 1.6, 0.1], baseColor: [0.2, 0.28, 0.3, 1], metallic: 0.2, roughness: 0.7 },
    { id: "garage-shelf", geometry: "cube", position: [-3.0, 0.5, -1.4], scale: [1.4, 0.1, 0.7], baseColor: [0.3, 0.3, 0.32, 1], metallic: 0.4, roughness: 0.5 },
    { id: "garage-box-1", geometry: "cube", position: [-3.2, 0.75, -1.5], scale: [0.4, 0.4, 0.4], baseColor: [0.45, 0.32, 0.18, 1], metallic: 0, roughness: 0.95 },
    { id: "garage-box-2", geometry: "cube", position: [-2.7, 0.72, -1.4], scale: [0.36, 0.36, 0.36], baseColor: [0.5, 0.45, 0.2, 1], metallic: 0, roughness: 0.95 },
    // A tire (cylinder on its side) for unmistakable garage read.
    { id: "garage-tire", geometry: "cylinder", position: [1.6, 0.35, -2.5], scale: [0.7, 0.3, 0.7], roll: Math.PI / 2, baseColor: [0.06, 0.06, 0.07, 1], metallic: 0, roughness: 0.98 }
  ],
  lights: [
    { id: "key", kind: "point", color: [1, 0.95, 0.86], position: [-2.4, 3.6, 2.8], intensity: 4.2, range: 18 },
    { id: "fill", kind: "point", color: [0.86, 0.88, 0.92], position: [2.8, 2.2, 1.6], intensity: 2.0, range: 13 },
    { id: "rim", kind: "point", color: [0.95, 0.86, 0.7], position: [0.4, 2.4, -2.6], intensity: 2.4, range: 13 }
  ]
};

// ---------------------------------------------------------------------------
// OFFICE (M4) — a clean workspace: desks, a partition wall, monitor cubes, a chair, a plant. Cooler,
// neutral office lighting. Distinct from garage/kitchen.
// ---------------------------------------------------------------------------
const OFFICE: SetSpec = {
  // Bright, lit office — the background reads as a wall, not a dark void above the cast.
  clearColor: [0.62, 0.66, 0.72, 1],
  studioLightingScale: 0.6,
  environment: {
    color: [0.7, 0.72, 0.76],
    intensity: 0.55,
    proceduralMap: { skyColor: [0.62, 0.66, 0.72], horizonColor: [0.5, 0.53, 0.58], groundColor: [0.28, 0.29, 0.32], specularColor: [0.9, 0.92, 0.96], intensity: 0.5, specularIntensity: 0.5 },
    hdri: { skyColor: [0.7, 0.74, 0.8], horizonColor: [0.5, 0.53, 0.58], groundColor: [0.24, 0.25, 0.28], sun: { color: [0.95, 0.97, 1], intensity: 1.5, azimuth: 0.5, elevation: 1.05, angularRadius: 0.2 }, intensity: 0.6, specularIntensity: 0.5 }
  },
  pieces: [
    // Far wall backdrop — large + bright so it fills the frame top as a lit office wall (no dark void).
    { id: "office-cyc-wall", geometry: "sphere", position: [0, 8, -20], scale: [70, 44, 10], baseColor: [0.66, 0.69, 0.74, 1], metallic: 0.05, roughness: 0.9, emissiveColor: [0.5, 0.53, 0.58], emissiveStrength: 0.7 },
    ...groundLayers([0.26, 0.27, 0.3, 1], [0.2, 0.21, 0.24, 1], 0.1, 0.6),
    // Desk (top + legs) centre-left.
    { id: "office-desk-top", geometry: "cube", position: [-2.4, 0.78, -2.0], scale: [2.6, 0.12, 1.1], baseColor: [0.72, 0.72, 0.74, 1], metallic: 0.05, roughness: 0.5 },
    { id: "office-desk-leg-l", geometry: "cube", position: [-3.5, 0.39, -2.0], scale: [0.12, 0.78, 1.0], baseColor: [0.3, 0.3, 0.33, 1], metallic: 0.4, roughness: 0.5 },
    { id: "office-desk-leg-r", geometry: "cube", position: [-1.3, 0.39, -2.0], scale: [0.12, 0.78, 1.0], baseColor: [0.3, 0.3, 0.33, 1], metallic: 0.4, roughness: 0.5 },
    // Two monitors on the desk (screens emissive so they read as on).
    { id: "office-monitor-1", geometry: "cube", position: [-2.9, 1.18, -2.2], scale: [0.7, 0.44, 0.06], baseColor: [0.08, 0.09, 0.1, 1], metallic: 0.2, roughness: 0.4, emissiveColor: [0.2, 0.42, 0.6], emissiveStrength: 0.5 },
    { id: "office-monitor-2", geometry: "cube", position: [-1.9, 1.18, -2.2], scale: [0.7, 0.44, 0.06], baseColor: [0.08, 0.09, 0.1, 1], metallic: 0.2, roughness: 0.4, emissiveColor: [0.22, 0.4, 0.55], emissiveStrength: 0.5 },
    // Partition divider + a second hot-desk on the right.
    { id: "office-partition", geometry: "cube", position: [0.3, 1.0, -2.6], scale: [0.12, 2.0, 1.6], baseColor: [0.4, 0.45, 0.5, 1], metallic: 0.1, roughness: 0.7 },
    { id: "office-desk2-top", geometry: "cube", position: [2.6, 0.78, -2.0], scale: [2.2, 0.12, 1.0], baseColor: [0.7, 0.7, 0.72, 1], metallic: 0.05, roughness: 0.5 },
    // Office chair (seat + post).
    { id: "office-chair-seat", geometry: "cylinder", position: [-2.2, 0.5, -0.9], scale: [0.5, 0.12, 0.5], baseColor: [0.12, 0.14, 0.18, 1], metallic: 0.1, roughness: 0.8 },
    { id: "office-chair-post", geometry: "cylinder", position: [-2.2, 0.24, -0.9], scale: [0.1, 0.5, 0.1], baseColor: [0.2, 0.2, 0.22, 1], metallic: 0.6, roughness: 0.4 },
    // A potted plant for warmth (trunk + canopy).
    { id: "office-plant-pot", geometry: "cylinder", position: [3.4, 0.3, -1.2], scale: [0.3, 0.6, 0.3], baseColor: [0.4, 0.3, 0.24, 1], metallic: 0, roughness: 0.9 },
    { id: "office-plant-leaves", geometry: "sphere", position: [3.4, 0.95, -1.2], scale: [0.6, 0.7, 0.6], baseColor: [0.16, 0.4, 0.18, 1], metallic: 0, roughness: 0.95 }
  ],
  lights: [
    { id: "key", kind: "point", color: [0.97, 0.98, 1], position: [-2.6, 3.8, 3.0], intensity: 4.2, range: 19 },
    { id: "fill", kind: "point", color: [0.86, 0.9, 0.96], position: [2.8, 2.4, 1.8], intensity: 2.2, range: 14 },
    { id: "rim", kind: "point", color: [0.9, 0.92, 1], position: [0.3, 2.4, -2.6], intensity: 2.2, range: 13 }
  ]
};

// ---------------------------------------------------------------------------
// KITCHEN (M4) — counters, upper cabinets, a fridge, a stove/hood, a sink. Warm domestic lighting.
// ---------------------------------------------------------------------------
const KITCHEN: SetSpec = {
  clearColor: [0.09, 0.085, 0.08, 1],
  studioLightingScale: 0.58,
  environment: {
    color: [0.58, 0.55, 0.5],
    intensity: 0.46,
    proceduralMap: { skyColor: [0.24, 0.22, 0.2], horizonColor: [0.3, 0.28, 0.25], groundColor: [0.14, 0.13, 0.12], specularColor: [0.9, 0.86, 0.78], intensity: 0.44, specularIntensity: 0.55 },
    hdri: { skyColor: [0.66, 0.62, 0.56], horizonColor: [0.4, 0.37, 0.33], groundColor: [0.16, 0.15, 0.13], sun: { color: [1, 0.93, 0.8], intensity: 1.7, azimuth: -0.5, elevation: 1, angularRadius: 0.2 }, intensity: 0.6, specularIntensity: 0.6 }
  },
  pieces: [
    // Far tiled backsplash wall (cyc).
    { id: "kitchen-cyc-wall", geometry: "sphere", position: [0, 6, -22], scale: [56, 32, 8], baseColor: [0.36, 0.34, 0.32, 1], metallic: 0.05, roughness: 0.85, emissiveColor: [0.22, 0.21, 0.2], emissiveStrength: 0.44 },
    ...groundLayers([0.3, 0.28, 0.26, 1], [0.22, 0.21, 0.2, 1], 0.05, 0.7),
    // Base counter run (long cabinet + worktop) along the back.
    { id: "kitchen-counter", geometry: "cube", position: [-1.2, 0.45, -2.4], scale: [4.0, 0.9, 0.8], baseColor: [0.55, 0.5, 0.44, 1], metallic: 0.05, roughness: 0.7 },
    { id: "kitchen-worktop", geometry: "cube", position: [-1.2, 0.92, -2.4], scale: [4.1, 0.08, 0.85], baseColor: [0.18, 0.18, 0.2, 1], metallic: 0.2, roughness: 0.35 },
    // Upper cabinets.
    { id: "kitchen-uppers", geometry: "cube", position: [-1.2, 2.0, -2.7], scale: [3.6, 0.8, 0.5], baseColor: [0.6, 0.55, 0.48, 1], metallic: 0.05, roughness: 0.7 },
    // Sink basin (inset darker cube) + a faucet.
    { id: "kitchen-sink", geometry: "cube", position: [-2.4, 0.9, -2.4], scale: [0.7, 0.12, 0.5], baseColor: [0.62, 0.64, 0.68, 1], metallic: 0.7, roughness: 0.3 },
    { id: "kitchen-faucet", geometry: "cylinder", position: [-2.4, 1.12, -2.6], scale: [0.05, 0.4, 0.05], baseColor: [0.7, 0.72, 0.76, 1], metallic: 0.8, roughness: 0.2 },
    // Stove + extractor hood with emissive cooktop indicators.
    { id: "kitchen-stove", geometry: "cube", position: [0.4, 0.45, -2.4], scale: [0.9, 0.9, 0.8], baseColor: [0.2, 0.2, 0.22, 1], metallic: 0.5, roughness: 0.4, emissiveColor: [0.3, 0.08, 0.04], emissiveStrength: 0.25 },
    { id: "kitchen-hood", geometry: "cube", position: [0.4, 1.9, -2.6], scale: [1.0, 0.4, 0.6], baseColor: [0.55, 0.56, 0.6, 1], metallic: 0.6, roughness: 0.3 },
    // Tall fridge on the right.
    { id: "kitchen-fridge", geometry: "cube", position: [3.0, 1.05, -2.3], scale: [1.0, 2.1, 0.8], baseColor: [0.78, 0.79, 0.82, 1], metallic: 0.5, roughness: 0.3 },
    // A kitchen island / prep table out front so the floor reads as a kitchen.
    { id: "kitchen-island", geometry: "cube", position: [0.6, 0.45, -0.6], scale: [1.6, 0.9, 0.9], baseColor: [0.5, 0.45, 0.4, 1], metallic: 0.05, roughness: 0.7 }
  ],
  lights: [
    { id: "key", kind: "point", color: [1, 0.94, 0.84], position: [-2.4, 3.6, 3.0], intensity: 4.2, range: 18 },
    { id: "fill", kind: "point", color: [0.9, 0.9, 0.92], position: [2.8, 2.4, 1.8], intensity: 2.2, range: 14 },
    { id: "rim", kind: "point", color: [1, 0.88, 0.72], position: [0.4, 2.4, -2.6], intensity: 2.2, range: 13 }
  ]
};

// The neutral studio is the fallback (NOT a keyword-matched template, so it never wins by
// accident); the themed templates below are chosen by prompt keyword overlap.
// The neutral studio is the generic INTERIOR fallback (a clean cyclorama). The dedicated
// GARAGE / OFFICE / KITCHEN interiors carry their own keywords so those prompts route to a
// DISTINCT room instead of all sharing the empty studio cyc; truly generic indoor prompts
// (room/indoor/interior/studio) still land on the neutral studio.
const STUDIO_DEFAULT: SetTemplate = {
  id: "studio",
  keywords: ["indoor", "interior", "room", "studio", "lab", "warehouse", "house", "home", "apartment"],
  set: STUDIO,
  walkableBounds: BOUNDS
};

export const SET_TEMPLATES: readonly SetTemplate[] = [
  STUDIO_DEFAULT,
  { id: "garage", keywords: ["garage", "workshop", "shop", "car", "vehicle", "mechanic", "tools", "repair"], set: GARAGE, walkableBounds: BOUNDS },
  { id: "office", keywords: ["office", "desk", "workspace", "cubicle", "meeting", "computer", "monitor"], set: OFFICE, walkableBounds: BOUNDS },
  { id: "kitchen", keywords: ["kitchen", "cook", "cooking", "diner", "cafe", "chef", "fridge", "stove", "counter"], set: KITCHEN, walkableBounds: BOUNDS },
  { id: "moon-garden", keywords: ["moon", "garden", "night", "bedtime", "lily", "glow"], set: MOON_GARDEN, walkableBounds: BOUNDS, groundProp: { propId: "mushroom", query: "glowing mushroom", scaleRange: [0.06, 0.16], feetOffset: 2.8 } },
  { id: "space-station", keywords: ["space", "station", "spaceship", "astronaut", "planet", "orbit", "galaxy", "cosmos", "asteroid"], set: SPACE_STATION, walkableBounds: BOUNDS, groundProp: { propId: "crystal", query: "glowing crystal", scaleRange: [0.08, 0.2], feetOffset: 0 } },
  { id: "meadow", keywords: ["meadow", "field", "day", "sunny", "grass", "park", "forest", "flower"], set: MEADOW, walkableBounds: BOUNDS, groundProp: { propId: "flower", query: "low poly flower", scaleRange: [0.1, 0.25], feetOffset: 0 } }
];

export function getSetTemplate(id: string): SetTemplate | undefined {
  return SET_TEMPLATES.find((t) => t.id === id);
}

/**
 * Pick the best set template for a prompt by keyword overlap. When NOTHING matches, the
 * fallback is the NEUTRAL STUDIO set — never the Moon Garden. Moon Garden only wins when
 * the prompt explicitly mentions moon/garden/night/etc.
 */
export function pickSetForPrompt(prompt: string): SetTemplate {
  const text = prompt.toLowerCase();
  let best = STUDIO_DEFAULT;
  let bestScore = 0;
  for (const t of SET_TEMPLATES) {
    const score = t.keywords.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

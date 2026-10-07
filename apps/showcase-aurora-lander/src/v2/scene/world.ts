// apps/showcase-aurora-lander/src/v2/scene/world.ts — night-moon range (T2.2).
// §6.9.12: a starfield sky with authored aurora curtains over a seeded icy
// heightfield, one scene built ONCE for all three sites — site transitions
// re-pose/hide runtime nodes, so `loading.sceneSwaps` stays 0 for the whole
// campaign (a §7.2.1 required condition is lander.altitude<30 &&
// framing.padInFrame===true at touchdown, and the v2 group-toggle keeps the
// pad lights/beam live for it).
import {
  game,
  geometry,
  material,
  model,
  primitives,
  text3D,
  type AuraNodeInput
} from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { SITES, type LanderSite } from "../../gameplay/sites";
import { createTerrainField, type TerrainField } from "../../gameplay/terrain";
import {
  DEBRIS,
  DUST,
  EXTRACTION_HALO,
  GHOST,
  LANDING_BEAM_HOT,
  LANDING_BEAM_MID,
  LANDING_BEAM_OUTER,
  PAD_APPROACH_LIGHT,
  PAD_RING,
  PLUME,
  PREDICTION_RING,
  SHOCKWAVE,
  SNOWFLAKE
} from "./materials";

/** Lander hero fits to this longest-axis size in scene units (meters). */
export const LANDER_TARGET_SIZE = 2.2;

export interface AuroraWorldNodes {
  readonly nodes: AuraNodeInput[];
  /** Every runtime node name belonging to site groups (`s<id>-*` prefix). */
  readonly siteNodeNames: readonly string[];
  /** Auroral curtain sheets, kept for the per-frame sway in boot. */
  readonly sheets: readonly AuroraSheet[];
  /** Terrain fields for all sites, built once (collider + query data reuse). */
  readonly fields: readonly TerrainField[];
}

/** Runtime node name prefix for one site's group (`s1-terrain`, …). */
export function sitePrefix(siteId: number): string {
  return `s${siteId}`;
}

/** Names of the runtime nodes that form one site's visible group. */
export function siteGroupNames(siteId: number): readonly string[] {
  const prefix = sitePrefix(siteId);
  return [
    `${prefix}-terrain`,
    `${prefix}-pad-ring`,
    `${prefix}-beacon-left`,
    `${prefix}-beacon-right`,
    `${prefix}-marker`,
    `${prefix}-pad-light-1`,
    `${prefix}-pad-light-2`,
    `${prefix}-pad-light-3`,
    `${prefix}-pad-light-4`,
    `${prefix}-landing-beam-1`,
    `${prefix}-landing-beam-2`,
    `${prefix}-landing-beam-3`
  ];
}

// ---------------------------------------------------------------- aurora -----
/**
 * Authored aurora curtains: three stacked sheets per curtain (centre rays
 * taller + hotter) so a curved diffuse light gradient emerges from opaque
 * narrow rays. Softness is geometry — emissive + low opacity composites to
 * near-black on this renderer, which is what made the title feature vanish.
 */
export interface AuroraSheet {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly tiltZ: number;
  readonly drive: number;
  readonly colorIndex: number;
}

function auroraCurtains(): readonly AuroraSheet[] {
  // Hug the terrain ridge: the chase reads the ridge near -39deg elevation, so
  // curtains spanning roughly -30..-5deg read as light standing up behind the
  // valley instead of a slab pasted across the frame.
  const curtainCentres = [
    { x: -96, y: 20, z: -126, w: 44, h: 62, tilt: 0.14, color: 0, rays: 7 },
    { x: -34, y: 26, z: -138, w: 38, h: 70, tilt: -0.1, color: 1, rays: 6 },
    { x: 30, y: 22, z: -130, w: 42, h: 66, tilt: 0.18, color: 2, rays: 7 },
    { x: 96, y: 30, z: -148, w: 34, h: 74, tilt: -0.16, color: 3, rays: 6 },
    { x: -2, y: 36, z: -166, w: 56, h: 80, tilt: 0.06, color: 4, rays: 8 }
  ];
  const sheets: AuroraSheet[] = [];
  for (const curtain of curtainCentres) {
    const pitch = curtain.w / curtain.rays;
    for (let r = 0; r < curtain.rays; r += 1) {
      const edge = 1 - Math.abs((r - (curtain.rays - 1) / 2) / ((curtain.rays - 1) / 2));
      const soft = 0.45 + edge * 0.55;
      sheets.push({
        x: curtain.x + (r - (curtain.rays - 1) / 2) * pitch,
        y: curtain.y + (soft - 1) * curtain.h * 0.16,
        z: curtain.z - edge * 6,
        w: pitch * 0.52,
        h: curtain.h * (0.62 + soft * 0.38),
        tiltX: curtain.tilt,
        tiltY: curtain.tilt * 0.18,
        tiltZ: curtain.tilt * 0.5 + (r - (curtain.rays - 1) / 2) * 0.012,
        drive: 0.85 + soft * 1.5,
        colorIndex: curtain.color
      });
    }
  }
  return sheets;
}

const STAR_POSITIONS = [
  [-92, 44, -142], [74, 38, -150], [-44, 52, -158], [108, 34, -138],
  [-128, 46, -152], [38, 56, -162], [-74, 28, -134], [126, 48, -156],
  [-18, 60, -166], [58, 24, -132], [-112, 50, -146], [88, 54, -160],
  [-58, 22, -130], [16, 42, -154], [-138, 52, -164], [138, 30, -140]
] as const;

// ---------------------------------------------------- extraction bay ---------
interface ExtractionPart {
  readonly id: string;
  readonly offset: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly color: string;
  readonly emissive?: string;
  readonly metallic?: number;
}

/**
 * Renderer-owned extraction architecture around the final-site pad — the
 * campaign-clear tableau and the launch gantry the opening approach flies
 * under. Set dressing silhouettes, never the hero.
 */
export const EXTRACTION_INFRASTRUCTURE: readonly ExtractionPart[] = [
  { id: "bay-deck", offset: [0, 0.02, 0.25], scale: [12.6, 0.16, 10.8], color: "#34343a", metallic: 0.62 },
  { id: "bay-rear-wall", offset: [0, 2.8, -5.05], scale: [12.6, 5.6, 0.26], color: "#4b403c", emissive: "#241c1a" },
  { id: "bay-left-wall", offset: [-6.15, 1.9, -0.7], scale: [0.24, 3.8, 8.1], color: "#454248", emissive: "#1c2028" },
  { id: "bay-right-wall", offset: [6.15, 1.9, -0.7], scale: [0.24, 3.8, 8.1], color: "#454248", emissive: "#1c2028" },
  { id: "gantry-left", offset: [-4.45, 2.15, -3.9], scale: [0.28, 4.3, 0.28], color: "#30343c", metallic: 0.72 },
  { id: "gantry-right", offset: [4.45, 2.15, -3.9], scale: [0.28, 4.3, 0.28], color: "#30343c", metallic: 0.72 },
  { id: "gantry-header", offset: [0, 4.32, -3.9], scale: [9.2, 0.28, 0.34], color: "#4b4b50", metallic: 0.78 },
  { id: "gantry-amber-left", offset: [-3.15, 4.33, -2.55], scale: [1.2, 0.13, 0.13], color: "#ffd166", emissive: "#f59e0b" },
  { id: "gantry-amber-right", offset: [3.15, 4.33, -2.55], scale: [1.2, 0.13, 0.13], color: "#ffd166", emissive: "#f59e0b" },
  { id: "service-left", offset: [-5.0, 0.62, 0.15], scale: [1.35, 1.22, 1.65], color: "#55545b", metallic: 0.42 },
  { id: "service-right", offset: [5.0, 0.58, -0.1], scale: [1.25, 1.12, 1.5], color: "#6b5548", metallic: 0.38 },
  { id: "runway-left", offset: [-3.15, 0.16, 3.0], scale: [0.12, 0.08, 5.6], color: "#67e8f9", emissive: "#0891b2" },
  { id: "runway-right", offset: [3.15, 0.16, 3.0], scale: [0.12, 0.08, 5.6], color: "#67e8f9", emissive: "#0891b2" },
  { id: "threshold-left", offset: [-1.55, 0.17, 5.7], scale: [1.15, 0.1, 0.14], color: "#fef3c7", emissive: "#f59e0b" },
  { id: "threshold-right", offset: [1.55, 0.17, 5.7], scale: [1.15, 0.1, 0.14], color: "#fef3c7", emissive: "#f59e0b" },
  { id: "landing-plinth", offset: [0, 0.18, 0], scale: [3.75, 0.28, 3.75], color: "#292d35", metallic: 0.74 },
  { id: "plinth-warm-left", offset: [-1.91, 0.32, 0], scale: [0.08, 0.08, 3.2], color: "#ffd38a", emissive: "#f59e0b" },
  { id: "plinth-warm-right", offset: [1.91, 0.32, 0], scale: [0.08, 0.08, 3.2], color: "#ffd38a", emissive: "#f59e0b" }
];

// ------------------------------------------------------------------ world ---

function siteGroupNodes(site: LanderSite, field: TerrainField, visible: boolean): AuraNodeInput[] {
  const prefix = sitePrefix(site.id);
  const pad = site.pads[0]!;
  const padHeight = field.padHeights[0] ?? 0;
  const nodes: AuraNodeInput[] = [];

  nodes.push(
    geometry.custom(
      {
        kind: "aura-custom-geometry",
        positions: field.geometryPositions,
        normals: field.geometryNormals,
        indices: field.geometryIndices
      },
      {
        name: `${prefix} heightfield terrain`,
        material: material.pbr({
          name: `${prefix} regolith`,
          color: site.terrainColor,
          roughness: 0.94,
          metallic: 0.02
        }),
        receiveShadow: true
      }
    )
      .position(0, 0, 0)
      .runtime(game.runtimeNode(`${prefix}-terrain`, { tags: ["world", "heightfield", "authored-procedural"] }))
      .toJSON()
  );

  nodes.push(
    primitives.torus({
      name: `${prefix} pad zone ring`,
      material: PAD_RING
    })
      .position(pad.x, padHeight + 0.09, pad.z)
      .rotate(Math.PI / 2, 0, 0)
      .scale([pad.radius * 2.05, pad.radius * 2.05, 0.3])
      .runtime(game.runtimeNode(`${prefix}-pad-ring`, { tags: ["pad", "zone-marker", "renderer-owned"] }))
      .toJSON()
  );

  for (const [side, px, pz] of [
    ["left", pad.x - pad.radius - 1.4, pad.z + pad.radius + 1.2],
    ["right", pad.x + pad.radius + 1.4, pad.z - pad.radius - 1.2]
  ] as const) {
    nodes.push(
      model(assets.auroraPadBeacon, {
        name: `${prefix} beacon ${side}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.9,
        castShadow: true,
        visible
      })
        .position(px, padHeight, pz)
        .runtime(game.runtimeNode(`${prefix}-beacon-${side}`, { tags: ["pad", "typed-prop"] }))
        .toJSON()
    );
  }

  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    nodes.push(
      primitives.sphere({
        name: `${prefix} pad approach light ${i + 1}`,
        material: PAD_APPROACH_LIGHT
      })
        .position(
          pad.x + Math.cos(angle) * (pad.radius + 1.7),
          padHeight + 0.5,
          pad.z + Math.sin(angle) * (pad.radius + 1.7)
        )
        .scale(visible ? 0.22 : 0.001)
        .runtime(game.runtimeNode(`${prefix}-pad-light-${i + 1}`, { tags: ["pad", "approach-lights", "renderer-owned"] }))
        .toJSON()
    );
  }

  // Diegetic landing beam: the campaign opens 72m above the pad, so a nested
  // opaque column keeps the objective findable without a debug marker.
  const beamLayers = [
    { radius: 0.13, height: 24, mat: LANDING_BEAM_HOT },
    { radius: 0.34, height: 19, mat: LANDING_BEAM_MID },
    { radius: 0.7, height: 14, mat: LANDING_BEAM_OUTER }
  ];
  beamLayers.forEach((layer, i) => {
    nodes.push(
      primitives.cylinder({
        name: `${prefix} pad landing beam ${i + 1}`,
        material: layer.mat
      })
        .position(pad.x, padHeight + layer.height / 2, pad.z)
        .scale([layer.radius, layer.height, layer.radius])
        .runtime(game.runtimeNode(`${prefix}-landing-beam-${i + 1}`, { tags: ["pad", "objective-beam", "renderer-owned"] }))
        .toJSON()
    );
  });

  nodes.push(
    text3D(`SITE ${site.id}`, { size: 0.7, depth: 0.18, backend: "sdf" })
      .position(pad.x - 2.2, padHeight + 2.4, pad.z - 3.3)
      .rotate(0.42, 0.78, 0)
      .runtime(game.runtimeNode(`${prefix}-marker`, { tags: ["site-marker", "text3d"] }))
      .toJSON()
  );

  return nodes;
}

export function auroraWorldNodes(): AuroraWorldNodes {
  const nodes: AuraNodeInput[] = [];
  const siteNodeNames: string[] = [];
  const sheets = auroraCurtains();
  const sheetColors = [SITES[0]!.auroraColor, "#818cf8", "#38bdf8", "#ec4899", "#34d399"];

  // Gas giant + planetary ring in the star field — the hemisphere reads lit
  // (own star + key) rather than the black disc the old #0f172a tone punched.
  nodes.push(
    primitives.sphere({
      name: "celestial planet",
      material: material.pbr({
        name: "planet-surface",
        color: "#2f6f8f",
        emissive: "#0ea5e9",
        emissiveIntensity: 0.55,
        roughness: 0.62,
        metallic: 0.08
      })
    })
      .position(-104, 86, -196)
      .scale([15, 15, 15])
      .runtime(game.runtimeNode("celestial-planet", { tags: ["environment", "space"] }))
      .toJSON(),
    primitives.torus({
      name: "planet ring",
      material: material.emissive({
        name: "ring-glow",
        color: "#fbbf24",
        emissive: "#f59e0b",
        emissiveIntensity: 1.6
      })
    })
      .position(-104, 86, -196)
      .rotate(1.32, 0.35, 0.2)
      .scale([30, 30, 0.7])
      .runtime(game.runtimeNode("planet-ring", { tags: ["environment", "space"] }))
      .toJSON()
  );

  STAR_POSITIONS.forEach((pos, idx) => {
    nodes.push(
      primitives.sphere({
        name: `star-${idx}`,
        material: material.emissive({
          name: `star-glow-${idx}`,
          color: idx % 2 === 0 ? "#bae6fd" : "#fef08a",
          emissive: idx % 2 === 0 ? "#38bdf8" : "#fbbf24",
          emissiveIntensity: 2.2
        })
      })
        .position(pos[0], pos[1], pos[2])
        .scale([1.5, 1.5, 1.5])
        .runtime(game.runtimeNode(`star-${idx}`, { tags: ["environment", "stars"] }))
        .toJSON()
    );
  });

  sheets.forEach((sheet, i) => {
    const sheetColor = sheetColors[sheet.colorIndex % sheetColors.length]!;
    // Opaque emissive — passing `opacity` routes through the transparent pass
    // where the sheets contributed no light and the aurora never appeared.
    nodes.push(
      primitives.box({
        name: `aurora band ${i + 1}`,
        material: material.emissive({
          name: `aurora glow ${i + 1}`,
          color: sheetColor,
          emissive: sheetColor,
          emissiveIntensity: sheet.drive
        })
      })
        .position(sheet.x, sheet.y, sheet.z)
        .rotate(sheet.tiltX, sheet.tiltY, sheet.tiltZ)
        .scale([sheet.w, sheet.h, 1.5])
        .runtime(game.runtimeNode(`aurora-band-${i + 1}`, { tags: ["environment", "aurora-band", "renderer-owned"] }))
        .toJSON()
    );
  });

  // One group per site, built up front; only the active site renders.
  const fields = SITES.map((site) => createTerrainField({ site }));
  SITES.forEach((site, index) => {
    nodes.push(...siteGroupNodes(site, fields[index]!, index === 0));
    siteNodeNames.push(...siteGroupNames(site.id));
  });

  // Hero lander + replay ghost are GLOBAL across sites.
  const firstSpawn = SITES[0]!.spawn;
  nodes.push(
    model(assets.auroraLanderProbe, {
      name: "aurora lander probe",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: LANDER_TARGET_SIZE,
      castShadow: true,
      receiveShadow: true
    })
      .position(firstSpawn.x, firstSpawn.y, firstSpawn.z)
      .runtime(game.runtimeNode("lander", { tags: ["player", "lander", "typed-primary-asset"] }))
      .toJSON()
  );
  nodes.push(
    model(assets.auroraLanderProbe, {
      name: "replay ghost",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: LANDER_TARGET_SIZE,
      visible: false,
      material: GHOST
    })
      .position(firstSpawn.x, firstSpawn.y, firstSpawn.z)
      .runtime(game.runtimeNode("lander-ghost", { tags: ["ghost", "visual-only", "input-replay"] }))
      .toJSON()
  );

  // Thrust plume: stretched emissive sphere under the skirt, scaled by throttle.
  nodes.push(
    primitives.sphere({ name: "thrust plume", material: PLUME })
      .position(0, -50, 0)
      .scale(0.001)
      .runtime(game.runtimeNode("thrust-plume", { tags: ["vehicle-feedback", "plume", "renderer-owned"] }))
      .toJSON()
  );
  for (let i = 0; i < 12; i += 1) {
    nodes.push(
      primitives.sphere({ name: `surface dust ${i + 1}`, material: DUST })
        .position(0, -50, 0)
        .scale(0.001)
        .runtime(game.runtimeNode(`dust-${i + 1}`, { tags: ["vehicle-feedback", "dust", "renderer-owned"] }))
        .toJSON()
    );
  }
  for (let i = 0; i < 10; i += 1) {
    nodes.push(
      primitives.box({ name: `crash debris ${i + 1}`, material: DEBRIS })
        .position(0, -50, 0)
        .scale(0.18)
        .runtime(game.runtimeNode(`debris-${i + 1}`, { tags: ["crash-feedback", "debris", "renderer-owned"] }))
        .toJSON()
    );
  }
  nodes.push(
    primitives.torus({ name: "impact shockwave", material: SHOCKWAVE })
      .position(0, -50, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale(0.001)
      .runtime(game.runtimeNode("impact-shockwave", { tags: ["crash-feedback", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "bounded landing estimate", material: PREDICTION_RING })
      .position(0, -50, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([1.15, 1.15, 0.08])
      .runtime(game.runtimeNode("landing-prediction", { tags: ["prediction", "bounded-estimate", "renderer-owned"] }))
      .toJSON()
  );

  // Site-owned whiteout flakes — deterministic wrap driven by sim time.
  for (let i = 0; i < 72; i += 1) {
    nodes.push(
      primitives.sphere({ name: `whiteout snow ${i + 1}`, material: SNOWFLAKE })
        .position(0, -50, 0)
        .scale(0.035)
        .runtime(game.runtimeNode(`whiteout-${i + 1}`, { tags: ["weather", "whiteout", "renderer-owned"] }))
        .toJSON()
    );
  }

  // Campaign-clear extraction tableau (parked at y=-50 until the final grade).
  nodes.push(
    model(assets.auroraExtractionLanderHero, {
      name: "aurora extraction lander presentation",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 2.8,
      visible: false,
      castShadow: false,
      receiveShadow: false
    })
      .position(0, -50, 0)
      .runtime(game.runtimeNode("extraction-lander", { tags: ["campaign-clear", "typed-primary-asset", "non-colliding"] }))
      .toJSON(),
    text3D("EXTRACTION READY", { size: 2.1, depth: 0.35, backend: "sdf" })
      .position(0, -50, 0)
      .runtime(game.runtimeNode("extraction-title", { tags: ["campaign-clear", "extraction-tableau", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "extraction halo", material: EXTRACTION_HALO })
      .position(0, -50, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([5.5, 5.5, 0.18])
      .runtime(game.runtimeNode("extraction-halo", { tags: ["campaign-clear", "extraction-tableau", "renderer-owned"] }))
      .toJSON(),
    model(assets.auroraExtractionBayBackdrop, {
      name: "aurora extraction bay backdrop",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 50,
      visible: false
    })
      .position(0, -50, 0)
      .runtime(game.runtimeNode("extraction-bay-backdrop", { tags: ["campaign-clear", "typed-environment", "non-colliding"] }))
      .toJSON()
  );

  EXTRACTION_INFRASTRUCTURE.forEach((part) => {
    const partMaterial = part.emissive
      ? material.emissive({ name: `${part.id} extraction practical`, color: part.color, emissive: part.emissive, opacity: 0.94 })
      : material.pbr({ name: `${part.id} extraction structure`, color: part.color, roughness: 0.48, metallic: part.metallic ?? 0.35 });
    nodes.push(
      primitives.box({ name: `extraction ${part.id}`, material: partMaterial, castShadow: true, receiveShadow: true })
        .position(0, -50, 0)
        .scale(part.scale)
        .runtime(game.runtimeNode(`extraction-${part.id}`, { tags: ["campaign-clear", "extraction-infrastructure", "renderer-owned"] }))
        .toJSON()
    );
  });

  return { nodes, siteNodeNames, sheets, fields };
}

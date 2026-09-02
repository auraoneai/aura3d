import {
  consolidateStaticMeshes,
  Geometry,
  PBRMaterial,
  UnlitMaterial,
  type RenderItem
} from "@aura3d/engine/rendering";
import { composeMat4, quatFromEuler, type Mat4 } from "@aura3d/scene";
import type { AuraClashArenaTweaksState } from "./ArenaTweaksPanel";

/**
 * ## What this layer is, and what it is not
 *
 * The typed `arenaNeonDowntownTextured` GLB owns the *architecture*: streets, sidewalks, six
 * buildings, props, and the authored emerald floor rails and neon signage. This module owns only
 * the **fighting-stage furniture** that a generic city block cannot provide — the readable combat
 * platform, the lane boundary the fighters are actually clamped to, and the stage lighting practicals
 * that separate the fighters from the brick behind them.
 *
 * Two earlier revisions got this boundary wrong in opposite directions. First, six primitive cubes
 * pretended to be a `skyline-buildings` backdrop, which the repo forbids and which rendered as flat
 * dark rectangles. Then, after the primitives were removed, what remained (`left-banner`,
 * `left-light-pillar`, ten `portal-segment-*` bars) was authored against an empty void: with real
 * architecture behind it, unlit bare slabs floating at chest height and a ring of loose bars read as
 * debris scattered over the scene rather than as stage design.
 *
 * So every element here is now either (a) part of the fight plane the gameplay depends on, or
 * (b) a *grounded* practical — a light housing standing on the floor with a visible emissive
 * source — rather than a free-floating bar. Nothing in this layer stands in for architecture.
 */

export interface RenderedArenaStage {
  collect(tweaks: AuraClashArenaTweaksState, frame: number): RenderItem[];
}

/**
 * Stage-light practicals, placed outside the fighter lane (`stage.minX`/`maxX` = +/-2.85) so they
 * frame the fight without ever occluding it.
 *
 * The x positions are bounded by the *measured* frame, not chosen by feel. `cameraFrameBounds` spans
 * x +/-2.8 with the preset's 0.1 padding ratio; in the captured 1246px canvas the 5.8-unit floor slab
 * spans 935px, so the visible half-width at the fight plane is ~3.87 units. An earlier pass placed
 * these at +/-3.32 and +/-4.12, which put the outer pair entirely off-screen and cut the inner pair
 * at the frame edge. +/-3.06 and +/-3.44 sit at 79% and 89% of the half-width, clear of the platform
 * but fully inside the frame.
 */
const PRACTICAL_POSTS = [
  { x: -3.06, z: -0.42 },
  { x: 3.06, z: -0.42 },
  { x: -3.44, z: 0.46 },
  { x: 3.44, z: 0.46 }
] as const;

export function createRenderedArenaStage(): RenderedArenaStage {
  const cube = Geometry.litCube(1);
  const mote = Geometry.uvSphere(0.5, 12, 8);
  // Cylinders rather than cubes: a light housing is a round object, and a square "pillar" was one of
  // the tells that made the previous stage read as untextured blockout.
  const post = Geometry.cylinder({ radius: 0.5, height: 1, segments: 16 });
  const lampHousing = Geometry.cylinder({ radius: 0.5, height: 1, segments: 14 });
  const glowSphere = Geometry.uvSphere(0.5, 14, 10);
  // The typed downtown GLB supplies the buildings and street, but a fighting stage also needs a
  // foreground safety rail that gives the combat plane a believable edge.  These are deliberately
  // low, grounded stage fixtures (not architecture or stand-in characters) and sit in front of the
  // lane at z=0.74, where they read as an arena apron without crossing either fighter clamp.
  const barrierPost = Geometry.cylinder({ radius: 0.5, height: 1, segments: 14 });
  const barrierBeam = Geometry.cylinder({ radius: 0.5, height: 1, segments: 14 });

  const floor = new PBRMaterial({
    name: "aura-clash-rendered-combat-floor",
    baseColor: [0.018, 0.045, 0.052, 1],
    metallic: 0.26,
    roughness: 0.24,
    emissiveColor: [0.02, 0.16, 0.14],
    emissiveStrength: 0.14
  });
  // The riser reads as a built platform edge under the fight plane, giving the floor a thickness
  // that sits on the arena's own ground rather than appearing to hover over it.
  const riser = new PBRMaterial({
    name: "aura-clash-rendered-stage-riser",
    baseColor: [0.052, 0.058, 0.068, 1],
    metallic: 0.18,
    roughness: 0.62
  });
  // Dark metal housings: unlit slabs read as untextured primitives, but a rough dark PBR housing
  // carrying a bright emissive lamp reads as a stage light.
  const housing = new PBRMaterial({
    name: "aura-clash-rendered-practical-housing",
    baseColor: [0.042, 0.046, 0.055, 1],
    metallic: 0.68,
    roughness: 0.41
  });
  const barrierMetal = new PBRMaterial({
    name: "aura-clash-foreground-barrier-metal",
    baseColor: [0.028, 0.068, 0.082, 1],
    metallic: 0.72,
    roughness: 0.32,
    emissiveColor: [0.015, 0.12, 0.14],
    emissiveStrength: 0.12
  });

  const paletteMaterials = {
    holo: {
      rim: new UnlitMaterial({ name: "holo-teal-rim", color: [0.2, 1, 0.82, 1] }),
      accent: new UnlitMaterial({ name: "holo-amber-accent", color: [1, 0.68, 0.22, 1] }),
      haze: new UnlitMaterial({ name: "holo-motes", color: [0.38, 1, 0.84, 0.5] })
    },
    cyber: {
      rim: new UnlitMaterial({ name: "cyber-magenta-rim", color: [1, 0.22, 0.72, 1] }),
      accent: new UnlitMaterial({ name: "cyber-cyan-accent", color: [0.22, 0.86, 1, 1] }),
      haze: new UnlitMaterial({ name: "cyber-motes", color: [1, 0.34, 0.78, 0.48] })
    },
    ember: {
      rim: new UnlitMaterial({ name: "ember-rim", color: [1, 0.42, 0.12, 1] }),
      accent: new UnlitMaterial({ name: "ember-gold-accent", color: [1, 0.82, 0.24, 1] }),
      haze: new UnlitMaterial({ name: "ember-motes", color: [1, 0.48, 0.14, 0.46] })
    },
    void: {
      rim: new UnlitMaterial({ name: "void-violet-rim", color: [0.58, 0.38, 1, 1] }),
      accent: new UnlitMaterial({ name: "void-blue-accent", color: [0.18, 0.52, 1, 1] }),
      haze: new UnlitMaterial({ name: "void-motes", color: [0.64, 0.44, 1, 0.44] })
    }
  } as const;

  // Barrier meshes never change shape during play.  Merge the metal beam/posts once per palette so
  // the richer apron costs one submitted draw instead of one draw per fixture on every frame.  Edge
  // strips stay palette-specific (teal on the player side, amber on the rival side) and remain two
  // tiny draws, keeping the impact VFX comfortably inside the 160-draw route budget.
  const barrierItemsByPalette = Object.fromEntries(
    Object.entries(paletteMaterials).map(([paletteId, palette]) => {
      const sourceItems = [
        item("front-barrier-lower", barrierBeam, barrierMetal, [0, 0.22, 0.74], [0.045, 2.9, 0.045], [0, 0, Math.PI / 2]),
        item("front-barrier-upper", barrierBeam, barrierMetal, [0, 0.43, 0.74], [0.032, 2.9, 0.032], [0, 0, Math.PI / 2]),
        item("front-barrier-post-left", barrierPost, barrierMetal, [-2.72, 0.28, 0.74], [0.075, 0.56, 0.075]),
        item("front-barrier-post-right", barrierPost, barrierMetal, [2.72, 0.28, 0.74], [0.075, 0.56, 0.075]),
        item("barrier-edge-left", cube, palette.rim, [-1.42, 0.43, 0.77], [1.22, 0.022, 0.018]),
        item("barrier-edge-right", cube, palette.accent, [1.42, 0.43, 0.77], [1.22, 0.022, 0.018])
      ];
      const merged = consolidateStaticMeshes(
        sourceItems.flatMap((entry) => entry.material
          ? [{
              geometry: entry.geometry,
              material: entry.material,
              modelMatrix: entry.modelMatrix ?? composeMat4([0, 0, 0], quatFromEuler(0, 0, 0), [1, 1, 1]) as Mat4
            }]
          : []),
        { labelPrefix: `aura-clash-rendered-stage:barrier-${paletteId}` }
      ).renderItems;
      return [paletteId, merged.map((entry, index) => ({
        ...entry,
        label: index === 0
          ? "aura-clash-rendered-stage:front-barrier-merged"
          : `aura-clash-rendered-stage:barrier-edge-${paletteId}-${index}`,
        includeInAutoFrame: false
      }))] as const;
    })
  ) as Record<keyof typeof paletteMaterials, RenderItem[]>;

  // Motes are kept low and near the fight plane so they read as stage haze catching the practicals
  // rather than as snow drifting across the buildings.
  const motes = Array.from({ length: 8 }, (_, index) => ({
    x: -2.7 + (index * 1.37) % 5.4,
    y: 0.18 + (index * 0.29) % 1.02,
    z: -0.55 + (index % 5) * 0.21,
    phase: index * 0.73
  }));

  return {
    collect(tweaks, frame) {
      const palette = paletteMaterials[tweaks.palette];
      const items: RenderItem[] = [
        // The riser sits just under the floor slab and slightly wider, so the platform has a visible
        // built edge where it meets the arena's ground plane.
        item("stage-riser", cube, riser, [0, -0.135, 0], [6.05, 0.14, 1.34]),
        item("combat-floor", cube, floor, [0, -0.055, 0], [5.8, 0.075, 1.16]),
        item("front-rim", cube, palette.rim, [0, 0.04, 0.61], [5.75, 0.026, 0.026]),
        item("back-rim", cube, palette.accent, [0, 0.04, -0.54], [5.55, 0.018, 0.022]),
        item("center-line", cube, palette.rim, [0, 0.045, 0], [0.025, 0.024, 1.12]),
        // Lane markers sit exactly on the clamp the fighters cannot cross, so the boundary the
        // simulation enforces is the boundary the player can see. `stage.minX`/`maxX` is +/-2.85.
        item("lane-marker-left", cube, palette.accent, [-2.85, 0.042, 0], [0.022, 0.022, 1.1]),
        item("lane-marker-right", cube, palette.accent, [2.85, 0.042, 0], [0.022, 0.022, 1.1])
      ];
      items.push(...barrierItemsByPalette[tweaks.palette]);

      if (tweaks.reflections) {
        items.push(item("floor-sheen", cube, palette.rim, [0, -0.004, 0.18], [2.8, 0.008, 0.38]));
      }

      // Grounded stage practicals replace the former floating banner slabs and portal ring. Each is a
      // post standing on the floor, a housing at the top, and an emissive lamp inside it.
      if (tweaks.backdrop !== "skyline") {
        const motion = tweaks.motion === "static" ? 0 : frame * (tweaks.motion === "lively" ? 0.024 : 0.009);
        for (const [index, practical] of PRACTICAL_POSTS.entries()) {
          const height = index < 2 ? 1.94 : 1.52;
          // A slow brightness pulse per practical, phase-offset so the stage is not uniformly lit.
          const pulse = tweaks.motion === "static" ? 1 : 0.82 + Math.sin(motion * 2.2 + index * 1.7) * 0.18;
          items.push(item(`practical-post-${index}`, post, housing, [practical.x, height / 2, practical.z], [0.07, height, 0.07]));
          items.push(item(`practical-lamp-${index}`, lampHousing, housing, [practical.x, height + 0.05, practical.z], [0.15, 0.12, 0.15]));
          items.push(item(
            `practical-glow-${index}`,
            glowSphere,
            index % 2 === 0 ? palette.rim : palette.accent,
            [practical.x, height + 0.015, practical.z],
            [0.115 * pulse, 0.075 * pulse, 0.115 * pulse]
          ));
        }
      }

      if (tweaks.particles) {
        const motion = tweaks.motion === "static" ? 0 : frame * (tweaks.motion === "lively" ? 0.018 : 0.008);
        for (const [index, particle] of motes.entries()) {
          const y = particle.y + Math.sin(motion + particle.phase) * 0.12;
          items.push(item(`atmospheric-mote-${index}`, mote, palette.haze, [particle.x, y, particle.z], [0.022, 0.022, 0.022]));
        }
      }
      return items;
    }
  };
}

function item(
  label: string,
  geometry: Geometry,
  material: PBRMaterial | UnlitMaterial,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0]
): RenderItem {
  return {
    label: `aura-clash-rendered-stage:${label}`,
    geometry,
    material,
    modelMatrix: composeMat4([...position], quatFromEuler(rotation[0], rotation[1], rotation[2]), [...scale]) as Mat4,
    includeInAutoFrame: true
  };
}

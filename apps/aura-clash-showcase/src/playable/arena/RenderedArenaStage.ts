import {
  Geometry,
  PBRMaterial,
  UnlitMaterial,
  type RenderItem
} from "@aura3d/engine/rendering";
import { composeMat4, quatFromEuler, type Mat4 } from "@aura3d/scene";
import type { AuraClashArenaTweaksState } from "./ArenaTweaksPanel";

export const auraClashRenderedStageLabels = [
  "combat-floor",
  "front-rim",
  "back-rim",
  "center-line",
  "portal-segments",
  "skyline-buildings",
  "side-banners",
  "light-pillars",
  "atmospheric-motes",
  "floor-sheen"
] as const;

export interface RenderedArenaStage {
  collect(tweaks: AuraClashArenaTweaksState, frame: number): RenderItem[];
}

export function createRenderedArenaStage(): RenderedArenaStage {
  const cube = Geometry.litCube(1);
  const mote = Geometry.uvSphere(0.5, 12, 8);
  const floor = new PBRMaterial({
    name: "aura-clash-rendered-combat-floor",
    baseColor: [0.018, 0.045, 0.052, 1],
    metallic: 0.26,
    roughness: 0.24,
    emissiveColor: [0.02, 0.16, 0.14],
    emissiveStrength: 0.14
  });
  const skyline = new PBRMaterial({
    name: "aura-clash-rendered-skyline",
    baseColor: [0.018, 0.04, 0.065, 1],
    metallic: 0.12,
    roughness: 0.72,
    emissiveColor: [0.01, 0.06, 0.1],
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
  const skylineBlocks = [
    [-2.65, 0.62, -1.36, 0.38, 1.25], [-2.18, 0.82, -1.4, 0.32, 1.65],
    [-1.16, 0.92, -1.42, 0.3, 1.85],
    [1.18, 0.5, -1.4, 0.42, 1], [1.68, 0.88, -1.42, 0.32, 1.78],
    [2.64, 0.78, -1.4, 0.34, 1.56]
  ] as const;
  const motes = Array.from({ length: 8 }, (_, index) => ({
    x: -2.7 + (index * 1.37) % 5.4,
    y: 0.24 + (index * 0.41) % 1.82,
    z: -0.9 + (index % 5) * 0.23,
    phase: index * 0.73
  }));

  return {
    collect(tweaks, frame) {
      const palette = paletteMaterials[tweaks.palette];
      const items: RenderItem[] = [
        item("combat-floor", cube, floor, [0, -0.055, 0], [5.8, 0.075, 1.16]),
        item("front-rim", cube, palette.rim, [0, 0.04, 0.61], [5.75, 0.026, 0.026]),
        item("back-rim", cube, palette.accent, [0, 0.04, -0.54], [5.55, 0.018, 0.022]),
        item("center-line", cube, palette.rim, [0, 0.045, 0], [0.025, 0.024, 1.12]),
        item("left-banner", cube, palette.accent, [-2.48, 0.78, -1.1], [0.16, 1.48, 0.035]),
        item("right-banner", cube, palette.accent, [2.48, 0.78, -1.1], [0.16, 1.48, 0.035]),
        item("left-light-pillar", cube, palette.rim, [-2.82, 0.82, -0.72], [0.035, 1.64, 0.035]),
        item("right-light-pillar", cube, palette.rim, [2.82, 0.82, -0.72], [0.035, 1.64, 0.035])
      ];
      if (tweaks.reflections) {
        items.push(item("floor-sheen", cube, palette.rim, [0, -0.004, 0.18], [2.8, 0.008, 0.38]));
      }
      if (tweaks.backdrop !== "portal") {
        for (const [x, y, z, width, height] of skylineBlocks) {
          items.push(item(`skyline-${x}`, cube, skyline, [x, y, z], [width, height, 0.22]));
        }
      }
      if (tweaks.backdrop !== "skyline") {
        const motion = tweaks.motion === "static" ? 0 : frame * (tweaks.motion === "lively" ? 0.024 : 0.009);
        for (let index = 0; index < 10; index += 1) {
          const angle = (index / 10) * Math.PI * 2 + motion;
          items.push(item(
            `portal-segment-${index}`,
            cube,
            index % 2 === 0 ? palette.rim : palette.accent,
            [Math.cos(angle) * 1.12, 1.13 + Math.sin(angle) * 0.82, -1.28],
            [0.2, 0.035, 0.035],
            [0, 0, angle + Math.PI / 2]
          ));
        }
      }
      if (tweaks.particles) {
        const motion = tweaks.motion === "static" ? 0 : frame * (tweaks.motion === "lively" ? 0.018 : 0.008);
        for (const [index, particle] of motes.entries()) {
          const y = particle.y + Math.sin(motion + particle.phase) * 0.16;
          items.push(item(`atmospheric-mote-${index}`, mote, palette.haze, [particle.x, y, particle.z], [0.025, 0.025, 0.025]));
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

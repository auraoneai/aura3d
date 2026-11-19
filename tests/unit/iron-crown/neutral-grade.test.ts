/**
 * IRON CROWN owner neutral-grade pass ("too much orange / sun-bright fade": a warm grade and warm haze washed every venue
 * into one brown-orange, the fighters blended into the pillars and throne, white motes drifted over them, and Neo-Tokyo's
 * flood shaft pooled like steam over their legs).
 *
 * Pins, per venue, on the scene each venue actually mounts by default (refined look on the Crown, Colosseum, Airstrip and
 * Monastery; the GU47 row on Neo-Tokyo and the Dock):
 * - the frame output: no AgX fade, no warm strip LUT;
 * - the grade: near-neutral white balance and tint, no venue LUT, contrast and saturation restored, no exposure lift;
 * - bloom: the node the post bridge drives (the first bloom) is neutral, weak and high-threshold;
 * - haze: linear fog is zero in the fight plane, no volumetric fog, every light cone stays behind the lane (z < -1);
 * - the fighters are the subject: a neutral key, strong back rims behind each fighter, a lower environment fill and a
 *   vignette so the set sits darker than the pair (the >= 1.8:1 fighter/background luminance target is a GPU check);
 * - ambient motes and dust: few, small, dim, and every particle's reach stays behind the lane;
 * - weather volumes: capped count and alpha.
 */
import { describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import { buildArenaScene } from "../../../apps/showcase-iron-crown/src/game/arena";
import { fighterById } from "../../../apps/showcase-iron-crown/src/game/fighters";
import {
  FIGHT_LANE_BACK_Z,
  IRON_CROWN_OUTPUT,
  lightConeMaxZ,
  RIM_IDS,
  STAGE_LOOKS,
  stageLook
} from "../../../apps/showcase-iron-crown/src/game/look";
import { REFINED_LOOKS } from "../../../apps/showcase-iron-crown/src/game/refinedLook";
import { STAGES, type IronStage, type StageId } from "../../../apps/showcase-iron-crown/src/game/stages";
import {
  ambientEmitterMaxZ,
  ambientLiveParticles,
  AMBIENT_EMITTERS,
  ironCrownVfxPresets
} from "../../../apps/showcase-iron-crown/src/game/vfx";

type Node = AuraSceneNode & Record<string, unknown> & { children?: Node[] };

/** Camera z (arena.ts) and the deepest point of the fight lane the camera looks through. */
const CAMERA_Z = 5.6;
const FIGHT_PLANE_DEPTH = CAMERA_Z - FIGHT_LANE_BACK_Z * 3; // 8.6 m: well past the back of the lane

function mountedNodes(stage: IronStage): Node[] {
  const nodes = buildArenaScene({
    stage,
    p1: fighterById("kenji"),
    cpu: fighterById("volt"), // Mara Volt
    typedFighterAssets: {},
    playerStart: [-2.2, 0, 0],
    rivalStart: [2.2, 0, 0],
    contactShadows: true,
    reducedMotion: false,
    liveFlipbooks: true
  }).toJSON().nodes as Node[];
  // Depth-first, pre-order: the order the post bridge flattens the scene in (it drives bloom from the first bloom node).
  const flat: Node[] = [];
  const walk = (list: readonly Node[]) => {
    for (const node of list) {
      flat.push(node);
      if (Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(nodes);
  return flat;
}

const effectsOf = (nodes: readonly Node[], effect: string) => nodes.filter((n) => n.kind === "effect" && n.effect === effect);
const lightsOf = (nodes: readonly Node[]) => nodes.filter((n) => n.kind === "light");

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
/** Warmth of a colour: red over blue (1 = neutral). */
const warmth = (hex: string) => {
  const [r, , b] = rgb(hex);
  return r / Math.max(b, 1e-3);
};
/** sRGB relative luminance (0..1). */
const luminance = (hex: string) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb(hex).map(lin) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Per-venue bounds. */
const GRADE = { temperature: [-0.12, 0.04], tintAbs: 0.03, contrast: [1.18, 1.35], saturation: [1.06, 1.2], exposureEv: [-0.12, 0.12] } as const;
const BLOOM = { maxIntensity: 0.22, minThreshold: 1.4, maxWarmth: 1.1 } as const;
const KEY_MAX_WARMTH = 1.4;
const RIM_MIN_INTENSITY = 15;
const ENV_MAX = 0.75;
const VIGNETTE_MIN = 0.25;
const FOG_MAX_OPACITY_IN_FIGHT_PLANE = 0.01;

const VENUES: readonly StageId[] = STAGES.map((s) => s.id);

describe("iron-crown neutral-grade pass (owner: too much orange / sun-bright fade)", () => {
  it("renders every venue through ACES with a neutral strip LUT (no AgX fade, no cinema-warm cast, no exposure lift)", () => {
    expect(IRON_CROWN_OUTPUT.toneMapping).toBe("aces");
    expect(IRON_CROWN_OUTPUT.lut.preset).not.toBe("cinema-warm");
    expect(IRON_CROWN_OUTPUT.lut.intensity).toBeLessThanOrEqual(0.3);
    expect(IRON_CROWN_OUTPUT.exposure).toBeLessThanOrEqual(1);
  });

  for (const id of VENUES) {
    describe(id, () => {
      const stage = STAGES.find((s) => s.id === id)!;
      const nodes = mountedNodes(stage);
      const refined = REFINED_LOOKS[id];

      it("grades near neutral: white balance, tint, no LUT, contrast and saturation restored, no exposure lift", () => {
        const grades = effectsOf(nodes, "color-grade");
        expect(grades).toHaveLength(1);
        const grade = grades[0]!;
        const temperature = Number(grade.temperature ?? 0);
        expect(temperature).toBeGreaterThanOrEqual(GRADE.temperature[0]);
        expect(temperature).toBeLessThanOrEqual(GRADE.temperature[1]);
        expect(Math.abs(Number(grade.tint ?? 0))).toBeLessThanOrEqual(GRADE.tintAbs);
        expect(grade.lut).toBeUndefined();
        expect(Number(grade.contrast)).toBeGreaterThanOrEqual(GRADE.contrast[0]);
        expect(Number(grade.contrast)).toBeLessThanOrEqual(GRADE.contrast[1]);
        expect(Number(grade.saturation)).toBeGreaterThanOrEqual(GRADE.saturation[0]);
        expect(Number(grade.saturation)).toBeLessThanOrEqual(GRADE.saturation[1]);
        const ev = Math.log2(Number(grade.exposure ?? 1));
        expect(ev).toBeGreaterThanOrEqual(GRADE.exposureEv[0]);
        expect(ev).toBeLessThanOrEqual(GRADE.exposureEv[1]);
      });

      it("blooms neutral, weak and high-threshold (the first bloom node drives the stage)", () => {
        const blooms = effectsOf(nodes, "bloom");
        expect(blooms.length).toBeGreaterThanOrEqual(1);
        const driving = blooms[0]!;
        expect(Number(driving.intensity)).toBeLessThanOrEqual(BLOOM.maxIntensity);
        expect(Number(driving.threshold)).toBeGreaterThanOrEqual(BLOOM.minThreshold);
        for (const bloom of blooms) {
          expect(typeof bloom.color).toBe("string");
          const w = warmth(String(bloom.color));
          expect(w).toBeLessThanOrEqual(BLOOM.maxWarmth);
          expect(w).toBeGreaterThanOrEqual(1 / BLOOM.maxWarmth);
        }
      });

      it("keeps the fight plane haze-free: linear fog is zero there, no volumetric fog, every light cone behind the lane", () => {
        const fogs = effectsOf(nodes, "fog");
        expect(fogs.length).toBeGreaterThanOrEqual(1);
        for (const fog of fogs) {
          const near = Number(fog.near);
          const far = Number(fog.far);
          const maxOpacity = Number(fog.maxOpacity);
          expect(fog.mode).toBe("linear");
          expect(maxOpacity).toBeLessThanOrEqual(0.16);
          const opacity = Math.min(1, Math.max(0, (FIGHT_PLANE_DEPTH - near) / (far - near))) * maxOpacity;
          expect(opacity).toBeLessThanOrEqual(FOG_MAX_OPACITY_IN_FIGHT_PLANE);
        }
        expect(effectsOf(nodes, "volumetric-fog")).toHaveLength(0);
        expect(effectsOf(nodes, "god-rays")).toHaveLength(0);
        for (const cone of effectsOf(nodes, "lightCone")) {
          const maxZ = lightConeMaxZ(cone.position as [number, number, number], cone.direction as [number, number, number], Number(cone.length), Number(cone.coneAngle));
          expect(maxZ, String(cone.name)).toBeLessThan(FIGHT_LANE_BACK_Z);
        }
      });

      it("lights the fighters as the subject: a neutral key, strong back rims behind each fighter", () => {
        const lights = lightsOf(nodes);
        const shadowed = lights.filter((l) => l.shadow);
        expect(shadowed).toHaveLength(1);
        expect(warmth(String(shadowed[0]!.color))).toBeLessThanOrEqual(KEY_MAX_WARMTH);
        for (const side of ["p1", "p2"] as const) {
          const rim = lights.find((l) => (l.runtime as { id?: string } | undefined)?.id === RIM_IDS[side]);
          expect(rim, side).toBeDefined();
          expect(Number(rim!.intensity), side).toBeGreaterThanOrEqual(RIM_MIN_INTENSITY);
          // Behind the fighter, aimed forward at the shoulders: a back light, not a fill.
          expect((rim!.position as readonly number[])[2], side).toBeLessThan(FIGHT_LANE_BACK_Z);
          expect((rim!.target as readonly number[])[2], side).toBeGreaterThan((rim!.position as readonly number[])[2]);
          // The refined venues rim both fighters in one cool-neutral colour; the GU47 rows keep each fighter's own colour.
          if (refined) expect(warmth(String(rim!.color)), side).toBeLessThanOrEqual(1);
        }
        if (refined) {
          for (const spot of [refined.ringKey, refined.ringFill, ...(refined.followSpot ? [refined.followSpot] : [])]) {
            expect(warmth(spot.color)).toBeLessThanOrEqual(1.12);
          }
          expect(refined.cones).toBe(false);
        }
      });

      it("sits the set darker than the pair: capped environment fill and a real vignette", () => {
        const envs = nodes.filter((n) => n.kind === "environment");
        expect(envs.length).toBeGreaterThanOrEqual(1);
        for (const env of envs) expect(Number(env.intensity)).toBeLessThanOrEqual(ENV_MAX);
        const vignette = effectsOf(nodes, "vignette").find((n) => n.name === "iron crown vignette");
        expect(Number(vignette?.intensity)).toBeGreaterThanOrEqual(VIGNETTE_MIN);
      });

      it("caps weather volumes (count and alpha) so rain and snow read as weather, not noise", () => {
        for (const vol of [...effectsOf(nodes, "rain"), ...effectsOf(nodes, "snow")]) {
          expect(Number(vol.particleCount)).toBeLessThanOrEqual(600);
          expect(Number(vol.intensity)).toBeLessThanOrEqual(0.45);
          expect(luminance(String(vol.color))).toBeLessThanOrEqual(0.8);
        }
      });

      it("keeps ambient motes few, small, dim and behind the fight lane (z < -1)", () => {
        const presets = ironCrownVfxPresets({ reducedMotion: false, reducedFlash: false, lowTier: false });
        for (const emitter of AMBIENT_EMITTERS[id]) {
          expect(ambientEmitterMaxZ(emitter), emitter.kind).toBeLessThan(FIGHT_LANE_BACK_Z);
          for (const point of emitter.points) expect(point[2]).toBeLessThan(FIGHT_LANE_BACK_Z);
          for (const layer of presets[emitter.kind].layers) {
            if (layer.type !== "emitter") continue;
            const smoke = layer.sprite === "smoke-a";
            const size = layer.size as number[];
            expect(Number(layer.count), emitter.kind).toBeLessThanOrEqual(smoke ? 8 : 4);
            expect(Math.max(...size), emitter.kind).toBeLessThanOrEqual(smoke ? 0.4 : 0.03);
            expect(luminance(String(layer.color)), emitter.kind).toBeLessThanOrEqual(0.32);
            if (smoke) expect(Number(layer.maxScreen), emitter.kind).toBeLessThanOrEqual(0.05);
          }
        }
        expect(ambientLiveParticles(AMBIENT_EMITTERS[id], { reducedMotion: false, reducedFlash: false, lowTier: false })).toBeLessThanOrEqual(15);
      });
    });
  }

  it("keeps every look-row light shaft behind the fight lane (also the rows a refined look replaces)", () => {
    for (const id of VENUES) {
      for (const shaft of STAGE_LOOKS[id].shafts) {
        expect(lightConeMaxZ(shaft.position, shaft.direction, shaft.length, shaft.coneAngle), `${id} ${shaft.name}`).toBeLessThan(FIGHT_LANE_BACK_Z);
      }
    }
    // Neo-Tokyo keeps its sodium colour in the flood shaft only; the key that lights the fighters is cool-neutral.
    const neo = stageLook("neo-tokyo-rooftop");
    expect(neo.shafts.map((s) => s.color)).toContain("#ffad5c");
    expect(neo.key.kind === "sun" && warmth(neo.key.color)).toBeLessThanOrEqual(1);
  });
});

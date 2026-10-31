import { effects, game, lights } from "@aura3d/engine";
import { venueLutUrl } from "./assets";
import { broadcastDofFor, type BroadcastCameraRig } from "./camera";
import { FLOODLIGHTS, sunPosition, venueLook, type VenueLook, type VenueSun } from "./look";

/**
 * One sun-shadow cascade by default: the camera is fixed (fov 15, ~45 m back) and the court is small, so a single cascade covers it and
 * keeps the draw budget (three cascades re-draw every caster three times: 199 draw calls vs 117). `?cascades=auto|1|2|3|4` overrides.
 */
export function viewTuning(): { cascades?: 1 | 2 | 3 | 4 | "auto" } {
  if (typeof location === "undefined") return { cascades: 1 };
  const raw = new URLSearchParams(location.search).get("cascades");
  if (raw === "auto") return { cascades: "auto" };
  const c = Number(raw);
  return c >= 1 && c <= 4 ? { cascades: c as 1 | 2 | 3 | 4 } : { cascades: 1 };
}

/** `?look=original`: today's four-light rig, values verbatim from the 4.6.1 scene. */
export function originalSceneLights() {
  const tune = viewTuning();
  return [
    lights.ambient({ color: "#dce8f2", intensity: 0.62 }),
    lights.hemisphere({ skyColor: "#eef6ff", groundColor: "#4d6358", intensity: 0.72 }),
    lights.directional({ color: "#fff6e5", intensity: 1.95, position: [14, 24, 12], shadow: tune.cascades === "auto" ? true : { cascades: tune.cascades ?? 1 } }),
    lights.point({ color: "#d8ff3e", intensity: 1.4, position: [0, 11, 0], distance: 42 })
  ];
}

/** `?look=original`: today's post stack. */
export function originalPostEffects() {
  return [
    effects.bloom({ intensity: 0.14, threshold: 0.86, radius: 0.45 }),
    effects.vignette({ intensity: 0.18, smoothness: 0.65 }),
    effects.colorGrade({ contrast: 1.05, saturation: 1.08 })
  ];
}

/** Runtime ids of the World Tour light rig (the renderer retunes them per venue with `setLight` / `setVisible`). */
export const VENUE_LIGHT_IDS = {
  key: "venue-key",
  floods: FLOODLIGHTS.map((f) => f.name)
} as const;

/** TT-L2: the sun's shadow map is fitted to the court (22 m around the centre), 2048 texels, PCSS penumbra from the venue row. */
export const SUN_SHADOW_FIT = { center: [0, 0, 0] as [number, number, number], extent: 22 } as const;
export const SUN_SHADOW_MAP_SIZE = 2048;

/** The venue's shadowed key: the sun, or on the night court the floodlight bank (look.ts `nightKey`). */
export function venueKeyLight(look: VenueLook): VenueSun {
  return look.sun ?? look.nightKey!;
}

/** Shadow options of the key for a venue (PCSS on every venue; the light size is the row's). */
export function keyShadow(look: VenueLook, cascades: 1 | 2 | 3 | 4 | "auto" = 1) {
  const key = venueKeyLight(look);
  return {
    filter: "pcss" as const,
    lightSize: key.lightSize,
    mapSize: SUN_SHADOW_MAP_SIZE as 2048,
    cascades,
    fit: { center: [...SUN_SHADOW_FIT.center] as [number, number, number], extent: SUN_SHADOW_FIT.extent }
  };
}

/**
 * TT-L1 / TT-L2: the World Tour light rig, authored once with every light the six venues use, so a venue change never
 * remounts or recompiles (E-B: a hidden light keeps its slot at intensity 0 and drops its shadow).
 * - one shadowed directional key (the venue sun; the floodlight bank on the night court), PCSS, fitted to the court;
 * - four corner floodlight spots, shown on the hard court only.
 * No ambient, hemisphere or point light: fill comes from the venue HDRI (view/scene.ts).
 */
export function sceneLights(venueId?: string | null) {
  const look = venueLook(venueId);
  const tune = viewTuning();
  const key = venueKeyLight(look);
  return [
    lights
      .directional({
        name: VENUE_LIGHT_IDS.key,
        color: key.color,
        intensity: key.intensity,
        position: sunPosition(key),
        target: [0, 0, 0],
        shadow: keyShadow(look, tune.cascades ?? 1)
      })
      .runtime(game.runtimeNode(VENUE_LIGHT_IDS.key)),
    ...FLOODLIGHTS.map((f) =>
      lights
        .spot({
          name: f.name,
          position: [...f.position],
          target: [...f.target],
          color: f.color,
          intensity: f.intensity,
          angle: f.angle,
          penumbra: f.penumbra,
          distance: f.distance,
          ...(f.shadow ? { shadow: { filter: "pcf" as const, mapSize: 1024 as const } } : {})
        })
        .runtime(game.runtimeNode(f.name))
    )
  ];
}

/** TT-P3: the grade's LUT fields: the served url and its blend, or blend 0 when the venue has no LUT. */
export function lutFields(g: VenueLook["grade"]): { lut?: string; lutIntensity: number } {
  const url = venueLutUrl(g.lut);
  return url ? { lut: url, lutIntensity: g.lutIntensity } : { lutIntensity: 0 };
}

/** Runtime post effect names (E-C `app.post.setEffect`). */
export const POST_EFFECT = { bloom: "bloom", grade: "colorGrade", vignette: "vignette", volumetricFog: "volumetricFog", depthOfField: "depthOfField" } as const;

/**
 * TT-P1 / TT-L2: the World Tour post chain, authored for the boot venue and retuned per venue at runtime
 * (`app.post.setEffect`): bloom, vignette and colour grade from the venue row, and contact shadows under the athletes.
 * Anti-aliasing stays on the tier's automatic mode: TT-P1 asks for SMAA, but the production post chain submits no pass for
 * an `smaa` resolution (`compiler/postprocess.ts`, "SMAA is not implemented") and the node type does not accept it, so
 * authoring it would drop AA (handoff to E-C in the lane report).
 */
export function postEffects(venueId?: string | null, rig: Pick<BroadcastCameraRig, "id"> = { id: "v2" }) {
  const dof = broadcastDofFor(rig);
  const look = venueLook(venueId);
  const g = look.grade;
  return [
    effects.bloom({ intensity: g.bloom.intensity, threshold: g.bloom.threshold, radius: 0.45 }),
    effects.vignette({ intensity: g.vignette, smoothness: 0.65 }),
    // TT-P3: the venue's authored .cube on top of the contrast / saturation / white-balance grade.
    effects.colorGrade({ contrast: g.contrast, saturation: g.saturation, temperature: g.temperature, tint: g.tint, ...lutFields(g) }),
    effects.contactShadows({ length: 0.35, thickness: 0.06, intensity: 0.9, lights: "sun" }),
    // TT-P2: long-lens DOF (the engine's tier resolution runs it at High / Ultra only; no stage on Medium or Low).
    effects.depthOfField({ focusDistance: dof.focusDistance, fStop: dof.fStop, focalLength: dof.focalLength })
  ];
}

/** Flags the live page passes to createAuraApp since the 15-game pin removal (7e5475d2d): the engine defaults plus the game lane (post, VFX fog and the compiler are ON). */
export const QUALITY_REBUILD = { flags: ["game"] } as const;

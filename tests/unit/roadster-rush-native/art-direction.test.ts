import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-roadster-rush/src/art/direction";
import {
  APEX_BLOOM,
  APEX_FOG_RANGE,
  APEX_GRADE,
  APEX_IBL_HDRI,
  APEX_LOOK,
  APEX_PALETTE,
  APEX_PRACTICALS,
  APEX_PRACTICAL_COUNT,
  APEX_SUN,
  apexLookAt,
  mixHex
} from "../../../apps/showcase-roadster-rush/src/art/look";
import { APEX_VFX_KINDS, apexVfxPresets, registerApexVfx } from "../../../apps/showcase-roadster-rush/src/art/vfx";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/**
 * GU47 WP-12 look contract. The snapshot mirrors what main.ts mounts, built from the same look table: the look's one shadowed
 * key, the camera-side fill and the six practicals' worth of spots (no ambient), the IBL environment under the custom dome,
 * the vehicle models, and the emissive materials with their practical / light-source flags. Triangle counts are 0 (not
 * measured in phase 1; the audit skips the floor check for 0).
 */
function mountedSceneMirror(): ArtDirectionSnapshot {
  const sunset = APEX_LOOK[0];
  const lights: { type: string; shadow: boolean; intensity: number }[] = [
    { type: "directional", shadow: true, intensity: sunset.sun.intensity },
    { type: "directional", shadow: false, intensity: sunset.fill.intensity }
  ];
  for (let i = 0; i < APEX_PRACTICALS.sodiumSpots; i++) lights.push({ type: "spot", shadow: false, intensity: 0 });
  for (let i = 0; i < APEX_PRACTICALS.headlights; i++) lights.push({ type: "spot", shadow: false, intensity: 0 });
  const vehicle = (assetKey: string) => ({ assetKey, triangles: 0, textures: 4, unlit: false, overridesTextures: false });
  return {
    lights,
    hasAmbient: false,
    environment: { kind: "hdri", background: false },
    models: [
      vehicle("hero"),
      vehicle("roadsterRushSkyCar"),
      { ...vehicle("skycar-far"), textures: 1 },
      ...["sedan", "hatch", "suv", "taxi", "van", "pickup", "boxtruck", "bus", "carrier"].map(vehicle),
      { ...vehicle("traffic-far-lod"), textures: 1 }
    ],
    materials: [
      { node: "light-lamps", emissiveIntensity: 1.65, practical: true },
      { node: "traffic-brake-lights", emissiveIntensity: 2.1, lightSource: true },
      { node: "traffic-blinkers", emissiveIntensity: 2.2, lightSource: true },
      { node: "player-lightbar", emissiveIntensity: 1.85, lightSource: true },
      { node: "player-headlight-l", emissiveIntensity: 1.6, lightSource: true },
      { node: "player-headlight-r", emissiveIntensity: 1.6, lightSource: true },
      { node: "player-plumes", emissiveIntensity: 1.9, lightSource: true },
      { node: "sky-plumes", emissiveIntensity: 1.9, lightSource: true },
      { node: "sky-halos", emissiveIntensity: 1.65, lightSource: true },
      { node: "freeway-trims", emissiveIntensity: 1.1, practical: true },
      { node: "beacon-rings", emissiveIntensity: 1.4, practical: true },
      { node: "lane-dashes", emissiveIntensity: 0.1 },
      { node: "pickups", emissiveIntensity: 1.45, practical: true }
    ],
    drawCalls: 0
  };
}

describe("Apex Overdrive art direction (GU47 WP-12)", () => {
  it("passes the C-35 audit against the mounted-scene mirror and writes the audit record", () => {
    const snapshot = mountedSceneMirror();
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-roadster-rush/src/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("names the identity palette, the IBL and a unique signature effect", () => {
    expect(direction.palette.primary).toEqual(["#22232a", "#ff8a3d", "#1f3fa8"]);
    expect(direction.palette.accent).toBe("#4df0ff");
    expect(direction.palette.reservedObjective).toBe("#ff2a3c");
    expect(direction.lighting.environment.hdri).toBe(APEX_IBL_HDRI);
    expect(direction.lighting.environment.background).toBe("sky");
    expect(direction.lighting.practicals).toBe(APEX_PRACTICAL_COUNT);
    expect(direction.signatureEffect).toMatch(/haze floor/);
  });

  it("has one look row per variant with the WP's numbers", () => {
    expect(APEX_LOOK.map((row) => row.id)).toEqual(["sunset", "dusk", "night"]);
    expect(APEX_LOOK.map((row) => row.environmentIntensity)).toEqual([1, 0.55, 0.18]);
    expect(APEX_SUN).toEqual({ elevationDeg: 7, azimuthDeg: 175 });
    expect(APEX_LOOK[0].sun.elevationDeg).toBe(APEX_SUN.elevationDeg);
    expect(Math.round(APEX_FOG_RANGE.near)).toBe(43);
    expect(Math.round(APEX_FOG_RANGE.far)).toBe(257);
    expect(APEX_GRADE).toEqual({ contrast: 1.12, saturation: 1.08 });
    expect(APEX_BLOOM).toEqual({ intensity: 0.55, threshold: 0.85, scatter: 0.5 });
    for (const row of APEX_LOOK) {
      expect(row.fill.intensity).toBeLessThanOrEqual(0.6);
      expect(row.sun.azimuthDeg).toBe(175);
    }
    // night is sodium and red, never magenta: no look colour has red and blue both high with green low
    const magenta = (hex: string): boolean => {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return r > 150 && b > 120 && g < 0.6 * Math.min(r, b);
    };
    const colours = [...Object.values(APEX_PALETTE), ...APEX_LOOK.flatMap((row) => [row.sun.color, row.fill.color, row.fog.color, ...Object.values(row.dome), row.signature.hazeColor])];
    expect(colours.filter(magenta)).toEqual([]);
  });

  it("blends the rows by time of day and keeps the key on the dome's sun", () => {
    expect(apexLookAt(0).variant).toBe("sunset");
    expect(apexLookAt(0.5).variant).toBe("dusk");
    expect(apexLookAt(1).variant).toBe("night");
    expect(apexLookAt(0.25).environmentIntensity).toBeCloseTo((1 + 0.55) / 2, 6);
    expect(apexLookAt(0.75).sun.color).toBe(mixHex(APEX_LOOK[1].sun.color, APEX_LOOK[2].sun.color, 0.5));
    const dir = apexLookAt(0).sunDir;
    expect(Math.hypot(...dir)).toBeCloseTo(1, 6);
    expect(dir[2]).toBeLessThan(-0.98); // dead ahead (-z), backlighting traffic
    expect((Math.asin(dir[1]) * 180) / Math.PI).toBeCloseTo(7, 6);
    expect(apexLookAt(Number.NaN).tod).toBe(0);
  });

  it("registers all five presets; reduced motion halves every emission", () => {
    const registered: string[] = [];
    const kinds = registerApexVfx({ registerPreset: (kind) => registered.push(kind) });
    expect(kinds).toEqual(APEX_VFX_KINDS);
    expect(registered).toEqual(["apex-crash", "apex-bolt", "apex-land", "apex-rocket", "apex-skykill"]);
    const full = apexVfxPresets(false);
    const reduced = apexVfxPresets(true);
    let total = 0;
    for (const kind of APEX_VFX_KINDS) {
      expect(full[kind].name).toBe(kind);
      full[kind].layers.forEach((layer, i) => {
        if (layer.type !== "emitter") return;
        const count = Number(layer.count);
        total += count;
        expect(Number(reduced[kind].layers[i]!.count)).toBeLessThanOrEqual(Math.max(1, Math.ceil(count / 2)));
      });
    }
    expect(total).toBeLessThanOrEqual(96);
    expect(registerApexVfx(undefined)).toEqual([]);
  });
});

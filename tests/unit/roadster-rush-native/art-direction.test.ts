import fs from "node:fs";
import path from "node:path";
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
import {
  APEX_PROCEDURAL_MATERIALS,
  buildBayRidgeMountainSpec,
  buildBayRidgeStrataMaterial,
  buildHeroCanopyVisorNode,
  buildHeroSupercarNode,
  buildSkycarGeometries,
  buildTrafficClassGeometries
} from "../../../apps/showcase-roadster-rush/src/art/proceduralModels";
import { PLAYER_BOX, SKY_SPEC, VEHICLE_SPECS, type VehicleType } from "../../../apps/showcase-roadster-rush/src/native/constants";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap";
import { checkWgslTwin } from "../apps/wgslTwinChecks";
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
  return {
    lights,
    hasAmbient: false,
    environment: { kind: "hdri", background: false },
    models: [],
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
    expect(APEX_LOOK.map((row) => row.environmentIntensity)).toEqual([0.8, 0.48, 0.18]);
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
    expect(apexLookAt(0.25).environmentIntensity).toBeCloseTo((0.8 + 0.48) / 2, 6);
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

  it("sculpts exact-collider procedural vehicles, pairs WebGPU strata WGSL, and enforces clearcoat:0 on >20-slot pools", () => {
    const heroJson = buildHeroSupercarNode().toJSON();
    expect(heroJson.kind).toBe("group");
    expect(heroJson.children.length).toBe(6);

    for (const vType of Object.keys(VEHICLE_SPECS) as VehicleType[]) {
      const spec = VEHICLE_SPECS[vType];
      const bundle = buildTrafficClassGeometries(vType);
      expect(bundle.nearBody.bounds).toBeDefined();
      expect(bundle.nearGlass.bounds).toBeDefined();
      expect(bundle.nearTrim.bounds).toBeDefined();
      expect(bundle.farLod.bounds).toBeDefined();
      const bMin = bundle.farLod.bounds!.min;
      const bMax = bundle.farLod.bounds!.max;
      expect(bMin[1]).toBeGreaterThanOrEqual(-0.02);
      expect(bMin[1]).toBeLessThanOrEqual(0.05);
      expect(bMax[0] - bMin[0]).toBeLessThanOrEqual(spec.w * 1.12);
      expect(bMax[1] - bMin[1]).toBeLessThanOrEqual(spec.h * 1.06);
      expect(bMax[2] - bMin[2]).toBeCloseTo(spec.l, 0);
    }

    const skycar = buildSkycarGeometries();
    expect(skycar.nearSpec.bounds!.min[1]).toBeCloseTo(0, 2);
    expect(skycar.nearSpec.bounds!.max[0] - skycar.nearSpec.bounds!.min[0]).toBeCloseTo(SKY_SPEC.w, 1);
    expect(skycar.nearSpec.bounds!.max[2] - skycar.nearSpec.bounds!.min[2]).toBeCloseTo(SKY_SPEC.l, 1);
    expect(PLAYER_BOX.l).toBe(4.3);

    // >20-instance hardware instancing contract: clearcoat === 0, zero sheen/iridescence/transmission
    for (const mat of [
      APEX_PROCEDURAL_MATERIALS.trafficFarHardwarePbr(),
      APEX_PROCEDURAL_MATERIALS.skycarNearHardwareMetal(),
      APEX_PROCEDURAL_MATERIALS.skycarFarHardwarePbr(),
      APEX_PROCEDURAL_MATERIALS.boltCrystalHardwarePbr(),
      APEX_PROCEDURAL_MATERIALS.pylonColumnConcrete(),
      APEX_PROCEDURAL_MATERIALS.lightPoleSteel()
    ]) {
      expect((mat as { clearcoat?: number }).clearcoat ?? 0).toBe(0);
      expect((mat as { sheen?: number }).sheen).toBeUndefined();
      expect((mat as { iridescence?: number }).iridescence).toBeUndefined();
      expect((mat as { transmission?: number }).transmission).toBeUndefined();
    }

    // Coastal bay ridge stratified mountain + paired WebGPU WGSL twin
    const ridgeSpec = buildBayRidgeMountainSpec();
    expect(ridgeSpec.bounds!.max[0] - ridgeSpec.bounds!.min[0]).toBeCloseTo(1, 3);
    const strataMat = buildBayRidgeStrataMaterial();
    expect(strataMat.kind).toBe("custom");
    if (strataMat.kind === "custom") {
      checkWgslTwin("coastal-bay-ridge", strataMat.custom, true);
    }
    expect(webgpuCustomShaderGap(strataMat)).toBeUndefined();
  });

  it("uses smooth shared-vertex automotive normals, +Z rear taillight/shutter detail, and mounts /hdri in vite.config.ts", () => {
    const canopyJson = buildHeroCanopyVisorNode().toJSON();
    expect(canopyJson.kind).toBe("primitive");
    expect(canopyJson.geometry.kind).toBe("aura-custom-geometry");
    const canopyGeo = canopyJson.geometry as unknown as { positions: ArrayLike<number>; indices?: ArrayLike<number> };
    // Smooth-indexed loft shares ~6 indices per vertex (vs exactly 1 index/vertex on flat-shaded triangle soup)
    expect(canopyGeo.indices!.length).toBeGreaterThan((canopyGeo.positions.length / 3) * 3);

    const cobaltChild = buildHeroSupercarNode().toJSON().children[0]!;
    const cobaltIndices = Array.from(
      (cobaltChild as unknown as { geometry: { indices: ArrayLike<number> } }).geometry.indices
    );
    const uniqueCobaltVerts = new Set(cobaltIndices).size;
    // Smooth-shaded cobalt bodywork shares ~4.5-5.5 indices per unique vertex (vs 1.0 on flat-shaded triangle soup)
    expect(cobaltIndices.length).toBeGreaterThan(uniqueCobaltVerts * 4);

    const sedan = buildTrafficClassGeometries("sedan");
    expect(sedan.nearBody.indices!.length).toBeGreaterThan((sedan.nearBody.positions.length / 3) * 3);

    const hasRearCrimsonLamps = (spec: { positions: ArrayLike<number>; colors?: ArrayLike<number> }, minRearZ: number): boolean => {
      if (!spec.colors) return false;
      for (let v = 0; v < spec.positions.length / 3; v += 1) {
        const z = spec.positions[v * 3 + 2]!;
        const r = spec.colors[v * 4]!, g = spec.colors[v * 4 + 1]!, b = spec.colors[v * 4 + 2]!;
        if (z >= minRearZ && r > 0.9 && g < 0.2 && b < 0.25) return true;
      }
      return false;
    };
    expect(hasRearCrimsonLamps(sedan.nearTrim, 2.2)).toBe(true);
    expect(hasRearCrimsonLamps(sedan.farLod, 2.2)).toBe(true);

    const boxtruck = buildTrafficClassGeometries("boxtruck");
    expect(hasRearCrimsonLamps(boxtruck.nearTrim, 3.9)).toBe(true);
    expect(hasRearCrimsonLamps(boxtruck.farLod, 3.9)).toBe(true);

    const viteCfg = fs.readFileSync(
      path.resolve(process.cwd(), "apps/showcase-roadster-rush/vite.config.ts"),
      "utf8"
    );
    expect(viteCfg).toContain('mountSharedPrefix(server.middlewares, "/hdri")');
    expect(fs.existsSync(path.resolve(process.cwd(), "public/hdri", `${APEX_IBL_HDRI}_1k.hdr`))).toBe(true);
  });
});

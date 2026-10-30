import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../examples/saiyan-snake-way-port/art/direction";
import {
  ORIGINAL_LOOK, SERPENT_PALETTE, STAGE_BLEND_METRES, STAGE_LOOK, linearOf, lookAt, lookParams, mixLook, resolveRow, srgbOf, stageBlendAt, stageIndexAt, sunDirection
} from "../../../examples/saiyan-snake-way-port/art/colorScript";
import { SERPENT_VFX_KINDS, SERPENT_VFX_LIVE_CAP, registerSerpentVfx, serpentVfxPresets } from "../../../examples/saiyan-snake-way-port/art/vfx";
import { STAGES } from "../../../examples/saiyan-snake-way-port/sim";
import { MESHY } from "../../../examples/saiyan-snake-way-port/models";
import { deltaE2000 } from "../../../tools/look-metrics/region-luma.mjs";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/**
 * GU47 WP-27 look contract. The snapshot mirrors what world.ts mounts: one shadowed sun, the camera-side violet fill
 * (unshadowed), the hemisphere sky light (not an ambient light), the neutral environment, the rigged runner and the seven
 * Meshy props. Triangles are 0 (not measured in phase 1; the audit skips the floor check for 0).
 */
function mountedSceneMirror(): ArtDirectionSnapshot {
  const row = STAGE_LOOK[0]!;
  const model = (assetKey: string) => ({ assetKey, triangles: 0, textures: 2, unlit: false, overridesTextures: false });
  return {
    lights: [
      { type: "directional", shadow: true, intensity: row.sun.intensity },
      { type: "directional", shadow: false, intensity: row.fill.intensity },
      { type: "hemisphere", shadow: false, intensity: row.hemisphere.intensity }
    ],
    hasAmbient: false,
    environment: { kind: "preset", background: false },
    models: [model("runner"), ...Object.keys(MESHY).map(model)],
    drawCalls: 0
  };
}

/** Top-third proxy of a row: the mean of zenith and upper sky in sRGB (the dome fills the top third of the frame). */
const topThird = (i: number): [number, number, number] => {
  const row = STAGE_LOOK[i]!;
  const a = srgbOf(row.sky.zenith), b = srgbOf(row.sky.upper);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
};

describe("serpentine-sky-run art direction (GU47 WP-27)", () => {
  it("passes the C-35 audit against the mounted-scene mirror and writes the audit record", () => {
    const snapshot = mountedSceneMirror();
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("examples/saiyan-snake-way-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("names the identity palette and a signature effect, with no brand or character names", () => {
    expect(direction.palette.primary).toEqual(["#1c1640", "#ff7a6b", "#f2b33d"]);
    expect(direction.palette.accent).toBe("#7fe0c4");
    expect(direction.signatureEffect).toMatch(/colour script/);
    expect(JSON.stringify(direction)).not.toMatch(/goku|saiyan|vegeta|piccolo|namek|kaio|dragon ?ball|snake way/i);
  });
});

describe("serpentine-sky-run stage colour script (SSR-01)", () => {
  it("has one look row per stage, in stage order", () => {
    expect(STAGE_LOOK).toHaveLength(STAGES.length);
    expect(STAGE_LOOK.map((r) => r.stage)).toEqual(STAGES.map((s) => s.name));
    expect(new Set(STAGE_LOOK.map((r) => r.id)).size).toBe(STAGE_LOOK.length);
  });

  it("neighbouring stages' top thirds differ by dE2000 >= 12 and any pair by >= 8", () => {
    for (let i = 1; i < STAGE_LOOK.length; i++) expect(deltaE2000(topThird(i - 1), topThird(i)), `${i - 1}->${i}`).toBeGreaterThanOrEqual(12);
    for (let i = 0; i < STAGE_LOOK.length; i++) {
      for (let j = i + 1; j < STAGE_LOOK.length; j++) expect(deltaE2000(topThird(i), topThird(j)), `${i}/${j}`).toBeGreaterThanOrEqual(8);
    }
  });

  it("keeps the backlit low sun ahead of the runner and the fill at 0.6 or less (SSR-02)", () => {
    for (const row of STAGE_LOOK) {
      expect(Math.abs(row.sun.azimuthDeg)).toBeLessThanOrEqual(20);
      expect(row.fill.intensity).toBeLessThanOrEqual(0.6);
      expect(row.hemisphere.intensity).toBeLessThanOrEqual(0.6);
      expect(row.environmentIntensity).toBeLessThanOrEqual(0.6);
    }
    const sun = sunDirection([0, 0, -1], (10 * Math.PI) / 180, 0);
    expect(sun[2]).toBeLessThan(-0.9);
    expect(sun[1]).toBeCloseTo(Math.sin((10 * Math.PI) / 180), 6);
  });

  it("blends over 120 m centred on each stage boundary and is continuous", () => {
    expect(STAGE_BLEND_METRES).toBe(120);
    for (let i = 1; i < STAGES.length; i++) {
      const from = STAGES[i]!.from;
      expect(stageBlendAt(from - 61)).toEqual({ from: i - 1, to: i - 1, t: 0 });
      const mid = stageBlendAt(from);
      expect(mid.from).toBe(i - 1);
      expect(mid.to).toBe(i);
      expect(mid.t).toBeCloseTo(0.5, 6);
      expect(stageBlendAt(from + 61)).toEqual({ from: i, to: i, t: 0 });
    }
    const params = lookParams("");
    let prev = lookAt(0, params);
    for (let s = 1; s <= 5600; s += 1) {
      const cur = lookAt(s, params);
      expect(Math.abs(cur.zenith[2] - prev.zenith[2]), `s=${s}`).toBeLessThan(0.02);
      prev = cur;
    }
  });

  it("reads ?stage=1..8 and ?look=original; nothing else changes the look", () => {
    expect(lookParams("?stage=3")).toEqual({ mode: "script", pinnedStage: 2 });
    expect(lookParams("?stage=9").pinnedStage).toBeNull();
    expect(lookParams("?stage=0").pinnedStage).toBeNull();
    expect(lookParams("?look=original").mode).toBe("original");
    expect(lookAt(3000, lookParams("?stage=8")).id).toBe("sunburst");
    expect(lookAt(10, lookParams("?look=original")).id).toBe("original");
    expect(lookAt(10, lookParams("?look=original")).fogColor).toEqual([0.8, 0.62, 0.8]);
    expect(stageIndexAt(2700)).toBe(3);
  });

  it("original look reproduces today's constants", () => {
    expect(ORIGINAL_LOOK.hemisphere.intensity).toBe(1.1);
    expect(ORIGINAL_LOOK.environmentIntensity).toBe(0.9);
    expect(ORIGINAL_LOOK.bloom).toEqual({ intensity: 0.12, threshold: 0.95 });
    expect(ORIGINAL_LOOK.fill.intensity).toBe(0);
  });

  it("mixes rows in linear light", () => {
    const a = resolveRow(STAGE_LOOK[0]!, 0), b = resolveRow(STAGE_LOOK[1]!, 1);
    const m = mixLook(a, b, 0.5);
    expect(m.zenith[0]).toBeCloseTo((a.zenith[0] + b.zenith[0]) / 2, 9);
    expect(m.sunIntensity).toBeCloseTo((a.sunIntensity + b.sunIntensity) / 2, 9);
    expect(linearOf(SERPENT_PALETTE.indigo)[2]).toBeGreaterThan(linearOf(SERPENT_PALETTE.indigo)[0]);
  });
});

describe("serpentine-sky-run VFX pack (SSR-12, SSR-13)", () => {
  it("registers one preset per kind, each spec named after its kind", () => {
    const seen: string[] = [];
    const kinds = registerSerpentVfx({ registerPreset: (kind, spec) => { expect(spec.name).toBe(kind); seen.push(kind); } });
    expect(kinds).toEqual(SERPENT_VFX_KINDS);
    expect(seen).toEqual([...SERPENT_VFX_KINDS]);
    expect(registerSerpentVfx(undefined)).toEqual([]);
  });

  it("keeps a dense moment under the live-particle cap", () => {
    const p = serpentVfxPresets();
    const count = (k: keyof typeof p): number => p[k].layers.reduce((n, l) => n + (l.type === "emitter" ? Number(l.count ?? 0) : 0), 0);
    const dense = count("serpent-orb") + count("serpent-power") + count("serpent-pearl-chips") + count("serpent-cloud-puff") + count("serpent-surge") + count("serpent-hit");
    expect(dense).toBeLessThanOrEqual(SERPENT_VFX_LIVE_CAP);
  });

  it("halves emission on reduced motion and drops flashes and shake on reduced flash / motion (PRD §6.3)", () => {
    const full = serpentVfxPresets();
    const calm = serpentVfxPresets({ reducedMotion: true, reducedFlash: true });
    for (const kind of SERPENT_VFX_KINDS) {
      const a = full[kind].layers.filter((l) => l.type === "emitter");
      const b = calm[kind].layers.filter((l) => l.type === "emitter");
      a.forEach((layer, i) => expect(Number(b[i]!.count)).toBeLessThanOrEqual(Math.max(1, Math.ceil(Number(layer.count) / 2))));
      expect(calm[kind].layers.some((l) => l.type === "light" || l.type === "camera"), kind).toBe(false);
    }
  });
});

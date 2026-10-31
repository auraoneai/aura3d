import { describe, expect, it } from "vitest";
import { instances, scene } from "../../../packages/engine/src";
import { auditArtDirection, snapshotForAudit } from "../../../packages/game/src/art/index";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import direction from "../../../examples/ninja-runner-port/art/direction";
import { lightRig, lanternPoolSize } from "../../../examples/ninja-runner-port/lighting";
import { PROP_ASSETS } from "../../../examples/ninja-runner-port/models";
import {
  DISTRICT_LOOKS, PALETTE, bracket, districtIdAt, linearToHex, lookAtDistance, lookMode, nearestLanterns
} from "../../../examples/ninja-runner-port/districtLook";
import { AMBIENT_BY_DISTRICT, NINJA_PRESETS, emissionScale, registerNinjaVfx, scaledPreset } from "../../../examples/ninja-runner-port/vfx";
import { NINJA_DISTRICTS } from "../../browser/game-luma-targets";

/** The evening scene's lights and models as `buildWorld` mounts them (the DOM-free part of the scene). */
function eveningSnapshot(quality: "low" | "high") {
  const builder = scene();
  for (const node of lightRig({ mode: "evening", quality, shadow: true })) builder.add(node);
  for (const [id, asset] of Object.entries(PROP_ASSETS)) builder.add(instances.model(asset, { name: `model-${id}`, transforms: [{ position: [0, 0, 0] }] }));
  const appLike = { scene: builder.toJSON(), diagnostics: () => ({ drawCalls: 0 }) } as unknown as Parameters<typeof snapshotForAudit>[0];
  return snapshotForAudit(appLike, { assets: {} });
}

describe("ninja-runner-port art direction (GU47 NR-21)", () => {
  it("passes auditArtDirection on the evening rig and writes the audit record", () => {
    const snapshot = eveningSnapshot("high");
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("examples/ninja-runner-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
    expect(snapshot.lights.filter((l) => l.shadow)).toHaveLength(1);
    expect(snapshot.environment.kind).toBe("hdri");
  });

  it("passes on Low too (smaller lantern pool)", () => {
    expect(auditArtDirection(direction, eveningSnapshot("low"))).toEqual([]);
    expect(lanternPoolSize({ mode: "evening", quality: "low", shadow: true })).toEqual({ amber: 2, cyan: 1 });
  });

  it("declares the scarf-trail signature and the §6.1 palette", () => {
    expect(direction.signatureEffect.startsWith("scarf-trail")).toBe(true);
    expect(direction.palette.primary).toEqual([PALETTE.indigo, PALETTE.persimmon, PALETTE.mistPaper]);
    expect(direction.palette.accent).toBe(PALETTE.lanternAmber);
    expect(direction.palette.reservedObjective).toBe(PALETTE.spiritCyan);
  });
});

describe("ninja-runner-port district look table (NR-01, NR-02, NR-05, NR-06, NR-22)", () => {
  it("has one row per E-I district target, pinned to the same distances", () => {
    expect(DISTRICT_LOOKS.map((r) => [r.id, r.at])).toEqual(NINJA_DISTRICTS.map(([v, m]) => [v, m]));
    for (const row of DISTRICT_LOOKS) expect(districtIdAt(row.at)).toBe(row.id);
  });

  it("sinks the sun 32 -> 10 degrees over the camera's shoulder while the sky fill rises (GU47 phase 3)", () => {
    expect(DISTRICT_LOOKS.map((r) => r.environmentIntensity)).toEqual([1, 1.1, 1.2, 1.3, 1.35]);
    expect(DISTRICT_LOOKS.map((r) => [r.key.kind, r.key.elevationDeg])).toEqual([["sun", 32], ["sun", 24], ["sun", 18], ["sun", 14], ["sun", 10]]);
    // Behind the chase camera: the course heads about 160-180 degrees (towards -Z), the sun sits at -40 to -65.
    for (const row of DISTRICT_LOOKS) expect(row.key.azimuthDeg).toBeLessThanOrEqual(-40);
    for (const row of DISTRICT_LOOKS) expect(lookAtDistance(row.at).environmentIntensity).toBeCloseTo(row.environmentIntensity, 9);
  });

  it("never jumps: every value moves smoothly across the whole course", () => {
    let prev = lookAtDistance(0);
    for (let s = 1; s <= 2640; s += 1) {
      const cur = lookAtDistance(s);
      expect(Math.abs(cur.keyIntensity - prev.keyIntensity)).toBeLessThan(0.05);
      expect(Math.abs(cur.environmentIntensity - prev.environmentIntensity)).toBeLessThan(0.01);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(cur.toKey[k]! - prev.toKey[k]!)).toBeLessThan(0.02);
        expect(Math.abs(cur.skyHorizon[k]! - prev.skyHorizon[k]!)).toBeLessThan(0.02);
        expect(Math.abs(cur.fogColor[k]! - prev.fogColor[k]!)).toBeLessThan(0.02);
      }
      expect(cur.toKey[1]).toBeGreaterThan(0);
      prev = cur;
    }
  });

  it("holds the village row through the Backstreets", () => {
    expect(bracket(250).t).toBe(0);
    expect(lookAtDistance(250).keyIntensity).toBeCloseTo(DISTRICT_LOOKS[0]!.key.intensity, 9);
  });

  it("lights lanterns from the river on and shows the first stars in the gate afterglow", () => {
    expect(lookAtDistance(100).lanterns).toBe(0);
    expect(lookAtDistance(700).lanterns).toBe(0);
    expect(lookAtDistance(1300).lanterns).toBeGreaterThan(0.3);
    expect(lookAtDistance(2500).lanterns).toBe(1);
    expect(lookAtDistance(2500).stars).toBeGreaterThan(0);
    expect(lookAtDistance(100).stars).toBe(0);
  });

  it("reads ?look=original and round-trips hex", () => {
    expect(lookMode("?look=original")).toBe("original");
    expect(lookMode("?at=700")).toBe("evening");
    expect(lookMode("?look=evening&at=700")).toBe("evening");
    expect(linearToHex([1, 0, 0])).toBe("#ff0000");
  });

  it("picks the nearest lanterns in the window ahead", () => {
    const sorted = [{ s: 10 }, { s: 50 }, { s: 95 }, { s: 102 }, { s: 140 }, { s: 300 }];
    expect(nearestLanterns(sorted, 100, 3)).toEqual([3, 2, 4]);
    expect(nearestLanterns(sorted, 100, 0)).toEqual([]);
    expect(nearestLanterns(sorted, 1000, 4)).toEqual([]);
  });
});

describe("ninja-runner-port VFX pack (NR-14, NR-15, reduced motion)", () => {
  interface Call { kind: string; count?: number }
  const fakeEffects = () => {
    const registered = new Map<string, unknown>();
    const bursts: Call[] = [];
    const trails: { target: string; color?: string }[] = [];
    const effects = {
      runtime: "off" as "on" | "off",
      registerPreset: (kind: string, spec: unknown) => { registered.set(kind, spec); },
      burst: (kind: string) => { bursts.push({ kind }); return { id: "x", alive: true, stop() {}, setPosition() {} }; },
      trail: (target: string, o: { color?: string }) => { trails.push({ target, color: o.color }); return { id: "t", alive: true, length: 0, pointCount: 0, stop() {}, setPosition() {}, clear() {} }; }
    };
    return { effects, registered, bursts, trails };
  };

  it("halves every emission under reduced motion and again on Low", () => {
    expect(emissionScale({ reducedMotion: false, quality: "high" })).toBe(1);
    expect(emissionScale({ reducedMotion: true, quality: "high" })).toBe(0.5);
    expect(emissionScale({ reducedMotion: true, quality: "low" })).toBe(0.25);
    const full = NINJA_PRESETS.kill.layers[0]!.count as number;
    const half = scaledPreset(NINJA_PRESETS.kill, 0.5).layers[0]!.count as number;
    expect(half).toBe(Math.round(full / 2));
  });

  it("registers the pack with reduced-motion counts and turns runtime effects back on", () => {
    const f = fakeEffects();
    registerNinjaVfx(f.effects as never, { reducedMotion: true, quality: "high" });
    expect(f.effects.runtime).toBe("on");
    const kill = f.registered.get("ninja-kill") as { layers: { count?: number }[] };
    expect(kill.layers[0]!.count).toBe(Math.round((NINJA_PRESETS.kill.layers[0]!.count as number) / 2));
    expect(f.registered.has("ninja-petals")).toBe(true);
  });

  it("drops the ambients on Low and keeps the scarf", () => {
    const f = fakeEffects();
    const vfx = registerNinjaVfx(f.effects as never, { reducedMotion: false, quality: "low" });
    expect(f.registered.has("ninja-petals")).toBe(false);
    vfx.ambient("village", [0, 0, 0]);
    expect(f.bursts).toHaveLength(0);
    vfx.scarf("base");
    expect(f.trails).toEqual([{ target: "hero-scarf", color: PALETTE.persimmon }]);
  });

  it("recolours the scarf cyan for the spirit forms and does not restart an unchanged ribbon", () => {
    const f = fakeEffects();
    const vfx = registerNinjaVfx(f.effects as never, { reducedMotion: false, quality: "high" });
    vfx.scarf("base"); vfx.scarf("base"); vfx.scarf("sage"); vfx.scarf("beast");
    expect(f.trails.map((t) => t.color)).toEqual([PALETTE.persimmon, PALETTE.spiritCyan]);
    vfx.ambient("river", [0, 0, 0]);
    vfx.ambient("forest", [0, 0, 0]);
    expect(f.bursts.map((b) => b.kind)).toEqual(["ninja-fireflies"]);
    expect(AMBIENT_BY_DISTRICT.gate).toBe("falls-spray");
  });
});

describe("ninja-runner-port ?at= district targets and QA crops (NR-22)", () => {
  it("parses and clamps ?at=", async () => {
    const { atDistance, qaCrops } = await import("../../../examples/ninja-runner-port/qa");
    expect(atDistance(new URLSearchParams("at=700"))).toBe(700);
    expect(atDistance(new URLSearchParams("at=99999"))).toBe(2600);
    expect(atDistance(new URLSearchParams("at=x"))).toBeNull();
    expect(atDistance(new URLSearchParams(""))).toBeNull();
    for (const [, m] of NINJA_DISTRICTS) {
      const crops = qaCrops(m);
      expect(crops.length).toBeLessThanOrEqual(16);
      for (const c of crops) {
        expect(c.name).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
        expect(c.x + c.w).toBeLessThanOrEqual(1);
        expect(c.y + c.h).toBeLessThanOrEqual(1);
      }
    }
    expect(qaCrops(1300).map((c) => c.name)).toContain("river");
    expect(qaCrops(700).map((c) => c.name)).toContain("roof");
  });

  it("the capture policy reaches every district stop without the run ending (sim untouched)", async () => {
    const { createState, startRun, stepSim, applyAction, SIM_STEP } = await import("../../../examples/ninja-runner-port/sim");
    const { DEFAULT_POLICY, policyActions } = await import("../../../examples/ninja-runner-port/autopilot");
    const z = createState(17);
    startRun(z);
    for (const [, m] of NINJA_DISTRICTS) {
      let n = 0;
      while (z.phase === "running" && z.s < m && n < 120 * 400) { for (const a of policyActions(z, DEFAULT_POLICY)) applyAction(z, a); stepSim(z, SIM_STEP); n++; }
      expect(z.s).toBeGreaterThanOrEqual(m);
      expect(z.phase).toBe("running");
    }
  });
});

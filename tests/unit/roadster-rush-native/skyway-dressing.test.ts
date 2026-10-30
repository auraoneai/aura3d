import { describe, expect, it } from "vitest";
import { HAZE_FLOOR_Y, groundSpec } from "../../../apps/showcase-roadster-rush/src/art/ground";
import { PYLON_KIT, PYLON_ROWS, PYLON_STRIDE_Z, PYLON_X, pylonLayout } from "../../../apps/showcase-roadster-rush/src/render/pylons";
import { TOWER_CAPACITY_PER_VARIANT, TOWER_VARIANTS, towerGlassSpec, towerHash, towerLayout } from "../../../apps/showcase-roadster-rush/src/render/towers";

describe("Apex Overdrive glass tower skyline (GU47 AO-A1)", () => {
  it("fills three variants within their pool capacity, clear of the road, rising from the haze floor", () => {
    for (const pz of [0, -777, -5321.5, -20000]) {
      const towers = towerLayout(pz);
      for (const variant of TOWER_VARIANTS) {
        expect(towers.filter((t) => t.variant === variant).length).toBeLessThanOrEqual(TOWER_CAPACITY_PER_VARIANT);
      }
      for (const t of towers) {
        expect(Math.abs(t.x) - Math.max(t.width, t.depth) / 2).toBeGreaterThan(24);
        expect(t.y - t.height / 2).toBeCloseTo(HAZE_FLOOR_Y, 6);
        expect(t.y + t.height / 2).toBeGreaterThanOrEqual(20);
        expect(t.y + t.height / 2).toBeLessThanOrEqual(96);
      }
    }
    const seen = new Set(towerLayout(-3000).map((t) => t.variant));
    expect([...seen].sort()).toEqual([...TOWER_VARIANTS].sort());
  });

  it("is world-anchored: the same towers stand at the same world spots as the player advances", () => {
    const key = (t: { x: number; z: number; height: number }) => `${t.x.toFixed(3)}:${t.z.toFixed(3)}:${t.height.toFixed(3)}`;
    const a = new Set(towerLayout(-1000).map(key));
    const b = towerLayout(-1030).map(key);
    const shared = b.filter((k) => a.has(k)).length;
    expect(shared).toBeGreaterThanOrEqual(b.length - 4 * 2);
    expect(towerHash(3, 4)).toBe(towerHash(3, 4));
    expect(towerHash(3, 4)).not.toBe(towerHash(4, 3));
  });

  it("shades instanced glass with the scene fog and no reversed smoothstep edges", () => {
    for (const variant of TOWER_VARIANTS) {
      const spec = towerGlassSpec(variant);
      expect(spec.fog).toBe(true);
      expect(spec.glsl.vertex).toContain("instanceMatrix");
      expect(spec.glsl.fragment).not.toMatch(/smoothstep\(1\.0,/);
    }
  });
});

describe("Apex Overdrive skyway dressing (GU47 AO-E2)", () => {
  it("drops the city floor 28 m below the deck and scrolls its plan with the run", () => {
    expect(HAZE_FLOOR_Y).toBe(-28);
    const spec = groundSpec();
    const uniforms = spec.uniforms as Record<string, { type: string; value: unknown }>;
    expect(uniforms.scroll!.type).toBe("vec2");
    expect(uniforms.windowSpecks!.type).toBe("f32");
    expect(spec.glsl.fragment).toContain("speck");
  });

  it("lays world-anchored piers every 40 m outside the deck, reaching the haze floor", () => {
    const a = pylonLayout(-1005);
    expect(a.columns).toHaveLength(PYLON_ROWS * 2);
    expect(a.caps).toHaveLength(PYLON_ROWS);
    for (const c of a.columns) {
      expect(Math.abs(c.x)).toBe(PYLON_X);
      expect(Math.abs(c.x) - PYLON_KIT.column.size[0] / 2).toBeGreaterThan(12); // clear of the 24 m deck
      expect(c.z % PYLON_STRIDE_Z).toBe(-0);
    }
    const bottom = a.columns[0]!.y - PYLON_KIT.column.size[1] / 2;
    expect(bottom).toBeCloseTo(HAZE_FLOOR_Y, 6);
    // the same world rows stay put while the player moves within a stride
    const b = pylonLayout(-1015);
    expect(b.caps.map((c) => c.z)).toEqual(a.caps.map((c) => c.z));
    // rows cover from just behind the camera to ~400 m ahead
    expect(Math.max(...a.caps.map((c) => c.z))).toBeGreaterThan(-1005);
    expect(Math.min(...a.caps.map((c) => c.z))).toBeLessThan(-1005 - 350);
  });
});

describe("Apex Overdrive skyway dressing (GU47 AO-W1)", () => {
  it("rings every 30 m ahead, spans above the flight ceiling, billboards clear of the deck; <= 12 draws", async () => {
    const d = await import("../../../apps/showcase-roadster-rush/src/render/dressing");
    const { CEILING } = await import("../../../apps/showcase-roadster-rush/src/native/constants");
    const { GANTRY_COUNT } = await import("../../../apps/showcase-roadster-rush/src/native/world");
    const rings = d.ringLayout(-1234);
    expect(rings).toHaveLength(d.RING_ROWS * 2);
    const zs = [...new Set(rings.map((r) => r.z))].sort((a, b) => b - a);
    for (let i = 1; i < zs.length; i++) expect(zs[i - 1]! - zs[i]!).toBe(d.RING_STRIDE_Z);
    expect(zs.filter((z) => z < -1234 && z > -1234 - 150).length).toBeGreaterThanOrEqual(4); // in view ahead
    const spans = d.spanLayout(-5000);
    for (const deck of spans.decks) expect(deck.y - d.SPAN_DECK_SIZE[1] / 2).toBeGreaterThan(CEILING + 2);
    for (const b of d.billboardLayout(-777)) expect(Math.abs(b.x) - d.BILLBOARD_FRAME_SIZE[0] / 2).toBeGreaterThan(12);
    const draws = 5 + Math.min(GANTRY_COUNT, d.GANTRY_LABELS.length);
    expect(draws).toBeLessThanOrEqual(12);
  });

  it("labels say nothing about engines or lineage (visible strings)", async () => {
    const d = await import("../../../apps/showcase-roadster-rush/src/render/dressing");
    for (const label of d.GANTRY_LABELS) {
      expect(label).toMatch(/^[A-Z0-9 ]+$/);
      expect(label.toLowerCase()).not.toMatch(/three|aura3d|webgl/);
    }
  });
});

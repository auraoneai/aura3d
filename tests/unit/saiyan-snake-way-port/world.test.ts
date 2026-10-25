import { describe, expect, it } from "vitest";
import { HERO_PARTS } from "../../../examples/saiyan-snake-way-port/hero";
import { POOLS, buildWorld } from "../../../examples/saiyan-snake-way-port/world";
import { RUNNER_STYLES } from "../../../examples/saiyan-snake-way-port/styles";

describe("saiyan-snake-way-port world", () => {
  it("builds the scene description without a GPU", () => {
    const world = buildWorld();
    expect(world.scene).toBeDefined();
    expect(typeof world.bind).toBe("function");
  });
  it("pools every entity type the simulation spawns", () => {
    for (const type of ["orb", "soul", "barrier", "arch", "oni", "sweeper", "power", "feast"]) expect(POOLS[type], type).toBeGreaterThan(0);
  });
  it("has unique hero part ids", () => {
    const ids = HERO_PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("offers three distinct runner looks with generic names", () => {
    expect(RUNNER_STYLES).toHaveLength(3);
    expect(new Set(RUNNER_STYLES.map((s) => s.gi)).size).toBe(3);
    for (const s of RUNNER_STYLES) expect(`${s.name} ${s.tagline}`).not.toMatch(/goku|saiyan|vegeta|piccolo|namek|kaio/i);
    for (const s of RUNNER_STYLES) {
      const r = (s.gi >> 16) & 255, g = (s.gi >> 8) & 255, b = s.gi & 255;
      expect(r > 150 && g > 50 && g < 120 && b < 70, `${s.name} suit must not be the orange gi`).toBe(false);
      expect(s.sash === 0x2fc8b4 && s.belt === 0x1f7a72, `${s.name} must not pair a teal sash with teal wristbands`).toBe(false);
    }
  });
});

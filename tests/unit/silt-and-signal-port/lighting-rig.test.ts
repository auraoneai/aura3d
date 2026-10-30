import { describe, expect, it } from "vitest";
import { PRACTICAL_COLOR, buildWorld, practicalPositions, rigOf, skySpec, waterSpec } from "../../../examples/silt-and-signal-port/world";
import { CHAPTER_LOOKS, chapterLook, keyAngleDeg, keyDirection } from "../../../examples/silt-and-signal-port/art/look";
import { CHAPTERS } from "../../../examples/silt-and-signal-port/chapters-data";

describe("Duneglide lighting rig", () => {
  it("chapter 0 uses the original measured rig (key 2.2, hemisphere 1.05)", () => {
    const rig = rigOf(0);
    expect(rig.night).toBe(false);
    expect(rig.sunIntensity).toBe(2.2);
    expect(rig.hemiIntensity).toBe(1.05);
  });

  it("no chapter's hemisphere exceeds the original 1.05 now that it adds to environments.neutral", () => {
    for (let c = 0; c < CHAPTERS.length; c += 1) {
      const rig = rigOf(c);
      expect(rig.hemiIntensity).toBeLessThanOrEqual(1.05);
      expect(rig.hemiIntensity).toBe(rig.night ? 0.85 : 1.05);
    }
  });
});

describe("GU47 DG-L1 CHAPTER_LIGHT: seven hours of one long day", () => {
  it("has one row per chapter with the PRD's elevation and azimuth", () => {
    expect(CHAPTER_LOOKS).toHaveLength(CHAPTERS.length);
    const table = CHAPTER_LOOKS.map((l) => [l.key.elevationDeg, l.key.azimuthDeg]);
    expect(table).toEqual([[9, 250], [64, 160], [28, 40], [14, 290], [40, 200], [22, 330], [6, 80]]);
  });

  it("every pair of chapters has key directions at least 15 deg apart, and no two keys share a colour", () => {
    for (let a = 0; a < CHAPTER_LOOKS.length; a++) {
      for (let b = a + 1; b < CHAPTER_LOOKS.length; b++) {
        expect(keyAngleDeg(CHAPTER_LOOKS[a]!, CHAPTER_LOOKS[b]!), `ch${a} vs ch${b}`).toBeGreaterThanOrEqual(15);
      }
    }
    expect(new Set(CHAPTER_LOOKS.map((l) => l.key.color)).size).toBe(CHAPTER_LOOKS.length);
  });

  it("the shadowed key, the sky disc and the water glint share one vector", () => {
    for (let c = 0; c < CHAPTERS.length; c++) {
      const nodes = (buildWorld(c).scene as unknown as { toJSON(): { nodes: Record<string, any>[] } }).toJSON().nodes;
      const key = nodes.find((n) => n.light === "directional" && n.shadow)!;
      const dir = keyDirection(chapterLook(c));
      const p = key.position as number[];
      const len = Math.hypot(p[0]!, p[1]!, p[2]!);
      expect(p.map((v) => v / len)[1]).toBeCloseTo(dir[1], 5);
      expect(skySpec(c, "inked").uniforms!.sunDir!.value).toEqual(dir);
      expect(waterSpec(c, "inked").uniforms!.sunDir!.value).toEqual(dir);
      expect(key.intensity).toBe(chapterLook(c).key.intensity);
    }
  });

  it("DG-L3: the unshadowed rim sits opposite the key and stays below it in every chapter", () => {
    for (let c = 0; c < CHAPTERS.length; c++) {
      const nodes = (buildWorld(c).scene as unknown as { toJSON(): { nodes: Record<string, any>[] } }).toJSON().nodes;
      const dirs = nodes.filter((n) => n.light === "directional");
      const key = dirs.find((n) => n.shadow)!, rim = dirs.find((n) => !n.shadow)!;
      expect(rim.intensity).toBeLessThan(key.intensity);
      const kp = key.position as number[], rp = rim.position as number[];
      expect(kp[0]! * rp[0]! + kp[2]! * rp[2]!).toBeLessThan(0);
    }
  });

  it("DG-L4: night chapters add at most five amber practicals on the ring route; day chapters none", () => {
    for (let c = 0; c < CHAPTERS.length; c++) {
      const nodes = (buildWorld(c).scene as unknown as { toJSON(): { nodes: Record<string, any>[] } }).toJSON().nodes;
      const points = nodes.filter((n) => n.light === "point");
      expect(points.length).toBe(chapterLook(c).night ? 5 : 0);
      expect(points.length).toBe(practicalPositions(c, chapterLook(c).practicals).length);
      for (const p of points) expect(p.color).toBe(PRACTICAL_COLOR);
    }
  });

  it("?look=original keeps today's rig (hemisphere plus the hand key at the same position)", () => {
    const nodes = (buildWorld(3, { look: "original" }).scene as unknown as { toJSON(): { nodes: Record<string, any>[] } }).toJSON().nodes;
    expect(nodes.some((n) => n.light === "hemisphere")).toBe(true);
    expect(nodes.find((n) => n.light === "directional")!.position).toEqual([-100, 153, -80]);
  });
});

import { describe, expect, it } from "vitest";
import { apexHeroPaint, apexRivalPaint } from "../../../apps/showcase-roadster-rush/src/art/paint";

const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe("Apex Overdrive vehicle paint (GU47 AO-M1, AO-A2 interim)", () => {
  it("paints the hero cobalt (B > R) with a warm rim and never replaces its textures", () => {
    const [hero] = apexHeroPaint();
    const [r, , b] = rgb(String(hero!.color));
    expect(b).toBeGreaterThan(r!);
    expect(hero!.colorMode).toBe("multiply");
    expect(hero!.replaceTextures).toBeUndefined();
    expect(hero!.clearcoat).toBe(1);
    expect(hero!.metallic).toBeCloseTo(0.65, 6);
    const [rr, , rb] = rgb(String(hero!.rim!.color));
    expect(rr).toBeGreaterThan(rb!);
  });

  it("keeps the rival graphite with the reserved red rim, never the hero's paint", () => {
    const [hero] = apexHeroPaint();
    const [rival] = apexRivalPaint();
    expect(rival!.rim!.color).toBe("#ff2a3c");
    expect(rival!.color).not.toBe(hero!.color);
    expect(rival!.replaceTextures).toBeUndefined();
  });
});

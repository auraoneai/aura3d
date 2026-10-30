import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hueDeg, hueDistance } from "../../../apps/showcase-aura-links-3d/src/game/lighting";
import {
  LINKS_VFX_COLORS,
  LINKS_VFX_IDS,
  LINKS_VFX_MAX_LIFE,
  landingVfxFor,
  linksVfxMaxLife,
  linksVfxParticles,
  linksVfxSpecs,
  registerLinksVfx
} from "../../../apps/showcase-aura-links-3d/src/game/vfx";

const appSrc = resolve(__dirname, "../../../apps/showcase-aura-links-3d/src");
const plain = { reducedMotion: false, reducedFlash: false };

describe("Aura Links VFX preset pack (GU47 LINKS-11)", () => {
  it("runtime VFX are back on: main.ts no longer switches them off", () => {
    const main = readFileSync(resolve(appSrc, "main.ts"), "utf8");
    expect(main).not.toMatch(/effects\.runtime\s*=\s*"off"/);
    expect(main).toMatch(/registerLinksVfx\(/);
  });

  it("registers the seven Links presets on the effects surface", () => {
    const seen: string[] = [];
    const names = registerLinksVfx({ registerPreset: (kind) => { seen.push(kind); } }, plain);
    expect(names).toEqual([...LINKS_VFX_IDS]);
    expect(seen).toEqual([...LINKS_VFX_IDS]);
    expect(registerLinksVfx(null, plain)).toEqual([]);
  });

  it("spec colours sit at least 20 deg apart in hue", () => {
    for (let i = 0; i < LINKS_VFX_IDS.length; i++) {
      for (let j = i + 1; j < LINKS_VFX_IDS.length; j++) {
        const a = LINKS_VFX_COLORS[LINKS_VFX_IDS[i]!], b = LINKS_VFX_COLORS[LINKS_VFX_IDS[j]!];
        expect(hueDistance(hueDeg(a), hueDeg(b)), `${LINKS_VFX_IDS[i]} vs ${LINKS_VFX_IDS[j]}`).toBeGreaterThanOrEqual(20);
      }
    }
    for (const spec of linksVfxSpecs(plain)) {
      const first = spec.layers.find((l) => l.type === "emitter") as { color?: string } | undefined;
      expect(first?.color, spec.name).toBe(LINKS_VFX_COLORS[spec.name as keyof typeof LINKS_VFX_COLORS]);
    }
  });

  it("every particle dies before 2 s (live count back to 0) and one burst stays a small share of the 2,000 budget", () => {
    for (const spec of linksVfxSpecs(plain)) {
      expect(linksVfxMaxLife(spec), spec.name).toBeLessThanOrEqual(LINKS_VFX_MAX_LIFE);
      expect(linksVfxMaxLife(spec), spec.name).toBeLessThan(2);
      expect(linksVfxParticles(spec), spec.name).toBeLessThanOrEqual(60);
    }
  });

  it("reduced motion halves every count; reduced flash drops the light layers (PRD §6.3)", () => {
    const full = linksVfxSpecs(plain);
    const calm = linksVfxSpecs({ reducedMotion: true, reducedFlash: false });
    full.forEach((spec, i) => {
      expect(linksVfxParticles(calm[i]!), spec.name).toBeLessThanOrEqual(Math.ceil(linksVfxParticles(spec) / 2) + 1);
    });
    const noFlash = linksVfxSpecs({ reducedMotion: false, reducedFlash: true });
    expect(full.some((s) => s.layers.some((l) => l.type === "light"))).toBe(true);
    expect(noFlash.some((s) => s.layers.some((l) => l.type === "light"))).toBe(false);
  });

  it("maps landings by zone and course: water splashes (lava hisses on Cinder), sand bursts, Mare kicks low-gravity dust", () => {
    expect(landingVfxFor("stAuroras", "water")).toBe("links-water-splash");
    expect(landingVfxFor("cinderRim", "water")).toBe("links-ember-hiss");
    expect(landingVfxFor("mapleHollow", "sand")).toBe("links-sand-burst");
    expect(landingVfxFor("mapleHollow", "fairway")).toBe("links-divot");
    expect(landingVfxFor("mareCourse", "fairway")).toBe("links-lowg-dust");
    expect(landingVfxFor("mareCourse", "sand")).toBe("links-lowg-dust");
    // the 4.6.2 juice map sent a water splash to ground dust; the splash burst is now the engine's splash
    const main = readFileSync(resolve(appSrc, "main.ts"), "utf8");
    expect(main).not.toMatch(/splash:\s*"ground-dust"/);
  });

  it("the divot leaves a runtime pitch-mark decal (LINKS-10)", () => {
    const divot = linksVfxSpecs(plain).find((s) => s.name === "links-divot")!;
    expect(divot.layers.some((l) => l.type === "decal")).toBe(true);
  });
});

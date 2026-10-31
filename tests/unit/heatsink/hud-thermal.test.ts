/**
 * Thermal Drift HS-18 HUD: the core temperature readout, the split damage / overheat overlays (reduced motion caps the
 * damage overlay), the card hiding the race chrome, and no label under 12 px in the page CSS.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_TEMP, coreTemperatureC, OVERLAY, overlayOpacities } from "../../../apps/showcase-heatsink/src/hud";

const html = readFileSync(join(__dirname, "../../../apps/showcase-heatsink/index.html"), "utf8");

describe("heatsink HS-18 thermal HUD", () => {
  it("maps heat 0..100% to 300..1200 C, clamped", () => {
    expect(coreTemperatureC(0)).toBe(CORE_TEMP.coldC);
    expect(coreTemperatureC(100)).toBe(CORE_TEMP.hotC);
    expect(coreTemperatureC(50)).toBe(750);
    expect(coreTemperatureC(-5)).toBe(300);
    expect(coreTemperatureC(140)).toBe(1200);
  });
  it("drives the damage and overheat overlays separately; reduced motion caps the damage overlay", () => {
    expect(overlayOpacities({ damageTimer: 0.2, overheated: false, heat: 10, reducedMotion: false })).toEqual({ damage: OVERLAY.damage, overheat: 0 });
    expect(overlayOpacities({ damageTimer: 0.2, overheated: false, heat: 10, reducedMotion: true }).damage).toBe(OVERLAY.damageReduced);
    expect(overlayOpacities({ damageTimer: 0, overheated: true, heat: 100, reducedMotion: false })).toEqual({ damage: 0, overheat: OVERLAY.overheat });
    expect(overlayOpacities({ damageTimer: 0, overheated: false, heat: 90, reducedMotion: false }).overheat).toBeGreaterThan(0.4);
  });
  it("colours the overlays slag red and molten orange and hides the glazes on the card but keeps the HUD and minimap (GU47 phase 3)", () => {
    expect(html).toContain('id="damage-glaze"');
    expect(html).toContain("rgba(210, 54, 28,");
    expect(html).toContain("rgba(255, 138, 31,");
    expect(html).toMatch(/body\.td-card \.damage-glaze/);
    expect(html).not.toMatch(/body\.td-card #hud/);
    expect(html).toContain('id="h-core"');
  });
  it("sets no font size under 12 px and loads the licensed site fonts", () => {
    const sizes = [...html.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(10);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    expect(html).toContain('href="/fonts/aura-fonts.css"');
    expect(html).not.toMatch(/fonts\.googleapis|"Inter"|Roboto/);
  });
});

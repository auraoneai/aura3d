import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  VENUE_CARD_FADE_S, VENUE_CARD_MAX_S, VENUE_CARD_MIN_S, cardLuma, createVenueTransition, venueCardColors
} from "../../../apps/showcase-aura-fc-3d/src/game/venueTransition";
import { VENUES, VENUE_ORDER } from "../../../apps/showcase-aura-fc-3d/src/game/content";

/**
 * Owner QA: every autoplay venue switch showed ~2 s of a near-black frame while the rebuilt venue's programs, IBL and
 * textures settled. A venue-coloured broadcast card now covers the switch until warmPrograms resolves, then fades.
 */
const FRAME = 1 / 60;

describe("Aura FC 3D venue transition card", () => {
  it("covers from the switch frame until the new venue is warm (and at least the minimum hold), then fades out", () => {
    const tr = createVenueTransition();
    expect(tr.opacity(0)).toBe(0);
    expect(tr.holding(0)).toBe(false);
    tr.begin(10);
    for (let t = 10; t < 12.2; t += FRAME) { expect(tr.opacity(t)).toBe(1); expect(tr.holding(t)).toBe(true); }
    tr.warmed(12.2);
    expect(tr.opacity(12.2)).toBe(1);
    expect(tr.holding(12.2 + FRAME)).toBe(false);          // play resumes as the fade starts
    expect(tr.opacity(12.2 + VENUE_CARD_FADE_S / 2)).toBeGreaterThan(0.2);
    expect(tr.opacity(12.2 + VENUE_CARD_FADE_S / 2)).toBeLessThan(0.8);
    expect(tr.opacity(12.2 + VENUE_CARD_FADE_S + FRAME)).toBe(0);
  });

  it("a fast warm-up still holds the card for the minimum so it never blinks; a warm-up that never settles is capped", () => {
    const fast = createVenueTransition();
    fast.begin(0); fast.warmed(0.05);
    expect(fast.opacity(VENUE_CARD_MIN_S - FRAME)).toBe(1);
    expect(fast.opacity(VENUE_CARD_MIN_S + VENUE_CARD_FADE_S + FRAME)).toBe(0);
    const stuck = createVenueTransition();
    stuck.begin(0);
    expect(stuck.opacity(VENUE_CARD_MAX_S - FRAME)).toBe(1);
    expect(stuck.opacity(VENUE_CARD_MAX_S + VENUE_CARD_FADE_S + FRAME)).toBe(0);
    expect(stuck.holding(VENUE_CARD_MAX_S + FRAME)).toBe(false);
  });

  it("a second switch restarts the card (the first warm-up finishing late does not drop the second card)", () => {
    const tr = createVenueTransition();
    tr.begin(0); tr.begin(0.5);
    expect(tr.opacity(0.5 + VENUE_CARD_MIN_S - FRAME)).toBe(1);
  });

  it("no near-black frame across a switch: card over a scene that is black until warm (~2 s), for every venue", () => {
    for (const v of VENUE_ORDER) {
      const c = venueCardColors(VENUES[v]);
      const card = (cardLuma(c.top) + cardLuma(c.bottom)) / 2;
      expect(Math.min(cardLuma(c.top), cardLuma(c.bottom), cardLuma(c.stripe)), v).toBeGreaterThan(0.3);
      expect(cardLuma(c.ink), v).toBeLessThan(card - 0.25);     // legible dark ink on the lit card
      const tr = createVenueTransition();
      const switchAt = 3, warmAt = 5.1;
      tr.begin(switchAt);
      let worst = Infinity;
      for (let t = switchAt; t < warmAt + 2; t += FRAME) {
        if (t >= warmAt) tr.warmed(warmAt);
        const scene = t < warmAt ? 0.02 : 0.28;              // near black while warming, a lit stadium after
        const o = tr.opacity(t);
        worst = Math.min(worst, o * card + (1 - o) * scene);
      }
      expect(worst, v).toBeGreaterThan(0.2);
    }
  });

  it("main.ts covers every post-boot venue rebuild, releases the card when warmPrograms settles, and holds the match under it", () => {
    const src = readFileSync("apps/showcase-aura-fc-3d/src/main.ts", "utf8");
    const rebuild = src.slice(src.indexOf("const rebuildForVenue"), src.indexOf("const sim = createSim()"));
    expect(rebuild).toMatch(/appReady \? showVenueCard\(venue, fixture\)/);
    expect(rebuild.indexOf("showVenueCard")).toBeLessThan(rebuild.indexOf("setScene"));
    expect(rebuild).toMatch(/warmPrograms\([\s\S]*?\.finally\(\(\) => \{ if \(seq === venueCardSeq\) venueFade\.warmed/);
    expect(src).toMatch(/const venueHold = venueFade\.holding\(now\);[\s\S]{0,80}tickVenueCard\(now\);[\s\S]{0,40}if \(appReady && !frozen && !venueHold\)/);
  });
});

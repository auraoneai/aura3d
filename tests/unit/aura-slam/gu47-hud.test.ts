/**
 * GU47 TT-H1: World Tour scorebug additions (ui/broadcast.ts): venue chip + set label, and the serve-speed strip that
 * shows for 2.6 s after each serve. The chip and strip live inside the scorebug box (no extra HUD area). Pixels
 * (HUD <= 9% of canvas, never over an athlete box, font requests) are phase 2.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVE_STRIP_MS, createBroadcastHud, createServeStripMemo, serveStripView, venueChipView } from "../../../examples/aura-slam/ui/broadcast";
import { VENUE_THEMES } from "../../../examples/aura-slam/ui/venues";

const serve = (speed: number, over: Record<string, unknown> = {}) => ({ mode: "playing", lastStroke: "serve", lastShotSpeed: speed, server: "player", serveNumber: 1, ...over });

describe("GU47 TT-H1: broadcast scorebug", () => {
  it("a serve shows its speed for SERVE_STRIP_MS, then the strip hides", () => {
    const memo = createServeStripMemo();
    expect(serveStripView({ mode: "playing", lastStroke: "none", lastShotSpeed: 0 }, memo, 0).visible).toBe(false);
    const v = serveStripView(serve(176.4), memo, 1000);
    expect(v).toMatchObject({ visible: true, label: "1ST SERVE", speed: "176 KM/H", side: "player" });
    expect(serveStripView(serve(176.4), memo, 1000 + SERVE_STRIP_MS - 1).visible).toBe(true);
    expect(serveStripView(serve(176.4), memo, 1000 + SERVE_STRIP_MS).visible).toBe(false);
  });

  it("a second serve, a new server or a rally stroke then a new serve restarts it", () => {
    const memo = createServeStripMemo();
    serveStripView(serve(150), memo, 0);
    expect(serveStripView(serve(132, { serveNumber: 2 }), memo, 5000)).toMatchObject({ visible: true, label: "2ND SERVE", speed: "132 KM/H" });
    serveStripView({ mode: "playing", lastStroke: "forehand", lastShotSpeed: 90 }, memo, 6000);
    expect(serveStripView(serve(132, { serveNumber: 2 }), memo, 9000).visible).toBe(true);
    expect(serveStripView(serve(171, { server: "ai" }), memo, 20000)).toMatchObject({ visible: true, side: "ai" });
  });

  it("the menu clears the strip", () => {
    const memo = createServeStripMemo();
    serveStripView(serve(150), memo, 0);
    expect(serveStripView({ ...serve(150), mode: "menu" }, memo, 10).visible).toBe(false);
  });

  it("every venue has a chip with its short code and accent", () => {
    for (const venue of Object.keys(VENUE_THEMES)) {
      const c = venueChipView({ venue } as never);
      expect(c.text).toBe(VENUE_THEMES[venue]!.short);
      expect(c.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.setLabel).toBe("SET 1");
    }
  });

  it("is a no-op without a DOM, and the styles use only the page's licensed faces", () => {
    const hud = createBroadcastHud(null);
    expect(() => hud.render({ venue: "clay" } as never, 0)).not.toThrow();
    const css = readFileSync(resolve(__dirname, "../../../examples/aura-slam/ui/styles.css"), "utf8");
    const block = css.slice(css.indexOf("GU47 TT-H1"));
    expect(block).toContain(".slam-serve-strip{position:absolute");
    expect(block).not.toMatch(/font-family:(?!var\(--font-(display|sans)\))/);
  });
});

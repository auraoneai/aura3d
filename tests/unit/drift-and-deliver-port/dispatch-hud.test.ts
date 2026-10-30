import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DIAL_MAX, DIAL_START, DIAL_SWEEP, DISTRICT_TINT, PARK_TINT, dialAngle, districtLayers, drawDial, ticketText } from "../../../examples/drift-and-deliver-port/hud";
import { BLOCK_HALF, buildBlocks } from "../../../examples/drift-and-deliver-port/world";
import { COURIER_TEAL } from "../../../examples/drift-and-deliver-port/fx";

const PAGES = ["examples/drift-and-deliver-port/index.html", "apps/showcase-drift-and-deliver-port/index.html"];

describe("gridlock courier dispatch HUD (GU47 WP-28 GC-H1)", () => {
  it("tints one rect per block by district, parks green, never courier teal", () => {
    const blocks = buildBlocks();
    const layers = districtLayers(blocks);
    expect(layers).toHaveLength(blocks.length);
    const b = blocks[0]!;
    expect(layers[0]!.rect).toEqual([b.x - BLOCK_HALF, b.z - BLOCK_HALF, b.x + BLOCK_HALF, b.z + BLOCK_HALF]);
    const fills = new Set(layers.map((l) => l.fill));
    expect(fills.size).toBeGreaterThanOrEqual(5);
    expect(fills.has(PARK_TINT)).toBe(true);
    for (const tint of Object.values(DISTRICT_TINT)) expect(tint.toLowerCase()).not.toContain("34,195,201");
  });

  it("sweeps the dial 270 deg and clamps", () => {
    expect(dialAngle(0)).toBeCloseTo(DIAL_START, 9);
    expect(dialAngle(DIAL_MAX)).toBeCloseTo(DIAL_START + DIAL_SWEEP, 9);
    expect(dialAngle(-5)).toBe(dialAngle(0));
    expect(dialAngle(999)).toBe(dialAngle(DIAL_MAX));
  });

  it("draws the needle in courier teal", () => {
    const styles: string[] = [];
    const ctx = {
      lineWidth: 0, lineCap: "butt" as CanvasLineCap, fillStyle: "", _s: "",
      get strokeStyle() { return this._s; },
      set strokeStyle(v: string) { this._s = v; styles.push(v); },
      clearRect() {}, beginPath() {}, arc() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}
    };
    drawDial(ctx, 112, 80, 0.5);
    expect(styles.at(-1)).toBe(COURIER_TEAL);
  });

  it("writes the ticket number, distance and job clock", () => {
    expect(ticketText(3, 311.6, "0:42")).toBe("TICKET 03\n312 m   0:42");
  });

  it("keeps the stamp still under reduced motion and uses local fonts only", () => {
    for (const page of PAGES) {
      const html = readFileSync(page, "utf8");
      expect(html).toContain('id="dial"');
      expect(html).toContain('id="stamp"');
      expect(html).toMatch(/body\.dispatch\.reduced-motion #stamp\.on \{ animation-name: stamp-fade; \}/);
      expect(html).toMatch(/prefers-reduced-motion: reduce\) \{ body\.dispatch #stamp\.on \{ animation-name: stamp-fade; \}/);
      expect(html).toContain('href="/fonts/local.css"');
      expect(html).not.toMatch(/fonts\.googleapis|Barlow|National 2/);
    }
  });
});

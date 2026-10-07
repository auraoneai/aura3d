// tests/qr/prd14/orbital-defense/hud-diff.test.ts — T1.12 (Orbital Defense):
// 300 frames with constant state cause at most 1 DOM write.
import { describe, expect, it } from "vitest";
import { maybeWriteHud } from "../../../../apps/showcase-orbital-defense/src/legacy/hud-diff";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MAIN = join(__dirname, "..", "..", "..", "..", "apps", "showcase-orbital-defense", "src", "legacy", "main.ts");

describe("orbital HUD dirty-check (T1.12)", () => {
  it("300 frames with constant state cause <= 1 DOM write", () => {
    let writes = 0;
    const host = {
      get innerHTML() { return this._html; },
      set innerHTML(v: string) { this._html = v; writes += 1; },
      _html: ""
    };
    const last = { value: undefined as string | undefined };
    for (let i = 0; i < 300; i += 1) {
      maybeWriteHud(host, "<p>score: 0 wave: 1</p>", last);
    }
    expect(writes).toBeLessThanOrEqual(1);
    // a real change writes again
    maybeWriteHud(host, "<p>score: 75 wave: 1</p>", last);
    expect(writes).toBe(2);
  });

  it("legacy renderHud writes through the dirty check", () => {
    const src = readFileSync(MAIN, "utf8");
    expect(src).toContain("maybeWriteHud(hud, html, lastHudHtml)");
    expect(src).not.toContain("hud.innerHTML = `");
  });

  it("legacy HUD drops the Checksum / Systems marketing sections", () => {
    const src = readFileSync(MAIN, "utf8");
    expect(src).not.toContain("| Checksum");
    expect(src).not.toContain('panel--right');
    expect(src).not.toContain("particle-heavy");
  });
});

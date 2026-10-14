// tests/qr/prd14/turbo-drift/ghost-toggle-keycap.test.ts — T1.12 (Turbo Drift):
// the ghost toggle renders "G Ghost OFF" — the key glyph is a <kbd> (not a <b>),
// spaced by CSS and hidden on coarse pointers.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HUD = join(__dirname, "..", "..", "..", "..", "apps", "showcase-turbo-drift-circuit", "src", "legacy", "hud.ts");
const CSS = join(__dirname, "..", "..", "..", "..", "apps", "showcase-turbo-drift-circuit", "src", "legacy", "styles.css");

describe("ghost-toggle keycap (T1.12)", () => {
  const hud = readFileSync(HUD, "utf8");
  const css = readFileSync(CSS, "utf8");

  it("renders a <kbd> keycap, not <b>", () => {
    expect(hud).toContain('<button id="ghost-toggle-control" type="button" aria-pressed="false"><kbd class="keycap" aria-hidden="true">G</kbd><span id="ghost-state-value">Ghost OFF</span></button>');
    expect(hud).not.toContain('<b aria-hidden="true">G</b>');
  });

  it("rendered text of #ghost-toggle-control reads 'G Ghost OFF' (with a gap)", () => {
    // Extract the button's markup and flatten tags -> whitespace gap.
    const m = hud.match(/<button id="ghost-toggle-control"[^>]*>(.*?)<\/button>/s);
    expect(m).not.toBeNull();
    const text = m![1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(text).toBe("G Ghost OFF");
  });

  it("css sets margin-inline-end and hides on coarse pointers", () => {
    expect(css).toMatch(/kbd\.keycap\s*\{[^}]*margin-inline-end:\s*0\.4em/s);
    expect(css).toMatch(/@media\s*\(pointer:\s*coarse\)\s*\{[^}]*kbd\.keycap\s*\{\s*display:\s*none/s);
  });
});

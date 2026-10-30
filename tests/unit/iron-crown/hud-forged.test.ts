/**
 * IRON CROWN GU47 IC47-H1 (partial): the forged HUD uses the art-direction palette, keeps the reserved objective gold for
 * the SUPER meter and crown pips, stays on the licensed UI font stack and stills its pulse on reduced motion.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import direction from "../../../apps/showcase-iron-crown/src/art/direction";

const css = readFileSync("apps/showcase-iron-crown/src/styles.css", "utf8");
const forged = css.slice(css.indexOf("GU47 IC47-H1"));

describe("iron-crown forged HUD (GU47 IC47-H1)", () => {
  it("draws the bars in black iron, molten gold and ember crimson", () => {
    for (const hex of direction.palette.primary) expect(forged.toLowerCase()).toContain(hex.toLowerCase());
  });

  it("reserves the objective gold for the meter and the pips", () => {
    const reserved = (direction.palette.reservedObjective ?? "").toLowerCase();
    expect(reserved).not.toBe("");
    const rules = forged.split("}").filter((rule) => rule.toLowerCase().includes(reserved));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule, rule).toMatch(/fh-meter|fh-pips|fh-plate \{/);
  });

  it("uses only the licensed UI font stack and stills motion on reduced motion", () => {
    expect(forged).not.toMatch(/font-family/);
    expect(css).toContain('var(--font-ui, "Whitney"');
    expect(forged).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });
});

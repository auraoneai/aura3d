import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** GU47 WP-31 LT-17: railway-enamel HUD, brass spirit-level lean meter, departure-board results, licensed fonts only. */
const css = readFileSync("examples/last-train-port/enamel.css", "utf8");
const main = readFileSync("examples/last-train-port/main.ts", "utf8");
const sha = (p: string): string => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("Lamplight Line enamel HUD (GU47 WP-31 LT-17)", () => {
  it("dresses only the band look; ?look=original keeps today's HUD", () => {
    expect(main).toContain('import "./enamel.css"');
    expect(main).toMatch(/if \(LOOK === "bands"\) document\.documentElement\.classList\.add\("enamel"\)/);
    for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.trim()).filter((r) => r && !r.startsWith("@font-face") && !r.startsWith("@media"))) {
      const selector = rule.split("{")[0]!.trim();
      if (selector) expect(selector.split(",").every((s) => s.trim().startsWith("html.enamel"))).toBe(true);
    }
  });

  it("uses licensed faces only, byte-identical to the font library copies", () => {
    const families = [...css.matchAll(/font-family:\s*([^;]+);/g)].flatMap((m) => m[1]!.split(",").map((f) => f.trim().replace(/"/g, "")));
    for (const f of families) expect(["Lamplight Narrow", "Graphik Web", "TT Commons Pro Mono", "ui-monospace", "monospace", "sans-serif"]).toContain(f);
    for (const w of ["400", "700"]) expect(sha(`examples/last-train-port/fonts/national-2-narrow-${w}.woff2`)).toBe(sha(`packages/game/src/fonts/national-2-narrow-${w}.woff2`));
  });

  it("keeps HUD text at >= 12 px and adds no motion (reduced motion needs no override)", () => {
    for (const m of css.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(12);
    expect(css).not.toMatch(/animation|transition/);
  });
});

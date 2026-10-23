import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_DISPLAY_TERMS, displayText } from "../../../examples/saiyan-snake-way-port/text";
import { STAGES } from "../../../examples/saiyan-snake-way-port/sim";

/** Every string literal the simulation can put on screen: toast/banner arguments, stage names and subtitles, end reasons. */
function emittedStrings(): string[] {
  const source = readFileSync(new URL("../../../examples/saiyan-snake-way-port/sim.ts", import.meta.url), "utf8");
  const out = new Set<string>();
  for (const m of source.matchAll(/(?:toast|banner)\(S,\s*(?:`([^`]*)`|"([^"]*)")(?:,\s*(?:`([^`]*)`|"([^"]*)"))?/g)) for (const g of m.slice(1)) if (g) out.add(g.replace(/\$\{[^}]*\}/g, "10"));
  for (const m of source.matchAll(/(?:gameOver|fallOffRoad|fallThroughCloud|damage)\(S,\s*(?:[^,"]+,\s*)?"([^"]+)"/g)) out.add(m[1]!);
  for (const m of source.matchAll(/(?:bannerSub|milestoneText|ended|fallWhy)\s*=\s*"([^"]+)"/g)) out.add(m[1]!);
  for (const stage of STAGES) { out.add(stage.name); out.add(stage.sub); }
  return [...out];
}

describe("player-facing text", () => {
  const strings = emittedStrings();
  it("finds the simulation's strings", () => {
    expect(strings.length).toBeGreaterThan(30);
    expect(strings.some((s) => /KAIO-KEN/.test(s))).toBe(true);
  });
  it("never shows a franchise term after mapping", () => {
    for (const s of strings) for (const term of FORBIDDEN_DISPLAY_TERMS) expect(displayText(s), `"${s}" -> "${displayText(s)}"`).not.toMatch(term);
  });
  it("maps the known terms to generic wording and leaves other text alone", () => {
    expect(displayText("KAIO-KEN ×4")).toBe("SURGE ×4");
    expect(displayText("SENZU BEAN  —  saved")).toBe("VITAL SEED  —  saved");
    expect(displayText("KI RESTORED")).toBe("SPARK RESTORED");
    expect(displayText("THE LONG ROAD")).toBe("THE LONG ROAD");
  });
});

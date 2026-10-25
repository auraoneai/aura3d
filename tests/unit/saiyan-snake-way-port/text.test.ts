import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STAGES } from "../../../examples/saiyan-snake-way-port/sim";

/** Terms borrowed from the game this one was inspired by: none may appear in any string the game can show. */
const FORBIDDEN: readonly RegExp[] = [
  /kaio/i, /saiyan/i, /goku/i, /senzu/i, /yemma/i, /king kai/i, /princess snake/i, /nimbus/i, /power pole/i, /saibaman/i,
  /kamehameha/i, /dragon ?ball/i, /vegeta/i, /piccolo/i, /namek/i
];

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
    expect(strings.some((s) => /SURGE/.test(s))).toBe(true);
  });
  it("shows no term borrowed from another game, straight from the source", () => {
    for (const s of strings) for (const term of FORBIDDEN) expect(s, `"${s}"`).not.toMatch(term);
  });
  it("keeps the source and the page free of those terms too", () => {
    for (const file of ["sim.ts", "main.ts", "world.ts", "shaders.ts", "index.html"]) {
      const text = readFileSync(new URL(`../../../examples/saiyan-snake-way-port/${file}`, import.meta.url), "utf8").replace(/saiyan-snake-way/g, "");
      for (const term of FORBIDDEN) expect(text, `${file} matches ${term}`).not.toMatch(term);
    }
  });
});

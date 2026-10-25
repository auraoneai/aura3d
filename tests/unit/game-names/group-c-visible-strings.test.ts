import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string): string => readFileSync(resolve(process.cwd(), p), "utf8");

// Visible text (HTML bodies, UI templates, HUD strings, chapter names surfaced in state). Code identifiers and comments are not checked here.
const SURFACES: Array<[string, string[]]> = [
  ["examples/kid-goku-beyond-the-clouds-port/ui.ts", ["Beyond the", "Cloud Runner", "Star orb", "Mount Paozu", "Goku"]],
  ["examples/kid-goku-beyond-the-clouds-port/game.ts", ["Star orb", "Goku"]],
  ["examples/kid-goku-beyond-the-clouds-port/chapter.ts", ["name: \"Mount Paozu\""]],
  ["examples/where-the-wind-wanders-port/ui.ts", ["<h1>Where the Wind Wanders"]],
  ["examples/where-the-wind-wanders-port/index.html", ["Where the Wind Wanders"]],
  ["apps/showcase-roadster-rush/index.html", ["AURA3D 4.0"]],
  ["examples/silt-and-signal-port/index.html", ["Silt & Signal", "Silt &amp; Signal"]],
  ["examples/last-train-port/index.html", ["Last Train to the Sea"]],
  ["examples/roadster-hours-port/index.html", ["Roadster Hours"]]
];

describe("group C visible strings", () => {
  for (const [file, banned] of SURFACES) {
    it(`${file} has no old or inspiration-derived names`, () => {
      const src = read(file);
      for (const term of banned) expect(src, `${file} still contains "${term}"`).not.toContain(term);
    });
  }
});

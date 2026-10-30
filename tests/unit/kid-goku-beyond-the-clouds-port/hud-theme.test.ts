import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hudThemeFontFaces } from "@aura3d/engine/game";

const dir = "examples/kid-goku-beyond-the-clouds-port";

describe("CD-19 sky-expedition HUD", () => {
  it("ships the licensed theme faces app-locally, byte-identical to the theme set", () => {
    for (const face of hudThemeFontFaces("sky-expedition")) {
      const local = join(dir, "assets/fonts", face.file);
      expect(existsSync(local), local).toBe(true);
      expect(readFileSync(local).equals(readFileSync(join("packages/game/src/fonts", face.file)))).toBe(true);
    }
  });
  it("the storm HUD names the registered licensed family first and no Google or system face", () => {
    const ui = readFileSync(join(dir, "ui.ts"), "utf8");
    const storm = ui.split("\n").filter((line) => line.startsWith("#cr-ui.storm"));
    expect(storm.length).toBeGreaterThan(3);
    for (const line of storm.filter((l) => l.includes("font-family"))) {
      expect(line).toMatch(/font-family:"A3G Roobert"/);
      expect(line).not.toMatch(/Inter|Roboto|Geist|Barlow|system-ui|ui-sans-serif/);
    }
    expect(storm.join("\n")).toMatch(/#ffb347/); // amber pearl icons
    const main = readFileSync(join(dir, "main.ts"), "utf8");
    expect(main).toMatch(/hudThemeFontFaces\("sky-expedition"\)/);
  });
});

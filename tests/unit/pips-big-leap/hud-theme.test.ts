// GU47 WP-16 (G06) PBL-H1: the storybook HUD (E-J theme, licensed GT Walsheim + Canela, parchment chips).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hudThemeFontFaces } from "@aura3d/game";

const app = (p: string) => resolve(process.cwd(), "apps/showcase-pips-big-leap", p);
const main = readFileSync(app("src/main.ts"), "utf8");
const css = readFileSync(app("src/styles.css"), "utf8");
const notice = readFileSync(resolve(process.cwd(), "packages/game/src/fonts/NOTICE.txt"), "utf8");

describe("pips-big-leap storybook HUD (PBL-H1)", () => {
  it("ships exactly the storybook theme's licensed cuts, byte-identical to the E-J library (NOTICE sha256)", () => {
    const faces = hudThemeFontFaces("storybook");
    expect(faces.map((f) => f.file).sort()).toEqual(["canela-400.woff2", "gt-walsheim-400.woff2"]);
    for (const face of faces) {
      const bytes = readFileSync(app(`public/pbl-fonts/${face.file}`));
      const sha = createHash("sha256").update(bytes).digest("hex");
      expect(notice, face.file).toContain(sha);
      expect(bytes.length).toBeLessThanOrEqual(40 * 1024);
    }
  });

  it("mounts the storybook theme and registers its fonts in the diorama look only", () => {
    expect(main).toContain('theme: LOOK_MODE === "diorama" ? HUD_THEMES.storybook : "sci-fi-telemetry"');
    expect(main).toContain('hudThemeFontFaces("storybook")');
    expect(main).toContain("document.documentElement.dataset.pblLook = LOOK_MODE");
  });

  it("dresses the HUD as parchment chips with the Canela display face, scoped to the diorama look", () => {
    expect(css).toMatch(/:root\[data-pbl-look="diorama"\] \{[^}]*--pbl-display: "A3G Canela"/);
    expect(css).toMatch(/:root\[data-pbl-look="diorama"\] \.pbl-banner \.big \{[^}]*font-family: var\(--pbl-display\)/);
    // No unlicensed faces (PRD D9).
    expect(css).not.toMatch(/font-family:[^;]*\b(Inter|Roboto|Geist|Barlow)\b/);
  });
});

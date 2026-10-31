import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COURT_NAME_NODE_ID, SCOREBOARD_NODE_ID, courtNameNode, scoreboardNode, scoreboardText } from "../../../apps/showcase-aura-hoops-3d/src/diegetic";

const MAIN = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");

describe("Aura Hoops in-world score and court name (H47-H1)", () => {
  it("formats the board like the DOM bug (labs show no away score)", () => {
    expect(scoreboardText(7, 4, false)).toBe("7  4");
    expect(scoreboardText(3, 0, true)).toBe("3  -");
  });

  it("builds SDF text nodes with stable names", () => {
    const board = scoreboardNode("11  9").toJSON() as { name?: string };
    const name = courtNameNode("Rucker Park", "#ffb347", 11.9).toJSON() as { name?: string; rotation?: number[] };
    expect(board.name).toBe(SCOREBOARD_NODE_ID);
    expect(name.name).toBe(COURT_NAME_NODE_ID);
  });

  it("syncHud rebuilds the board only when the score text changes and publishes both texts", () => {
    expect(MAIN).toMatch(/function syncHud\(\): void \{\s*syncBoardScore\(\);/);
    expect(MAIN).toMatch(/if \(text === shownBoardScore\) return;/);
    expect(MAIN).toMatch(/inWorldScore: shownBoardScore \? \{ board: shownBoardScore, dom: currentBoardScore\(\) \}/);
  });
});

describe("Aura Hoops tour HUD skin (H47-H1)", () => {
  const HTML = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/index.html"), "utf8");
  it("skins the score bug and Jam meter only on the new look, with no system font stacks", () => {
    expect(MAIN).toMatch(/if \(LOOK_ORIGINAL\) delete document\.body\.dataset\.look; else document\.body\.dataset\.look = "tour"/);
    // the skin follows the court: setVenue re-reads the look and re-applies it
    expect(MAIN).toMatch(/LOOK_ORIGINAL = courtLookOriginal\(vId\);\s*applyHudLook\(\);/);
    expect(HTML).toContain('body[data-look="tour"] .scoreboard');
    expect(HTML).toContain('body[data-look="tour"] .jam-meter-wrap .k::before');
    expect(HTML).not.toMatch(/system-ui|-apple-system|Helvetica|Arial|Roboto|Inter\b/);
    expect(HTML).toContain('aria-label="Jam meter"');
  });
});

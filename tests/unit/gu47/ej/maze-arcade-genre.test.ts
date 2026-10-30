/**
 * GU47 WP-10 (E-J): `GameGenre` gains "maze-arcade" (C-35 contract,
 * `GAME_GENRES` runtime list, `defineArtDirection`) and the art-direction
 * skill's look-recipes table gains a maze-arcade row in the existing format.
 */
import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { GAME_GENRES, defineArtDirection, type GameArtDirection, type GameGenre } from "@aura3d/game/art";
import type { GameGenre as ContractGameGenre } from "../../../../packages/engine/src/contracts/art.js";
import { lookPresetIds } from "../../../../packages/engine/src/agent-api/looks/lookPresets.js";

const RECIPES = "packages/aura3d-cli/skills/aura3d-art-direction/references/look-recipes.md";
const RECIPE_MIRRORS = [
  ".cursor/skills/aura3d-art-direction/references/look-recipes.md",
  ".claude/skills/aura3d-art-direction/references/look-recipes.md",
  ".agents/skills/aura3d-art-direction/references/look-recipes.md",
  "packages/create-aura3d/skills/aura3d-art-direction/references/look-recipes.md"
];

const MAZE_DIRECTION: GameArtDirection = {
  id: "showcase-maze-fixture",
  genre: "maze-arcade",
  fantasy: "A courier racing glowing corridors on a lamp-lit board at night.",
  rebuildTier: "S-presentation",
  wave: 1,
  references: [
    { file: "board-key.png", source: "internal mood board", licence: "reference-only", why: "One warm key across the board and the falloff into the dark bench edges." },
    { file: "wall-glow.png", source: "internal mood board", licence: "reference-only", why: "Emissive wall edges that stay readable without washing the floor." },
    { file: "framing.png", source: "internal mood board", licence: "reference-only", why: "Three-quarter top-down framing that keeps the whole maze in view." }
  ],
  palette: { primary: ["#1f4a38", "#c9ced6"], accent: "#5ff3ff" },
  lighting: {
    key: { type: "directional", colorTemperatureK: 3400, shadow: true },
    fill: "ibl+bounce",
    practicals: 1,
    environment: { hdri: "workbenchNight", background: "enclosed" },
    exposureEV: 0.2
  },
  framing: { rig: "topDown", subjectHeightFraction: [0.7, 0.85], fovDeg: [35, 45], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "mazeCourier", maxTriangles: 20000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "world", assetKey: "mazeBoard", maxTriangles: 60000, textureSet: "BC+N", maxTextureSize: 2048 }
  ],
  vfx: [{ event: "pellet", kind: "pickup-sparkle" }],
  audio: [{ event: "pellet", cue: "pelletChime", variants: 4 }],
  signatureEffect: "walls light up along the courier's path",
  criticalCategories: ["lighting", "material_quality", "polish_juice"],
  tiers: {
    low: { particles: 64, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 128, shadowMap: 1024, cascades: 2, textureMax: 2048 },
    high: { particles: 256, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 512, shadowMap: 2048, cascades: 4, textureMax: 4096 }
  }
};

describe("GU47 WP-10 maze-arcade genre", () => {
  it("GAME_GENRES lists maze-arcade once and stays in lock-step with the C-35 GameGenre union", () => {
    expect(GAME_GENRES.filter((genre) => genre === "maze-arcade")).toHaveLength(1);
    expect(GAME_GENRES).toHaveLength(19);
    expectTypeOf<(typeof GAME_GENRES)[number]>().toEqualTypeOf<ContractGameGenre>();
    expectTypeOf<"maze-arcade">().toMatchTypeOf<GameGenre>();
  });

  it("defineArtDirection accepts a maze-arcade direction and still rejects unknown genres", () => {
    expect(defineArtDirection(MAZE_DIRECTION).genre).toBe("maze-arcade");
    const bogus = { ...MAZE_DIRECTION, genre: "maze-runner" } as unknown as GameArtDirection;
    expect(() => defineArtDirection(bogus)).toThrow(/is not a GameGenre/);
  });

  it("look-recipes.md carries a maze-arcade row in the table format, on a real look id", () => {
    const text = readFileSync(RECIPES, "utf8");
    const rows = text.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Genre"));
    const header = /^# Look recipes — (\d+) genre rows$/m.exec(text);
    expect(Number(header?.[1])).toBe(rows.length);
    const columns = text.split("\n").find((line) => line.startsWith("| Genre"))!.split("|").length;
    const maze = rows.find((line) => line.startsWith("| maze-arcade |"));
    expect(maze).toBeDefined();
    expect(maze!.split("|")).toHaveLength(columns);
    const look = /^\| maze-arcade \| `([^`]+)` \|/.exec(maze!)?.[1];
    expect(lookPresetIds).toContain(look);
    expect(maze).toMatch(/fov \d+/);
    expect(maze).toContain("`neon-night`");
  });

  it("every skill mirror carries the same look-recipes text", () => {
    const canonical = readFileSync(RECIPES, "utf8");
    for (const mirror of RECIPE_MIRRORS) expect(readFileSync(mirror, "utf8"), mirror).toBe(canonical);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const { games } = JSON.parse(readFileSync(resolve(root, "docs/workflows/game-inventory.json"), "utf8")) as {
  games: Array<{ slug: string; status: string }>;
};

describe("showcase card previews", () => {
  it("marketing/public/previews carries the same card files as public/previews for every live game", () => {
    const stale: string[] = [];
    for (const game of games.filter((g) => g.status === "live")) {
      for (const name of [`${game.slug}.webp`, `${game.slug}@2x.webp`]) {
        const a = readFileSync(resolve(root, "public/previews/showcase-index", name));
        const b = readFileSync(resolve(root, "marketing/public/previews/showcase-index", name));
        if (!a.equals(b)) stale.push(name);
      }
    }
    expect(stale).toEqual([]);
  });
});

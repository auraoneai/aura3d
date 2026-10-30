import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assetOwnerOf } from "../../../../tools/game-checks/lib/index.mjs";

// GU47 pass 4: asset-id prefixes the game lanes asked for (g17 serpent, g18 drift, g23 wind; g22 saltwind and g25 cumulus exist).
const terms = JSON.parse(readFileSync(resolve(__dirname, "../../../../tools/game-checks/data/terms.json"), "utf8"));
const owner = (id: string) => assetOwnerOf(id, terms, new Map(), { games: [] })?.owner;

describe("game-checks asset owner prefixes (pass 4)", () => {
  it("routes the new WP-36 key prefixes to their games", () => {
    expect(owner("serpentSoulTail")).toBe("serpentine-sky-run-port");
    expect(owner("serpentineCloud")).toBe("serpentine-sky-run-port");
    expect(owner("driftCourierPbr")).toBe("drift-and-deliver-port");
    expect(owner("windBellTower")).toBe("where-the-wind-wanders-port");
    expect(owner("saltwindTurbine")).toBe("roadster-hours-port");
    expect(owner("cumulusCloudBank")).toBe("cloud-runner-port");
  });

  it("matches only at a camel-case boundary", () => {
    expect(owner("windmillBlade")).toBeUndefined();
    expect(owner("drifterBoat")).toBeUndefined();
  });
});

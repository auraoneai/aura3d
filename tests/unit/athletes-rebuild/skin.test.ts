import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSkin } from "../../../packages/aura3d-cli/src/skin/analysis";
import { parseGlb } from "../../../packages/aura3d-cli/src/skin/gltf";

const assets = readFileSync(resolve(process.cwd(), "aura.assets.json"), "utf8");
const ids = ["hoopsAthleteBig", "hoopsAthleteGuard", "diamondAthlete", "linksGolferAthleteMeshy"];

describe("rebuilt palette athletes", () => {
  for (const id of ids) {
    it(`${id}: no triangle stretches past 1.6x and no flap in any clip the games play`, () => {
      const file = new RegExp(`"id": "${id}"[\\s\\S]*?"outputPath": "([^"]+)"`).exec(assets)![1]!;
      const report = analyzeSkin(parseGlb(readFileSync(resolve(process.cwd(), file))), {});
      for (const [material, m] of Object.entries(report.materials)) {
        expect(m.trianglesOverLimit, `${id} ${material} triangles over 1.6x`).toBe(0);
        expect(m.flaps, `${id} ${material} flaps`).toBe(0);
        expect(m.maxStretch, `${id} ${material} max stretch`).toBeLessThanOrEqual(1.6);
      }
    });
  }
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("repainted athlete models", () => {
  it("Aura FC tints only the kit material so skin, hair and boots keep their colours", () => {
    expect(read("apps/showcase-aura-fc-3d/src/game/rig.ts")).toMatch(/target: \/-kit\$\/, color: kit\.shirt/);
  });
});

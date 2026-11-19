/**
 * Moving-parts pass: the water-wheel rotor (Idol wheel when admitted, else the procedural rotor) is the
 * `setpiece-waterWheel` node centred on its X axle, which world.ts spins every frame; the katana and kanabo are aimed
 * from the posed hands every frame. Shadowstep has no carts or wheeled vehicles.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWaterWheelSetpieceGroup } from "../../../examples/ninja-runner-port/art/proceduralModels";
import { eveningSetPieces } from "../../../examples/ninja-runner-port/setpieces";

interface N { kind?: string; runtime?: { id?: string }; children?: N[] }
const find = (n: N, id: string): N | undefined => (n.runtime?.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean));

describe("ninja-runner-port moving parts", () => {
  it("the water-wheel rotor is its own runtime node and world.ts spins it about X with time", () => {
    const g = buildWaterWheelSetpieceGroup(eveningSetPieces().waterWheel[0]!).toJSON() as unknown as N;
    expect(find(g, "setpiece-waterWheel")).toBeTruthy();
    const src = readFileSync("examples/ninja-runner-port/world.ts", "utf8");
    expect(src).toMatch(/node\("setpiece-waterWheel"\)\.setRotation\(time \* 0\.9, 0, 0\)/);
  });
});

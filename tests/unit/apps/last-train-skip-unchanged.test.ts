import { describe, expect, it } from "vitest";
import { skipUnchangedUpdates } from "../../../examples/last-train-port/point-quads.js";

describe("Lamplight Line quad sprites: unchanged point updates are skipped", () => {
  it("passes changed arrays and offsets through, drops repeats, and retries an update that threw", () => {
    const writes: [string, number[], number][] = [];
    let fail = false;
    const skip = skipUnchangedUpdates({ updateAttribute: (name: string, update: { array: Float32Array; offset: number }) => {
      if (fail) throw new Error("rejected");
      writes.push([name, [...update.array], update.offset]);
    } });
    const size = new Float32Array([7, 8, 9]);
    skip.updateAttribute!("size", { array: size, offset: 0 });
    skip.updateAttribute!("size", { array: size, offset: 0 });
    // The caller's array is reused and edited in place: the edit is seen.
    size[1] = 8.5;
    skip.updateAttribute!("size", { array: size, offset: 0 });
    skip.updateAttribute!("size", { array: new Float32Array([7, 8.5, 9]), offset: 0 });
    // Another name, another offset and another length are separate.
    skip.updateAttribute!("fade", { array: new Float32Array([7, 8.5, 9]), offset: 0 });
    skip.updateAttribute!("size", { array: new Float32Array([7, 8.5, 9]), offset: 1 });
    skip.updateAttribute!("size", { array: new Float32Array([7, 8.5]), offset: 1 });
    expect(writes).toEqual([["size", [7, 8, 9], 0], ["size", [7, 8.5, 9], 0], ["fade", [7, 8.5, 9], 0], ["size", [7, 8.5, 9], 1], ["size", [7, 8.5], 1]]);
    fail = true;
    expect(() => skip.updateAttribute!("fade", { array: new Float32Array([1, 2, 3]), offset: 0 })).toThrow(/rejected/);
    fail = false;
    skip.updateAttribute!("fade", { array: new Float32Array([1, 2, 3]), offset: 0 });
    expect(writes.at(-1)).toEqual(["fade", [1, 2, 3], 0]);
  });
});

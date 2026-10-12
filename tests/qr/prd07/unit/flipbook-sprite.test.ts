// PRD-07 §6.2 flipbook-sprite: frame = age · frameRate over the sheet, upright
// full-alpha sprite, built-in seeded fireball sheet (promote run 38208531335:
// both prd07-flipbook sprites drew as plain soft-dot discs).

import { describe, expect, it } from "vitest";
import { lowerEffectNode } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { createEmitter, stepEmitter, writeEmitterInstances } from "../../../../packages/engine/src/production-runtime/effects/CpuEmitter";
import { proceduralFireballSheet } from "../../../../packages/engine/src/production-runtime/effects/FlipbookAtlas";

const node = { kind: "effect", name: "fb", effect: "flipbook-sprite", spriteColumns: 4, spriteRows: 2, frameRate: 16, seed: 9021, size: 1.6, blend: "additive" } as const;

describe("flipbook-sprite lowering", () => {
  it("lowers to one burst sprite with the sheet grid, size and blend", () => {
    const lowered = lowerEffectNode(node);
    expect(lowered?.type).toBe("emitter");
    if (lowered?.type !== "emitter") return;
    expect(lowered.batch.blend).toBe("additive");
    expect(lowered.batch.atlasKey).toBe("flipbook.4x2.9021");
    expect(lowered.emitter.burst).toBe(1);
    expect(lowered.emitter.emissionRate).toBe(0);
    expect(lowered.emitter.size).toEqual([1.6, 1.6]);
    expect(lowered.emitter.flipbook).toMatchObject({ frames: 8, frameRate: 16, loop: true, columns: 4, rows: 2, seed: 9021 });
  });

  it("frame follows age · frameRate (wrapping), alpha stays full, rotation 0", () => {
    const lowered = lowerEffectNode(node);
    if (lowered?.type !== "emitter") throw new Error("not an emitter");
    const state = createEmitter(lowered.emitter);
    for (let i = 0; i < 75; i += 1) stepEmitter(state, 1 / 60); // 1.25 s
    const out = new Float32Array(16);
    expect(writeEmitterInstances(state, out)).toBe(1);
    expect(out[3]).toBeCloseTo(1.6, 5);
    expect(out[11]).toBe(1);
    expect(out[12]).toBe(0);
    // 1.25 s · 16 fps = 20 → frame 4 of 8.
    expect(out[13]).toBeCloseTo(4, 3);
  });
});

describe("built-in fireball sheet", () => {
  it("is deterministic per seed and cools from a bright core to an empty last frame", () => {
    const a = proceduralFireballSheet(4, 2, 9021);
    const b = proceduralFireballSheet(4, 2, 9021);
    expect(a.data).toBe(b.data);
    expect(a.width).toBe(512);
    expect(a.height).toBe(256);
    const alphaOfCell = (sheet: typeof a, frame: number): number => {
      // Rows are bottom-up: frame 0 sits in the top image row (last data rows).
      const cx = (frame % sheet.columns) * 128;
      const cyTop = Math.floor(frame / sheet.columns) * 128;
      let sum = 0;
      for (let y = 0; y < 128; y += 1) {
        const dataRow = sheet.height - 1 - (cyTop + y);
        for (let x = 0; x < 128; x += 1) sum += sheet.data[(dataRow * sheet.width + cx + x) * 4 + 3];
      }
      return sum;
    };
    expect(alphaOfCell(a, 0)).toBeGreaterThan(0);
    expect(alphaOfCell(a, 7)).toBe(0);
    expect(proceduralFireballSheet(4, 2, 4407).data).not.toEqual(a.data);
  });
});

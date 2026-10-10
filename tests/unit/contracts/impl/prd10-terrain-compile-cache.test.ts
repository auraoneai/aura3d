/**
 * PRD-10 T0-33 FIX-compile-cache: the terrain program compiles lazily (only
 * once a terrain can draw) and at most once per device after a failure.
 */
import { describe, expect, it } from "vitest";
import type { RenderDevice, RenderPassContext } from "@aura3d/rendering";
import type { FrameContributorContext } from "@aura3d/rendering/contracts";
import {
  drawTerrainsForReflection,
  terrainBackgroundPass,
  terrainProgramStatus
} from "../../../../packages/engine/src/production-runtime/world/TerrainRuntime";
import { worldTerrain } from "../../../../packages/engine/src/agent-api/world/terrain";

function failingDevice(): { device: RenderDevice; attempts: () => number } {
  let attempts = 0;
  const device = {
    createShaderProgram() {
      attempts += 1;
      throw new Error("prd10.terrain: fragment compile failed (test)");
    }
  } as unknown as RenderDevice;
  return { device, attempts: () => attempts };
}

const ctx = {
  camera: { position: [0, 10, 0], viewProjectionMatrix: new Float32Array(16) },
  tier: { name: "high" }
} as unknown as FrameContributorContext;

function runPass(device: RenderDevice, frames: number): void {
  const pass = terrainBackgroundPass(ctx);
  for (let i = 0; i < frames; i += 1) pass.execute({ device } as unknown as RenderPassContext);
}

describe("prd10 terrain program compile cache (T0-33 FIX-compile-cache)", () => {
  it("does not compile while no terrain is registered", () => {
    const { device, attempts } = failingDevice();
    runPass(device, 3);
    drawTerrainsForReflection(ctx, device, new Float32Array(16), [0, 0, 0]);
    expect(attempts()).toBe(0);
    expect(terrainProgramStatus(device)).toEqual({ compiled: false, failure: null });
  });

  it("compiles once per device after a failure, not once per frame", () => {
    worldTerrain({
      id: "compile-cache-terrain",
      size: [10, 10],
      height: { kind: "array", columns: 2, rows: 2, heights: new Float32Array([0, 0, 0, 0]) },
      layers: [{ name: "grass" }],
      collider: false
    });
    const a = failingDevice();
    runPass(a.device, 5);
    drawTerrainsForReflection(ctx, a.device, new Float32Array(16), [0, 0, 0]);
    expect(a.attempts()).toBe(1);
    expect(terrainProgramStatus(a.device).compiled).toBe(false);
    expect(terrainProgramStatus(a.device).failure).toMatch(/compile failed/);

    // The cache is per device: a second device gets its own single attempt.
    const b = failingDevice();
    runPass(b.device, 4);
    expect(b.attempts()).toBe(1);
    expect(a.attempts()).toBe(1);
  });
});

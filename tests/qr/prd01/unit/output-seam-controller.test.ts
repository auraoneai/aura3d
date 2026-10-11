/**
 * PRD-01 C-05 seam (Q-15-1), #1083 GPU: `app.setOutput({ toneMapping, exposure })`
 * was never applied because the controller returned by `startProductionRender`
 * dropped `WebGLSceneRenderer.auraRenderer`, so createAuraApp never hung the
 * lane Renderer on `app[Symbol.for("a3d.prd01.renderer")]` and the output
 * surface only queued. output-surface.test.ts injects the symbol directly; this
 * test goes through the real controller.
 */

import { describe, expect, it, vi } from "vitest";

const fakeAuraRenderer = { kind: "lane-renderer" };

vi.mock("../../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: vi.fn(async () => ({
    backend: "webgl2",
    diagnostics: {},
    render: () => 1,
    viewProjection: () => new Float32Array(16),
    resize: () => undefined,
    dispose: () => undefined,
    auraRenderer: fakeAuraRenderer
  }))
}));

vi.mock("../../../../packages/engine/src/agent-api/compiler/labels", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createSceneLabelLayer: () => undefined
}));

import { startProductionRender } from "../../../../packages/engine/src/agent-api/app/frameLoop";
import { primitives, scene } from "../../../../packages/engine/src/agent-api";

function fakeCanvas(): HTMLCanvasElement {
  return { width: 64, height: 64, clientWidth: 64, clientHeight: 64, parentElement: null, style: {} } as unknown as HTMLCanvasElement;
}

describe("C-05 seam: controller forwards auraRenderer", () => {
  it("startProductionRender's controller exposes the scene renderer's auraRenderer", async () => {
    const snapshot = scene().add(primitives.box({ name: "seam-box" })).toJSON();
    const diagnostics = { errors: [], warnings: [] } as unknown as Parameters<typeof startProductionRender>[2];
    const controller = await startProductionRender(fakeCanvas(), snapshot, diagnostics, { scene: snapshot, autoStart: false, resize: false });
    try {
      expect(controller.auraRenderer).toBe(fakeAuraRenderer);
    } finally {
      controller.dispose();
    }
  });
});

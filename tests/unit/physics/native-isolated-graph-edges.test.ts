import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import type { AuraAssetRef, AuraModelNode, AuraPhysicsWorldController, AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { colorToClearColor, colorWithAlpha } from "../../../packages/engine/src/agent-api/colorUtils.js";
import { worldLabelsFromSnapshot } from "../../../packages/engine/src/agent-api/compiler/labels.js";
import { resolveNativeBloomRadius } from "../../../packages/engine/src/agent-api/compiler/observations.js";
import { createModelMatrixCache } from "../../../packages/engine/src/agent-api/sceneGraph.js";
import { createModelMatrix, normalizeSceneSnapshot } from "../../../packages/engine/src/agent-api/sceneMath.js";
import { createGameEffects } from "../../../packages/engine/src/agent-api/vfx/gameEffects.js";

function runtimeImports(file: string): string[] {
  const absolute = resolve("packages/engine/src/agent-api", file);
  const source = ts.createSourceFile(absolute, readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly && ts.isStringLiteral(statement.moduleSpecifier)) {
      return [statement.moduleSpecifier.text];
    }
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      return [statement.moduleSpecifier.text];
    }
    return [];
  });
}

describe("provider-neutral scene and effects import edges", () => {
  it("uses leaf modules for matrix and effect helpers without reintroducing the legacy runtime", () => {
    const graph = runtimeImports("sceneGraph.ts");
    const effects = runtimeImports("vfx/gameEffects.ts");
    expect(graph).toContain("./sceneMath.js");
    expect(graph).not.toContain("./index.js");
    expect(effects).toContain("../GameVectorMath.js");
    expect(effects).not.toContain("../GameRuntime.js");
    expect(effects).not.toContain("../GameRuntimeCore.js");
    expect(runtimeImports("compiler/actors.ts")).not.toContain("../nodes/animation.js");
    for (const file of ["sceneMath.ts", "nodes/scene.ts", "nodes/camera.ts", "nodes/model.ts", "colorUtils.ts", "compiler/observations.ts", "compiler/labels.ts"]) {
      expect(runtimeImports(file), file).not.toContain("./GameRuntime.js");
      expect(runtimeImports(file), file).not.toContain("../GameRuntime.js");
      expect(runtimeImports(file), file).not.toContain("./physics.js");
      expect(runtimeImports(file), file).not.toContain("../nodes/physics.js");
    }
  });

  it("keeps the cached and animated model matrices identical to the 4.x implementation", async () => {
    const legacy = await import("../../../packages/engine/src/agent-api/index.js");
    const bounds = { min: [-2, -1, -3], max: [2, 3, 1] } as const;
    const node: AuraPrimitiveNode = { kind: "primitive", primitive: "box", position: [2, 3, -4], rotation: [0.3, -0.6, 1], scale: [2, 0.5, 3], size: [1, 2, 0.5] };
    const cache = createModelMatrixCache();
    const first = cache.modelMatrix(node, bounds, true);
    expect([...first]).toEqual([...legacy.createModelMatrix(node, bounds, true)]);
    expect([...createModelMatrix(node, bounds, true)]).toEqual([...first]);
    expect(cache.modelMatrix(node, bounds, true)).toBe(first);
    expect(cache.hits).toBe(1);

    const animated: AuraPrimitiveNode = { ...node, animation: { clip: "float", speed: 1.5 } };
    for (const time of [0, 0.4, 1.2]) {
      expect([...cache.modelMatrix(animated, bounds, false, time)]).toEqual([...legacy.createModelMatrix(animated, bounds, false, time)]);
    }
    const model: AuraModelNode = {
      kind: "model", asset: {} as AuraAssetRef<"model">, castShadow: true, receiveShadow: true, visible: true,
      position: [-3, 1, 2], rotation: [0.4, 1.2, -0.8], scale: 1.5
    };
    for (const fit of [{ targetHeight: 2 }, { targetLength: 3 }, { targetMaxDimension: 4 }, {}]) {
      for (const normalize of [false, true]) {
        const fitted = { ...model, ...fit };
        expect([...cache.modelMatrix(fitted, bounds, normalize)]).toEqual([...legacy.createModelMatrix(fitted, bounds, normalize)]);
      }
    }
  });

  it("retains the scene builder, physics attachment, camera presets and framing", () => {
    const summary = { kind: "aura-physics-scene-summary" };
    const controller = { snapshot: () => summary } as unknown as AuraPhysicsWorldController;
    const builder = scene().camera(camera.physics()).physics(controller);
    const snapshot = normalizeSceneSnapshot(builder);
    expect(builder.getPhysicsController()).toBe(controller);
    expect(snapshot.physics).toBe(summary);
    expect(snapshot.camera).toMatchObject({ mode: "orbit", target: [0, 0.58, -0.35], distance: 5.8, fov: 43 });
    expect(normalizeSceneSnapshot(snapshot)).toBe(snapshot);
    expect(camera.neon()).toMatchObject({ mode: "flythrough", fov: 54, captureTime: 0.16 });

    const asset = { bounds: [2, 4, 2] } as unknown as AuraAssetRef<"model">;
    expect(camera.frameAsset(asset, { targetHeight: 3, floorY: 0.2 })).toMatchObject({ mode: "orbit", target: [0, 1.04, 0], fov: 36 });
  });

  it("retains model collider, LOD and material variant options without constructing a world", () => {
    const asset = { bounds: [2, 4, 2] } as unknown as AuraAssetRef<"model">;
    const node = model(asset, {
      collider: "bounds", lod: { bias: 1.5, crossFadeSeconds: 0.2 },
      physics: { type: "dynamic", mass: 3 }, variant: "blue"
    }).toJSON();
    expect(node).toMatchObject({
      collider: "bounds", lod: { bias: 1.5, crossFadeSeconds: 0.2 },
      physics: { type: "dynamic", mass: 3 }, variant: "blue"
    });
    expect(model(asset, { collider: "auto" }).toJSON().physics).toEqual({ type: "static" });
    expect(() => model(asset, { collider: "bounds", physics: { shape: "sphere" } })).toThrow(/explicit physics shape/);
  });

  it("keeps attachment offsets, effect lifetimes and bound emitter shutdown", () => {
    const stop = vi.fn();
    const spawn = vi.fn(() => ({ stop }));
    const app = { effects: { spawn, liveCount: 0, clear: vi.fn() } };
    const effects = createGameEffects({ app, reducedFlash: true, autoMount: false });
    let position: readonly [number, number, number] = [1, 2, 3];
    const effect = effects.impactFlash([9, 9, 9], {
      duration: 0.2,
      intensity: 2,
      attachment: { targetId: "hero", offset: [0.5, -0.5, 1], getPosition: () => position }
    });
    expect(effect).toMatchObject({ position: [1.5, 1.5, 4], attachmentId: "hero", intensity: 0.35 });
    expect(spawn).toHaveBeenCalledWith("impact-flash", [1.5, 1.5, 4], expect.objectContaining({ intensity: 2, camera: false }));
    position = [2, 4, 6];
    expect(effects.update(0.1).effects[0]).toMatchObject({ position: [2.5, 3.5, 7], age: 0.1 });
    effects.update(0.11);
    expect(stop).toHaveBeenCalledOnce();
    expect(effects.snapshot().active).toBe(0);
  });

  it("preserves hexadecimal color and alpha conversion", () => {
    expect(colorToClearColor("#336699")).toEqual([0.2, 0.4, 0.6, 1]);
    expect(colorWithAlpha("#336699", 0.25)).toBe("rgba(51,102,153,0.25)");
  });

  it("preserves observation rounding and world label sizing", () => {
    expect([undefined, 0, 0.22, 0.5, 2, 20].map(resolveNativeBloomRadius)).toEqual([3, 1, 2, 4, 2, 4]);
    const snapshot = scene().add({ kind: "label", label: "callout", text: "Object", size: 0.34, position: [1, 2, 3] }).toJSON();
    expect(worldLabelsFromSnapshot(snapshot)).toEqual([expect.objectContaining({ text: "Object", fontSize: 16, anchor: [1, 2, 3] })]);
  });
});

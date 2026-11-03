import "@aura3d/engine";
import { it } from "vitest";
import { compileScene, updateCompiledScene } from "@aura3d/engine/contracts";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { primitives } from "../../../../packages/engine/src/agent-api/nodes/primitives";
import { material } from "../../../../packages/engine/src/agent-api/nodes/material";
import type { MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { writeFileSync } from "node:fs";

const ctx = (): MountSceneCompileContext => ({ renderer: undefined, assets: undefined, quality: { tier: "high" } as MountSceneCompileContext["quality"], strict: false,
  flags: resolveQrFlags({ options: ["compiler"] }), degrade: () => {}, canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
  environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }) as never, collectedLights: [], runtimeWarnings: new Set<string>() });

it("dump", async () => {
  const snap = scene().add(primitives.box({ name: "b", position: [1, 2, 3], castShadow: true, renderOrder: 3, layers: 2, frustumCulled: false, userData: { a: 1 },
    material: material.pbr({ color: "#ff0000", emissive: "#00ff00", emissiveIntensity: 2, opacity: 0.5, clearcoat: 0.3, ior: 1.7 }) })).toJSON();
  const compiled = await compileScene(snap, ctx());
  const source = updateCompiledScene(compiled, snap, undefined as never, 0) as { collectRenderItems?: () => Iterable<unknown>; renderItems?: unknown[] };
  const items = source.collectRenderItems ? [...source.collectRenderItems()] : (source.renderItems ?? []);
  const seen = new WeakSet();
  writeFileSync("/tmp/optcov/items.json", JSON.stringify(items.map((it) => ({ ...(it as object), geometry: undefined })), (k, v) => {
    if (v instanceof Float32Array) return Array.from(v);
    if (typeof v === "object" && v !== null) { if (seen.has(v)) return "[circ]"; seen.add(v); }
    return v;
  }, 1));
  compiled.dispose();
});

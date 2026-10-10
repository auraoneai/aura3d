// tests/qr/prd15/unit/compiler-contributions.test.ts
// C36-DROP + T0-19 + TIER + T4.2 (PRD-16 lane-15 compiler rows).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import "@aura3d/engine";
import { compileScene, updateCompiledScene, registerNodeHandler } from "../../../../packages/engine/src/contracts/compiler";
import type { MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { resolveMountQuality } from "../../../../packages/engine/src/agent-api/compiler/renderer";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { primitive } from "../../../../packages/engine/src/agent-api/nodes/primitives";
import type { AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/nodes/types";
import type { CollectedLight } from "@aura3d/rendering";
import type { RenderItem } from "@aura3d/rendering/contracts";

const mountCtx = (flags: ReturnType<typeof resolveQrFlags>, extra: Partial<MountSceneCompileContext> = {}): MountSceneCompileContext =>
  ({
    renderer: {} as never,
    assets: undefined,
    quality: { tier: "high" } as MountSceneCompileContext["quality"],
    strict: flags.on("A3D_QR_STRICT"),
    flags,
    degrade: () => undefined,
    canvas: { width: 800, height: 600 } as never,
    environmentLighting: () => undefined,
    collectedLights: [] as readonly CollectedLight[],
    runtimeWarnings: new Set<string>(),
    ...extra
  }) as unknown as MountSceneCompileContext;

const litScene = (): AuraSceneSnapshot =>
  scene().add(primitive("box", { name: "box-1", position: [0, 0.5, 0], size: 1 })).toJSON() as AuraSceneSnapshot;

describe("C36-DROP compile-time contributions", () => {
  it("a handler's compile-time addItems/addLights/set reaches compiled.source", async () => {
    const item = { label: "c36-drop:item", draw: () => undefined } as unknown as RenderItem;
    const light = { kind: "point", position: [0, 0, 0] } as unknown as CollectedLight;
    const unregister = registerNodeHandler({
      kind: "primitive",
      owner: "prd02",
      flag: "A3D_QR_LIGHTING",
      compile(_node, _ctx, out) {
        out.addItems([item]);
        out.addLights([light]);
        out.set("handlerMarker", "present" as never);
      }
    });
    try {
      const flags = resolveQrFlags({ options: ["compiler", "lighting"] });
      const compiled = await compileScene(litScene(), mountCtx(flags));
      const source = compiled.source as { collectRenderItems?: () => Iterable<RenderItem>; collectedLights?: CollectedLight[]; handlerMarker?: unknown };
      expect(source).toBeTruthy();
      const items = [...(source.collectRenderItems?.() ?? [])];
      expect(items).toContain(item);
      expect(source.collectedLights ?? []).toContain(light);
      expect(source.handlerMarker).toBe("present");
      // And again on a later frame — persistent, not a one-frame merge.
      const source2 = updateCompiledScene(compiled, litScene(), undefined as never, 2) as typeof source;
      expect([...(source2.collectRenderItems?.() ?? [])]).toContain(item);
      compiled.dispose();
    } finally {
      unregister();
    }
  });
});

describe("TIER resolved governor tier", () => {
  it("rendererOptions.quality.tier reaches the compile ctx quality surface", () => {
    expect(resolveMountQuality({ quality: { tier: "low" } } as never).tier).toBe("low");
    expect(resolveMountQuality({ quality: { tier: "auto" } } as never).tier).toBe("high");
    expect(resolveMountQuality(undefined).tier).toBe("high");
    expect(resolveMountQuality({ quality: { tier: "bogus" } } as never).tier).toBe("high");
    // The full tier settings travel with it (not just the name).
    const low = resolveMountQuality({ quality: { tier: "low" } } as never) as { tier: string; maxTextureSize: number };
    expect(low.maxTextureSize).toBe(1024);
  });
});

describe("T0-19 item-reuse keying (structure)", () => {
  const src = readFileSync("packages/engine/src/agent-api/compiler/compileScene.ts", "utf8");
  it("cache key is `${runtimeId}:${itemIndex}`", () => {
    expect(src).toContain("`${runtimeId}:${index}`");
  });
  it("volatile nodes (animation/skin/morph/clips/skeleton) skip reuse", () => {
    expect(src).toContain("isVolatile");
    expect(src).toMatch(/if \(!handle \|\| \(node && isVolatile\(node\)\)\) return item;/);
  });
});

describe("T4.2 mount-failure disposal (structure)", () => {
  const src = readFileSync("packages/engine/src/agent-api/compiler/renderer.ts", "utf8");
  it("post-create body is wrapped; catch disposes renderer + HDRI env then rethrows", () => {
    expect(src).toContain("} catch (mountError) {");
    expect(src).toContain("disposeEnv?.()");
    expect(src).toContain("productionRenderer.dispose();");
    expect(src).toContain("throw mountError;");
  });
});

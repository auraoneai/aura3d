import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { GamePlatformerSceneBinding } from "../../../packages/engine/src/agent-api/GameSceneGeometryBindings.js";

function emittedImports(source: string, fileName: string): string[] {
  const javascript = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      verbatimModuleSyntax: true
    }
  }).outputText;
  const parsed = ts.createSourceFile(fileName.replace(/\.ts$/u, ".js"), javascript, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return parsed.statements.flatMap((statement) => {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) return [statement.moduleSpecifier.text];
    return [];
  });
}

describe("solver-independent game helpers", () => {
  it("checks emitted imports, including unused values retained by verbatimModuleSyntax", () => {
    expect(emittedImports('import type { T } from "erased"; import { unused } from "retained";', "fixture.ts"))
      .toEqual(["retained"]);

    const cases: readonly [string, readonly string[]][] = [
      ["packages/engine/src/agent-api/GameGenreKits.ts", ["./GameRuntime.js"]],
      ["packages/engine/src/agent-api/GameSceneGeometryMath.ts", ["./GameRuntime.js"]],
      ["packages/engine/src/agent-api/game-kits/fighting.ts", ["../GameRuntime.js"]],
      ["packages/engine/src/agent-api/nodes/prefabs/gamePresentation.ts", ["../../GameRuntime.js"]],
      ["packages/engine/src/agent-api/nodes/prefabs/index.ts", [
        "../animation.js", "../games.js", "../physics.js", "../particles.js", "../water.js", "../../GameRuntime.js",
        "../../particle-fountain-runtime.js", "../../product-viewer-runtime.js"
      ]]
    ];
    for (const [fileName, forbidden] of cases) {
      const imports = emittedImports(readFileSync(fileName, "utf8"), fileName)
        .map((specifier) => specifier.replace(/\.js$/u, ""));
      for (const specifier of forbidden) {
        expect(imports, `${fileName}: ${specifier}`).not.toContain(specifier.replace(/\.js$/u, ""));
      }
    }
  });

  it("run game kits and author physics descriptors without loading a physics world", async () => {
    const worldLoaded = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      worldLoaded();
      throw new Error("unexpected physics world import");
    });

    try {
      const genre = await import("../../../packages/engine/src/agent-api/GameGenreKits.js");
      const fighting = await import("../../../packages/engine/src/agent-api/game-kits/fighting.js");
      const { prefabs } = await import("../../../packages/engine/src/agent-api/nodes/prefabs/index.js");
      const presentation = await import("../../../packages/engine/src/agent-api/nodes/prefabs/gamePresentation.js");

      const platformer = genre.createGamePlatformerKit();
      const platformerStart = platformer.snapshot();
      const platformerMoved = platformer.step(1 / 30, { moveX: 1 });
      expect(platformerMoved.player.x).toBeGreaterThan(platformerStart.player.x);

      const racing = genre.createGameRacingKit({
        route: { points: [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 20, y: 20 }], width: 10 }
      });
      expect(racing.step(1 / 30, { throttle: true }).speed).toBeGreaterThan(0);

      const fighter = fighting.createFightingGameKit({ autoListen: false, opponentAi: false });
      const fighterStart = fighter.snapshot();
      fighter.input.press("KeyD");
      const fighterMoved = fighter.update(1 / 30);
      expect(fighterMoved.player.position[0]).toBeGreaterThan(fighterStart.player.position[0]);
      expect(fighterMoved.states.player).toBe("walk");

      const golf = prefabs.miniGolfHole({ ballPosition: [0, 0.16, 0], aimVector: [3, 0, 4] });
      const ball = golf.find((node) => node.kind === "primitive" && node.name === "white physics golf ball");
      const cup = golf.find((node) => node.kind === "primitive" && node.name === "cup capture ring");
      const aim = golf.find((node) => node.kind === "primitive" && node.name === "cyan aim direction line");
      expect(ball).toMatchObject({ physics: { type: "dynamic", shape: "sphere", radius: 0.16, mass: 0.045 } });
      expect(cup).toMatchObject({ physics: { type: "static", shape: "sphere", sensor: true } });
      if (aim?.kind !== "primitive" || !aim.position) throw new Error("missing mini-golf aim line");
      expect(aim.position[0]).toBeCloseTo(0.324);
      expect(aim.position[2]).toBeCloseTo(0.432);

      const surface = { id: "ground", x: 0, y: 0, width: 4, height: 0.5 };
      const surfaceToSceneRect = vi.fn(() => ({ center: [1, 2, 3], size: [4, 0.5, 0.04] }) as const);
      const ground = presentation.createGamePlatformerGroundMeshNodes({
        sceneBinding: { surfaceToSceneRect } as unknown as GamePlatformerSceneBinding,
        surface
      });
      expect(surfaceToSceneRect).toHaveBeenCalledWith(surface);
      expect(ground).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "scene-bound platformer ground mesh ground", position: [1, 2, 3], scale: [4, 0.5, 0.64] })
      ]));
      expect(worldLoaded).not.toHaveBeenCalled();

      // Prove the mock intercepts the legacy edge rather than passing because
      // the test's world specifier did not resolve to the actual dependency.
      await expect(import("../../../packages/engine/src/agent-api/GameRuntime.js"))
        .rejects.toThrow();
      expect(worldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);
});

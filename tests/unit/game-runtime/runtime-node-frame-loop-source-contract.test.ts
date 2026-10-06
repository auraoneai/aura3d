import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuraApp, defineAuraAssets, game, lights, model, scene } from "../../../packages/engine/src";

type RootPackageJson = {
  readonly name?: string;
  readonly type?: string;
  readonly sideEffects?: boolean;
  readonly exports?: {
    readonly "."?: {
      readonly types?: string;
      readonly browser?: string;
      readonly import?: string;
      readonly default?: string;
    };
  };
};

const assets = defineAuraAssets({
  fighter: {
    type: "model",
    format: "glb",
    url: "/aura-assets/fighter.12345678.glb",
    bounds: [1, 2, 1],
    hash: "sha256-fighter"
  }
} as const);

describe("game runtime frame-loop and package source contracts", () => {
  it("keeps the @aura3d/engine public root import mapped to browser-safe tree-shakable source", () => {
    const rootPackage = readJson<RootPackageJson>("package.json");
    const publicRoot = rootPackage.exports?.["."];
    const agentApi = readSourceDir("packages/engine/src/agent-api");
    const frameLoop = readSource("packages/engine/src/agent-api/FrameLoop.ts");
    const appHandle = readSource("packages/engine/src/agent-api/AuraAppHandle.ts");
    const runtimeNodeHandle = readSource("packages/engine/src/agent-api/RuntimeNodeHandle.ts");
    const gameRuntime = readSource("packages/engine/src/agent-api/GameRuntime.ts");
    const publicRootImport = 'import { createAuraApp, game, model, scene } from "@aura3d/engine";';
    const publicApiSource = { createAuraApp, game, model, scene };

    expect(publicRootImport).toContain("@aura3d/engine");
    expect(Object.keys(publicApiSource).sort()).toEqual(["createAuraApp", "game", "model", "scene"]);
    expect(rootPackage).toMatchObject({
      name: "@aura3d/engine",
      type: "module",
      sideEffects: false
    });
    // PRD-15 §6.1: "." resolves to the explicit public surface entry.
    expect(publicRoot).toMatchObject({
      types: "./dist/engine/public/index.d.ts",
      browser: "./dist/engine/public/index.js",
      import: "./dist/engine/public/index.js",
      default: "./dist/engine/public/index.js"
    });
    expect(agentApi).toContain("export function createAuraApp");
    expect(agentApi).toContain("export const game = lazyNamespace(() => ({");
    expect(agentApi).toContain("runtimeNode: createRuntimeNodeSpec");
    expect(agentApi).toContain("export function model");
    expect(agentApi).toContain("export function scene");
    expect(frameLoop).toContain('typeof globalThis.requestAnimationFrame === "undefined"');
    expect(frameLoop).toContain('typeof globalThis.cancelAnimationFrame === "undefined"');
    expect(frameLoop).toContain('typeof performance === "undefined"');
    expect([agentApi, frameLoop, appHandle, runtimeNodeHandle, gameRuntime].join("\n")).not.toMatch(/\bfrom\s+["']node:|require\(["']node:/);
    expect(agentApi).not.toMatch(/\bfrom\s+["']three["']|three\/examples|new GLTFLoader/);
  });

  it("covers pause, resume, deterministic step, offFrame, returned unsubscribe, and self-unsubscribe", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene()
        .add(
          model(assets.fighter, { name: "pause resume fighter" })
            .position(0, 1, 0)
            .runtime(game.runtimeNode("player", { tags: ["fighter", "frame-loop"] }))
        )
        .add(lights.studio())
    });
    const player = app.nodes.require("player");
    const frames: string[] = [];
    const moveUnsubscribe = app.onFrame(({ frame, paused, source }) => {
      frames.push(`move:${frame}:${paused}:${source}`);
      player.translate(1, 0, 0);
    });
    const offFrameCallback = (): void => {
      frames.push("offFrame-called");
    };
    app.onFrame(offFrameCallback);
    app.offFrame(offFrameCallback);

    let selfUnsubscribe = (): void => undefined;
    selfUnsubscribe = app.onFrame(({ frame }) => {
      frames.push(`once:${frame}`);
      selfUnsubscribe();
    });

    expect(app.runtime.paused).toBe(true);
    app.step(1 / 60);
    app.resume();
    expect(app.runtime.paused).toBe(false);
    app.step(1 / 60);
    app.pause();
    expect(app.runtime.paused).toBe(true);
    app.step(1 / 60);
    moveUnsubscribe();
    app.step(1 / 60);

    expect(frames).toEqual([
      "move:1:true:manual",
      "once:1",
      "move:2:false:manual",
      "move:3:true:manual"
    ]);
    expect(app.runtime.frame).toBe(4);
    expect(player.position).toEqual([3, 1, 0]);

    app.dispose();
  });

  it("keeps 100 runtime transform updates per frame on one typed GLB runtime handle", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene()
        .add(
          model(assets.fighter, { name: "single loaded fighter asset" })
            .position(0, 1, 0)
            .runtime(game.runtimeNode("player", { tags: ["fighter", "typed-glb", "stress-transform"] }))
        )
        .add(lights.studio())
    });
    const player = app.nodes.require("player");
    const initialNode = app.nodes.get("player");
    const initialIds = app.nodes.ids();
    let updateCount = 0;

    app.onFrame(() => {
      for (let index = 0; index < 100; index += 1) {
        player
          .setPosition(index / 100, 1, 0)
          .setRotation(0, index / 100, 0)
          .setScale(1 + index / 1000);
        updateCount += 1;
      }
    });
    app.step(1 / 60);

    const snapshot = player.snapshot() as {
      readonly kind: string;
      readonly position: readonly number[];
      readonly rotation: readonly number[];
      readonly scale: number;
    };
    const harnessSource = readSource("tests/unit/game-runtime/runtime-node-frame-loop-source-contract.test.ts");

    expect(updateCount).toBe(100);
    expect(app.nodes.get("player")).toBe(initialNode);
    expect(app.nodes.ids()).toEqual(initialIds);
    expect(snapshot.kind).toBe("model");
    expect(snapshot.position).toEqual([0.99, 1, 0]);
    expect(snapshot.rotation[1]).toBeCloseTo(0.99);
    expect(snapshot.scale).toBeCloseTo(1.099);
    expect(harnessSource.match(/model\(assets\.fighter/g)?.length).toBe(2);
    expect(harnessSource).toContain("for (let index = 0; index < 100; index += 1)");
    expect(harnessSource).not.toContain("app." + "setScene(");

    app.dispose();
  });

  it("keeps browser source scaffolding for visible runtime-node movement and WebGL2/WebGPU parity", () => {
    const browserSpec = readSource("tests/browser/game-runtime-visible-node-movement.spec.ts");

    expectIncludesAll(browserSpec, [
      'const requestedBackends = ["webgl2", "webgpu"] as const;',
      "contractNode.setPosition(1, 0.5, 0)",
      "contractNode.setVisible(false).setVisible(true)",
      "app.step(1 / 60)",
    'status: requestedBackend === "webgpu" ? "skipped" : "failed",',
      "[data-testid='runtime-node-marker']",
      "[data-testid='runtime-node-canvas']"
    ]);
    expect(browserSpec).not.toMatch(/\bfrom\s+["']three["']|GLTFLoader|three\/examples/);
  });
});

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}
function readSourceDir(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? readSourceDir(join(dir, e.name)) : e.name.endsWith(".ts") ? [readSource(join(dir, e.name))] : []))
    .join("\n");
}

function readJson<T>(file: string): T {
  return JSON.parse(readSource(file)) as T;
}

function expectIncludesAll(source: string, tokens: readonly string[]): void {
  for (const token of tokens) expect(source).toContain(token);
}

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationMixer, AnimationTrack } from "@galileo3d/animation";
import { AssetManager, type AssetLoader } from "@galileo3d/assets";
import { AudioSystem } from "@galileo3d/audio";
import { Engine, SystemPhase } from "@galileo3d/core";
import { EditorRuntime as PublicEditorRuntime } from "@galileo3d/editor";
import { EditorRuntime } from "@galileo3d/editor-runtime";
import { World, TransformComponent } from "@galileo3d/ecs";
import { ActionMap, InputSnapshot } from "@galileo3d/input";
import { PhysicsWorld, Shape } from "@galileo3d/physics";
import { Geometry, Renderer } from "@galileo3d/rendering";
import { Scene } from "@galileo3d/scene";
import { BehaviorHost, BehaviorSystem } from "@galileo3d/scripting";

describe("public package API contracts", () => {
  const publicPackages = [
    "animation",
    "assets",
    "audio",
    "core",
    "debug",
    "ecs",
    "editor",
    "editor-runtime",
    "input",
    "math",
    "physics",
    "rendering",
    "scene",
    "scripting"
  ];

  it("documents every public package root API and keeps exports on the root barrel", () => {
    for (const packageName of publicPackages) {
      const packageDir = `packages/${packageName}`;
      const readmePath = `${packageDir}/README.md`;
      const manifest = JSON.parse(readFileSync(`${packageDir}/package.json`, "utf8")) as { exports?: Record<string, unknown>; name?: string };
      const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
      const index = readFileSync(`${packageDir}/src/index.ts`, "utf8");

      expect(readmePath, `${packageName} README exists`).toSatisfy(existsSync);
      expect(readme).toContain(`# @galileo3d/${packageName}`);
      expect(readme).toContain("## Public API");
      expect(readme).toContain("## Verification");
      expect(manifest.exports).toHaveProperty(".");
      expect(index).toMatch(/export (?:\*|\{|type)/);
    }
  });

  it("keeps examples on public package barrels instead of package internals", () => {
    const allowedPublicSpecifiers = new Set(publicPackages.map((packageName) => `@galileo3d/${packageName}`));
    const exampleSources = collectSourceFiles("examples");

    expect(exampleSources.length).toBeGreaterThan(0);
    for (const file of exampleSources) {
      const source = readFileSync(file, "utf8");
      const imports = [...source.matchAll(/\b(?:import|export)(?:\s+type)?[\s\S]*?\sfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)]
        .map((match) => match[1] ?? match[2] ?? "")
        .filter(Boolean);

      for (const specifier of imports) {
        if (specifier.startsWith("@galileo3d/")) {
          expect(allowedPublicSpecifiers.has(specifier), `${file} imports ${specifier}`).toBe(true);
          continue;
        }
        expect(specifier.startsWith("../shared/") || specifier.startsWith("./"), `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  it("supports engine lifecycle, scheduler phases, and disposal from the public API", async () => {
    const engine = new Engine({ fixedDelta: 1 / 60 });
    const phases: string[] = [];
    engine.scheduler.add({ id: "fixed-public-api", phase: SystemPhase.Fixed, run: () => { phases.push("fixed"); } });
    engine.scheduler.add({ id: "render-public-api", phase: SystemPhase.Render, run: () => { phases.push("render"); } });

    await engine.init();
    const frame = await engine.step(1 / 60);
    await engine.dispose();

    expect(frame.fixedSteps).toBe(1);
    expect(phases).toEqual(["fixed", "render"]);
    expect(engine.state).toBe("disposed");
  });

  it("supports the renderer facade lifecycle promised by the renderer PRD", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    renderer.resize(16, 16);
    const diagnostics = renderer.render([{ geometry: Geometry.triangle(), label: "public-api-triangle" }]);
    expect(diagnostics.drawCalls).toBe(1);
    renderer.dispose();
  });

  it("supports scene graph construction and world transform updates from the public API", () => {
    const scene = new Scene();
    const node = scene.createNode("cube");
    node.transform.setPosition(0, 1, 0);
    scene.root.addChild(node);
    scene.updateWorldTransforms();

    expect(scene.findByName("cube")).toEqual([node]);
    expect(node.transform.worldMatrix[13]).toBe(1);
  });

  it("supports ECS entity/component/system update ownership from the public API", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, TransformComponent, new TransformComponent([1, 2, 3]));
    world.update({ deltaTime: 1 / 60, elapsedTime: 1 / 60, frame: 1 });

    expect(world.get(entity, TransformComponent)?.position).toEqual([1, 2, 3]);
    expect(world.query({ include: [TransformComponent] }).toArray()).toEqual([entity]);
  });

  it("supports physics world body/collider creation and deterministic stepping from the public API", () => {
    const physics = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
    const body = physics.createRigidBody({ type: "dynamic", position: [0, 1, 0] });
    physics.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
    physics.step(1 / 60);

    expect(physics.snapshot().stats).toMatchObject({ steps: 1, bodies: 1, colliders: 1 });
    expect(body.position[1]).toBeLessThan(1);
  });

  it("supports animation mixer play/update value sampling from the public API", () => {
    const values = new Map<string, unknown>();
    const mixer = new AnimationMixer({ setAnimationValue: (target, value) => values.set(target, value) });
    const clip = new AnimationClip({
      name: "move",
      tracks: [
        new AnimationTrack({
          target: "cube.position",
          valueType: "vector3",
          keyframes: [
            { time: 0, value: [0, 0, 0] },
            { time: 1, value: [0, 1, 0] }
          ]
        })
      ]
    });

    mixer.play(clip);
    mixer.update(0.5);

    expect(values.get("cube.position")).toEqual([0, 0.5, 0]);
  });

  it("supports asset manager registration, loading, cache retention, and release from the public API", async () => {
    let disposed = 0;
    const loader: AssetLoader<{ readonly value: string }> = {
      type: "text",
      canLoad: (request) => request.type === "text",
      load: async (request) => ({ value: request.url }),
      dispose: () => {
        disposed += 1;
      }
    };
    const assets = new AssetManager({ baseUrl: "https://assets.example/" });
    assets.register(loader);

    const first = await assets.load<{ readonly value: string }>("asset.txt", { type: "text" });
    const second = await assets.load<{ readonly value: string }>("asset.txt", { type: "text" });
    expect(first.id).toBe(second.id);
    expect(second.value.value).toBe("https://assets.example/asset.txt");

    await assets.release(first);
    await assets.release(second);

    expect(disposed).toBe(1);
  });

  it("supports action maps and input snapshots from the public API", () => {
    const snapshot = new InputSnapshot({
      keys: new Set(["KeyW", "Space"]),
      previousKeys: new Set(["Space"])
    });
    const actions = new ActionMap();
    actions.bind("jump", [{ type: "keyboard", code: "Space" }]);
    actions.bindAxis("moveZ", [{ type: "keyboard-axis", negative: "KeyS", positive: "KeyW" }]);
    actions.useSnapshot(snapshot);

    expect(actions.down("jump")).toBe(true);
    expect(actions.pressed("jump")).toBe(false);
    expect(actions.axis("moveZ")).toBe(1);
  });

  it("supports audio system lifecycle state without constructing a browser context", async () => {
    const audio = new AudioSystem();
    expect(audio.contextManager.state).toBe("locked");
    await audio.dispose();
    expect(audio.contextManager.state).toBe("locked");
  });

  it("supports behavior system lifecycle phases from the public scripting API", async () => {
    const calls: string[] = [];
    const host = new BehaviorHost({ target: { id: "public-script-target" } });
    host.attach({
      onStart: () => {
        calls.push("start");
      },
      onFixedUpdate: () => {
        calls.push("fixed");
      },
      onUpdate: () => {
        calls.push("update");
      }
    });
    const scripting = new BehaviorSystem();
    scripting.registerHost(host);

    await scripting.fixedUpdate({ fixedDeltaSeconds: 1 / 60 });
    await scripting.update({ deltaSeconds: 1 / 60 });

    expect(calls).toEqual(["fixed", "start", "update"]);
    expect(scripting.errors).toEqual([]);
  });

  it("supports editor runtime mode, selection, history, and disposal from the public API", () => {
    const editor = new EditorRuntime();
    editor.selection.set(["cube"]);
    editor.setMode("play");
    editor.dispose();

    expect(editor.mode).toBe("play");
    expect(editor.selection.current()).toEqual([]);
    expect(() => editor.setMode("edit")).toThrow(/disposed/);
  });

  it("supports the canonical editor package as the public editor runtime surface", () => {
    const editor = new PublicEditorRuntime();
    editor.selection.set(["editor-package-node"]);
    editor.registerMaterialVariants("hero.gltf", ["clean", "damaged"], "clean");
    editor.setMaterialVariant("hero.gltf", "damaged");

    expect(editor.mode).toBe("edit");
    expect(editor.selection.current()).toEqual(["editor-package-node"]);
    expect(editor.materialVariants.renderOptions("hero.gltf")).toEqual({ materialVariant: "damaged" });
  });
});

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    const stats = statSync(path);
    if (stats.isDirectory()) {
      collectSourceFiles(path, out);
    } else if (path.endsWith(".ts") || path.endsWith(".js")) {
      out.push(path);
    }
  }
  return out.sort();
}

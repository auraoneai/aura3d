import { PhysicsWorld } from "@aura3d/physics/world";
import { createGameInput, type GameInputController, type GameInputOptions } from "./GameRuntime.js";
import { createPhysicsRuntime, type AuraPhysicsRuntime } from "./PhysicsRuntime.js";
import {
  createAuraApp as createLeanApp,
  type AuraLeanApp,
  type AuraLeanAppTarget,
  type AuraLeanCreateAppOptions,
  type AuraLeanPrimitiveSpec,
  type AuraLeanSceneSnapshot,
  type AuraLeanVec3
} from "./lean.js";

export * from "./lean.js";

export interface AuraLeanGameCreateAppOptions extends AuraLeanCreateAppOptions {
  readonly physics?: { readonly gravity?: AuraLeanVec3 };
}

export interface AuraLeanGameApp extends AuraLeanApp {
  readonly physics: AuraPhysicsRuntime;
  input(options: GameInputOptions): GameInputController;
}

export function createAuraApp(canvas: AuraLeanAppTarget, options: AuraLeanGameCreateAppOptions): AuraLeanGameApp {
  const snapshot: AuraLeanSceneSnapshot = "toJSON" in options.scene ? options.scene.toJSON() : options.scene;
  const world = new PhysicsWorld({ gravity: [...(options.physics?.gravity ?? [0, -9.81, 0])] });
  const physics = createPhysicsRuntime(world);
  const bodies = new Map<AuraLeanPrimitiveSpec, ReturnType<AuraPhysicsRuntime["createBody"]>>();
  for (const node of snapshot.nodes) {
    if (node.kind !== "primitive" || !node.physics) continue;
    bodies.set(node, physics.createBody({
      name: node.name,
      type: node.physics.type ?? "dynamic",
      shape: node.primitive === "sphere" ? "sphere" : "box",
      position: node.position,
      halfExtents: [Math.abs(node.scale[0]) * 0.5, Math.abs(node.scale[1]) * 0.5, Math.abs(node.scale[2]) * 0.5],
      radius: Math.max(Math.abs(node.scale[0]), Math.abs(node.scale[1]), Math.abs(node.scale[2])) * 0.5,
      mass: node.physics.mass
    }));
  }

  const base = createLeanApp(canvas, { ...options, scene: snapshot });
  const inputs = new Set<GameInputController>();
  const frameCallbacks = new Set<(deltaSeconds: number) => void>();
  const stopSimulation = base.onFrame((deltaSeconds) => {
    for (const input of inputs) input.update(deltaSeconds);
    for (const callback of frameCallbacks) callback(deltaSeconds);
    physics.step(deltaSeconds);
    for (const [node, body] of bodies) {
      (node as { position: AuraLeanVec3 }).position = body.position();
    }
  });

  return {
    ready: base.ready,
    diagnostics: base.diagnostics,
    physics,
    input(inputOptions) {
      const input = createGameInput(inputOptions);
      inputs.add(input);
      return input;
    },
    onFrame(callback) {
      frameCallbacks.add(callback);
      return () => frameCallbacks.delete(callback);
    },
    dispose() {
      stopSimulation();
      for (const input of inputs) input.dispose();
      inputs.clear();
      frameCallbacks.clear();
      base.dispose();
    }
  };
}

/** Namespace retained for source-compatible feature discovery without importing the broad game kit barrel. */
export const game = { runtime: "lean-production-physics" } as const;

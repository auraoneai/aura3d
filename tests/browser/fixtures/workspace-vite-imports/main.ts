import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { AssetManager, GLTFLoader, createGLTFRenderResources } from "@aura3d/assets";
import { AudioClip } from "@aura3d/audio";
import { Engine } from "@aura3d/core";
import { DebugOverlay } from "@aura3d/debug";
import { EntityManager } from "@aura3d/ecs";
import { EditorRuntime } from "@aura3d/editor-runtime";
import { InputSystem } from "@aura3d/input";
import { Matrix4 } from "@aura3d/math";
import { PhysicsWorld } from "@aura3d/physics";
import { Geometry, PBRMaterial, Renderer, createExternalParityEnvironmentLighting } from "@aura3d/rendering";
import { Scene } from "@aura3d/scene";
import { BehaviorSystem } from "@aura3d/scripting";

declare global {
  interface Window {
    __AURA3D_WORKSPACE_VITE_IMPORT_SMOKE__?: {
      readonly ok: boolean;
      readonly imports: readonly string[];
      readonly cubeVertices: number;
      readonly material: string;
      readonly environmentPreset: string;
    };
  }
}

const cube = Geometry.litCube(1);
const material = new PBRMaterial({ name: "workspace-vite-pbr", baseColor: [0.7, 0.3, 0.2, 1] });
const lighting = createExternalParityEnvironmentLighting("studio");

window.__AURA3D_WORKSPACE_VITE_IMPORT_SMOKE__ = {
  ok: true,
  imports: [
    typeof AnimationClip,
    typeof AnimationTrack,
    typeof AssetManager,
    typeof GLTFLoader,
    typeof createGLTFRenderResources,
    typeof AudioClip,
    typeof Engine,
    typeof DebugOverlay,
    typeof EntityManager,
    typeof EditorRuntime,
    typeof InputSystem,
    typeof Matrix4,
    typeof PhysicsWorld,
    typeof Renderer,
    typeof Scene,
    typeof BehaviorSystem
  ],
  cubeVertices: cube.vertexBuffer.vertexCount,
  material: material.name,
  environmentPreset: lighting.preset
};

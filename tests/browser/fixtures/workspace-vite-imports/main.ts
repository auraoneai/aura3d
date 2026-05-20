import { AnimationClip, AnimationTrack } from "@galileo3d/animation";
import { AssetManager, GLTFLoader, createGLTFRenderResources } from "@galileo3d/assets";
import { AudioClip } from "@galileo3d/audio";
import { Engine } from "@galileo3d/core";
import { DebugOverlay } from "@galileo3d/debug";
import { EntityManager } from "@galileo3d/ecs";
import { EditorRuntime } from "@galileo3d/editor-runtime";
import { InputSystem } from "@galileo3d/input";
import { Matrix4 } from "@galileo3d/math";
import { PhysicsWorld } from "@galileo3d/physics";
import { Geometry, PBRMaterial, Renderer, createV4EnvironmentLighting } from "@galileo3d/rendering";
import { Scene } from "@galileo3d/scene";
import { BehaviorSystem } from "@galileo3d/scripting";

declare global {
  interface Window {
    __GALILEO3D_WORKSPACE_VITE_IMPORT_SMOKE__?: {
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
const lighting = createV4EnvironmentLighting("studio");

window.__GALILEO3D_WORKSPACE_VITE_IMPORT_SMOKE__ = {
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

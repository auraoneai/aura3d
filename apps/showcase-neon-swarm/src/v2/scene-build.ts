// Scene builder — extracted from boot.ts for 14-LOC.
import { scene } from "@aura3d/engine";
import { fallbackCameraNode } from "./scene/camera";
import { lightingNodes } from "./scene/lighting";
import type { createSwarmWorld } from "./nodes";

export function buildSwarmScene(world: ReturnType<typeof createSwarmWorld>) {
  return scene()
    .background("#070a14")
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

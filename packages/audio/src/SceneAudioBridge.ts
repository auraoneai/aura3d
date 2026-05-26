import type { Scene, SceneNode } from "@aura3d/scene";
import type { AudioListener } from "./AudioListener";
import type { SpatialAudio } from "./SpatialAudio";

export interface SceneAudioSourceBinding {
  readonly node: SceneNode;
  readonly spatial: SpatialAudio;
}

export class SceneAudioBridge {
  private listenerBinding?: { readonly node: SceneNode; readonly listener: AudioListener };
  private readonly sources = new Set<SceneAudioSourceBinding>();

  constructor(private readonly scene?: Scene) {}

  bindListener(node: SceneNode, listener: AudioListener): void {
    this.listenerBinding = { node, listener };
  }

  unbindListener(): void {
    this.listenerBinding = undefined;
  }

  bindSource(node: SceneNode, spatial: SpatialAudio): SceneAudioSourceBinding {
    const binding = { node, spatial };
    this.sources.add(binding);
    return binding;
  }

  unbindSource(binding: SceneAudioSourceBinding): void {
    this.sources.delete(binding);
  }

  update(): void {
    this.scene?.updateWorldTransforms();
    if (this.listenerBinding) {
      this.listenerBinding.listener.setTransform(worldPosition(this.listenerBinding.node));
    }
    for (const binding of this.sources) {
      binding.spatial.setPosition(worldPosition(binding.node));
    }
  }
}

function worldPosition(node: SceneNode): { readonly x: number; readonly y: number; readonly z: number } {
  node.updateWorldTransform();
  const matrix = node.transform.worldMatrix as readonly number[];
  return { x: matrix[12], y: matrix[13], z: matrix[14] };
}

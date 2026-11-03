import type { Scene, SceneNode } from "@aura3d/scene";
import type { AudioListener, Vec3Like } from "./AudioListener";
import type { SpatialAudio } from "./SpatialAudio";

export interface SceneAudioSourceBinding {
  readonly node: SceneNode;
  readonly spatial: SpatialAudio;
}

/**
 * Copies scene poses into the Web Audio graph. Listener axes are local -Z/+Y;
 * an emitter's authored cone axis is local to its bound node (by default +X).
 * Scale and reflection affect the transformed axes, while normalization and
 * orthogonalization remove scale/shear from the listener's orientation.
 * Bindings are borrowed: unbinding/disposal never disposes a node or audio object.
 */
export class SceneAudioBridge {
  private listenerBinding?: { readonly node: SceneNode; readonly listener: AudioListener };
  private readonly sources = new Set<SceneAudioSourceBinding>();
  private readonly localOrientations = new Map<SceneAudioSourceBinding, Vec3Like>();
  private disposed = false;

  constructor(private readonly scene?: Scene) {}

  bindListener(node: SceneNode, listener: AudioListener): void {
    this.assertAlive();
    this.listenerBinding = { node, listener };
  }

  unbindListener(): void {
    this.listenerBinding = undefined;
  }

  bindSource(node: SceneNode, spatial: SpatialAudio, options: { readonly localOrientation?: Vec3Like } = {}): SceneAudioSourceBinding {
    this.assertAlive();
    const binding = { node, spatial };
    this.sources.add(binding);
    this.localOrientations.set(binding, { ...(options.localOrientation ?? spatial.orientation ?? { x: 1, y: 0, z: 0 }) });
    return binding;
  }

  unbindSource(binding: SceneAudioSourceBinding): void {
    this.sources.delete(binding);
    this.localOrientations.delete(binding);
  }

  update(): void {
    if (this.disposed) return;
    this.scene?.updateWorldTransforms();
    if (this.listenerBinding) {
      const matrix = worldMatrix(this.listenerBinding.node);
      const forward = normalize({ x: -matrix[8], y: -matrix[9], z: -matrix[10] }, { x: 0, y: 0, z: -1 });
      const worldUp = { x: matrix[4], y: matrix[5], z: matrix[6] };
      const projection = dot(worldUp, forward);
      const up = normalize({
        x: worldUp.x - projection * forward.x,
        y: worldUp.y - projection * forward.y,
        z: worldUp.z - projection * forward.z
      }, perpendicular(forward));
      this.listenerBinding.listener.setTransform(position(matrix), forward, up);
    }
    for (const binding of this.sources) {
      const matrix = worldMatrix(binding.node);
      binding.spatial.setPosition(position(matrix));
      const axis = this.localOrientations.get(binding)!;
      // Optional chaining also preserves compatibility with minimal headless
      // position-only consumers that predate the orientation contract.
      binding.spatial.setOrientation?.(normalize({
        x: matrix[0] * axis.x + matrix[4] * axis.y + matrix[8] * axis.z,
        y: matrix[1] * axis.x + matrix[5] * axis.y + matrix[9] * axis.z,
        z: matrix[2] * axis.x + matrix[6] * axis.y + matrix[10] * axis.z
      }, Math.hypot(axis.x, axis.y, axis.z) <= 1e-12 ? { x: 0, y: 0, z: 0 } : { x: 1, y: 0, z: 0 }));
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listenerBinding = undefined;
    this.sources.clear();
    this.localOrientations.clear();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("Cannot bind a disposed SceneAudioBridge");
  }
}

function worldMatrix(node: SceneNode): readonly number[] {
  // A bridge may have no Scene or bind a detached node. Resolve just this
  // ancestor chain; traversing the entire root for each binding makes a frame
  // quadratic in the number of emitters and scene nodes.
  const chain: SceneNode[] = [];
  for (let current: SceneNode | null = node; current; current = current.parent) chain.push(current);
  let changed = false;
  for (let i = chain.length - 1; i >= 0; i--) {
    const current = chain[i]!;
    changed = current.transform.updateWorld(current.parent?.transform.worldMatrix, changed);
  }
  return node.transform.worldMatrix as readonly number[];
}

function position(matrix: readonly number[]): Vec3Like {
  return { x: matrix[12], y: matrix[13], z: matrix[14] };
}

function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(value: Vec3Like, fallback: Vec3Like): Vec3Like {
  const length = Math.hypot(value.x, value.y, value.z);
  return Number.isFinite(length) && length > 1e-12
    ? { x: value.x / length, y: value.y / length, z: value.z / length }
    : fallback;
}

function perpendicular(forward: Vec3Like): Vec3Like {
  const axis = Math.abs(forward.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const projection = dot(axis, forward);
  return normalize({
    x: axis.x - projection * forward.x,
    y: axis.y - projection * forward.y,
    z: axis.z - projection * forward.z
  }, { x: 0, y: 1, z: 0 });
}

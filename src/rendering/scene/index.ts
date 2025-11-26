/**
 * Scene Graph module for G3D 5.0 rendering engine.
 * Provides hierarchical scene management with transforms and components.
 * @module scene
 */

export { SceneNode, SceneNodeFlags } from './SceneNode';
export type { ISceneComponent } from './SceneNode';
export { Scene } from './Scene';
export type { SceneEnvironment, SerializedScene, SerializedSceneNode } from './Scene';

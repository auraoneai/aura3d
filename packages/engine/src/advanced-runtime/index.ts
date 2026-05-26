export { A3DRenderer } from "./A3DRenderer.js";
export type { A3DRendererOptions } from "./A3DRenderer.js";
export { A3DScene } from "./A3DScene.js";
export type { A3DSceneMeshOptions, A3DSceneRenderSourceOptions } from "./A3DScene.js";
export { A3DAppLifecycle } from "./A3DAppLifecycle.js";
export type { A3DAppLifecycleSnapshot, A3DDisposable } from "./A3DAppLifecycle.js";

export {
  Scene,
  SceneNode,
  Object3D,
  Group,
  Mesh,
  SkinnedMesh,
  InstancedMesh,
  PerspectiveCamera,
  OrthographicCamera,
  DirectionalLight,
  PointLight,
  SpotLight,
  Renderable
} from "@aura3d/scene";
export type {
  MeshOptions,
  Object3DOptions,
  RenderableDescriptor
} from "@aura3d/scene";

export {
  Renderer,
  Geometry,
  Material,
  PBRMaterial,
  UnlitMaterial,
  TexturedPBRMaterial,
  TexturedUnlitMaterial,
  SkinnedLitMaterial,
  InstancedPBRMaterial,
  TextureBinding
} from "@aura3d/rendering";
export type {
  CameraLike,
  RenderDeviceDiagnostics,
  RenderItem,
  RenderMaterial,
  RendererOptions,
  RenderSource
} from "@aura3d/rendering";

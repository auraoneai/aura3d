import { AssetManager, GLTFLoader, createGLTFRenderResources, createGLTFSceneAnimationMixer, type AssetHandle, type GLTFAsset, type GLTFRenderResources, type GLTFSceneAnimationMixerBinding } from "@aura3d/assets";
import { collectLight, Geometry, IndexBuffer, isTextureBinding, MaterialInstance, PBRMaterial, ShaderLibrary, ShaderModule, Texture, TextureBinding, TexturedPBRMaterial, VertexBuffer, VertexFormat, type Material, type PortableShaderMaterial, type RenderItem } from "@aura3d/rendering";
import { Renderer } from "@aura3d/engine/renderer";
import { createCustomShaderMaterial, shaderGraphMaterial } from "@aura3d/engine/shader-graph-runtime";
import type { ShaderGraphDocument } from "@aura3d/rendering/shader-graph";
import type { EditorProjectShaderBinding } from "@aura3d/editor-runtime";
import { DirectionalLight, MAX_RENDERABLE_SKINNING_JOINTS, PointLight, SpotLight, multiplyMat4, type Scene } from "@aura3d/scene";
import type { InspectableTexture, TextureResourceState } from "../panels/TextureInspectorPanel";
import type { EditorAssetRecord, EditorProject, EditorProjectNode } from "../project/ProjectSerializer";

export type GraphSampledTextureKind = "texture2d" | "texture3d" | "depth2d";

/** Classify only live sampled textures the graph material adapter can bind. */
export function graphSampledTextureKind(texture: Texture): GraphSampledTextureKind | null {
  if (texture.disposed || !texture.usage.includes("sampled")) return null;
  if (texture.dimension === "2d") return texture.format === "depth24" ? "depth2d" : "texture2d";
  if (texture.dimension === "3d" && texture.format !== "depth24") return "texture3d";
  return null;
}

export interface ProjectSceneHost {
  readonly project: EditorProject;
  readonly scene: Scene;
  readonly runtime: { readonly mode: "edit" | "play" | "paused" };
  notifyShaderTexturesChanged(): void;
  addConsoleMessage(level: "error", message: string): void;
}

interface MeshAssetEntry {
  readonly key: string;
  readonly controller: AbortController;
  resources?: GLTFRenderResources;
  handle?: AssetHandle<GLTFAsset>;
  building?: boolean;
  error?: string;
}

interface TextureAssetEntry {
  readonly key: string;
  readonly uri: string;
  readonly image: HTMLImageElement;
  texture?: Texture;
  linearTexture?: Texture;
  error?: string;
}

interface ModelInstance {
  readonly assetKey: string;
  readonly configuration: string;
  readonly scene: Scene;
  readonly mixer: GLTFSceneAnimationMixerBinding;
  error?: string;
}

type GraphJointInput = "float" | "uint" | "sint";

/**
 * The imported-resource bridge currently creates only four-influence vertex
 * buffers. Check the exact forward/depth graph contract before replacing a
 * live editor material; otherwise a valid base shader can mask an invalid
 * deformation shader until the next draw.
 */
function importedGraphSkinInputs(entry: MeshAssetEntry, deviceKind: string): readonly GraphJointInput[] {
  const resources = entry.resources!;
  const asset = entry.handle!.value;
  if (asset.meshes.some((mesh) => mesh.morphTargets.length > 0)) {
    throw new Error("morph-target meshes are not supported");
  }
  if (asset.meshes.some((mesh) => (mesh.joints1?.length ?? 0) > 0 || (mesh.weights1?.length ?? 0) > 0)) {
    throw new Error("the imported resource bridge does not preserve eight skin influences");
  }
  const inputs = new Set<GraphJointInput>();
  for (const { renderable } of resources.scene.collectRenderables()) {
    if (renderable.morphWeights.length > 0) throw new Error("morph-target meshes are not supported");
    const mesh = asset.meshes.find((candidate) => candidate.name === renderable.geometry);
    if (mesh?.skinIndex !== undefined && !renderable.skinning) {
      throw new Error(`skinning for ${renderable.geometry} is unavailable`);
    }
    const skin = renderable.skinning;
    if (!skin) continue;
    if (!mesh) throw new Error(`skinned mesh ${renderable.geometry ?? "(missing)"} is unavailable`);
    if (renderable.instanceTransforms || renderable.instanceColors) throw new Error("instanced skinned meshes are not supported");
    const geometry = resources.geometryLibrary?.get(renderable.geometry);
    if (!geometry) throw new Error(`skinned geometry ${renderable.geometry ?? "(missing)"} is unavailable`);
    if (!Number.isInteger(skin.jointCount) || skin.jointCount <= 0 || skin.jointCount > MAX_RENDERABLE_SKINNING_JOINTS
      || !(skin.matrices instanceof Float32Array) || skin.matrices.length !== skin.jointCount * 16
      || !skin.matrices.every(Number.isFinite)) {
      throw new Error(`the skin palette for ${renderable.geometry} is invalid`);
    }
    const format = geometry.vertexBuffer.format;
    if (format.hasAttribute("joints1") || format.hasAttribute("weights1")) throw new Error("eight skin influences are not supported");
    if (!format.hasAttribute("joints") || !format.hasAttribute("weights")) throw new Error("skinned geometry needs joint and weight attributes");
    const joints = format.getAttribute("joints"), weights = format.getAttribute("weights");
    if (joints.components !== 4 || weights.components !== 4 || joints.shaderLocation !== 5 || weights.shaderLocation !== 6
      || joints.normalized || weights.integer
      || (deviceKind === "webgpu" && ((joints.type !== "float32" && !joints.integer)
        || (weights.type !== "float32" && !weights.normalized)))) {
      throw new Error("the skinned geometry joint or weight layout is unsupported");
    }
    const jointBuffer = geometry.getAttributeBuffer("joints"), weightBuffer = geometry.getAttributeBuffer("weights");
    if ([jointBuffer, weightBuffer].some((buffer) => buffer.format.streams.find((stream) => stream.slot === buffer.bufferSlot)?.stepMode !== "vertex")) {
      throw new Error("skinned geometry requires per-vertex joint and weight streams");
    }
    for (let vertex = 0; vertex < geometry.vertexBuffer.vertexCount; vertex += 1) {
      const indices = jointBuffer.getDecodedAttribute(vertex, "joints"), values = weightBuffer.getDecodedAttribute(vertex, "weights");
      let sum = 0;
      for (let influence = 0; influence < 4; influence += 1) {
        const joint = indices[influence]!, weight = values[influence]!;
        if (!Number.isFinite(joint) || !Number.isInteger(joint) || joint < 0
          || !Number.isFinite(weight) || weight < 0 || (weight > 0 && joint >= skin.jointCount)) {
          throw new Error(`invalid skin joint or weight at vertex ${vertex}`);
        }
        sum += weight;
      }
      if (!(sum > 0) || Math.abs(sum - 1) > 0.02) throw new Error(`skin weights at vertex ${vertex} must be normalized`);
    }
    inputs.add(joints.integer ? (joints.type.startsWith("uint") ? "uint" : "sint") : "float");
  }
  return [...inputs];
}

/** Scene resource ownership and render-item construction shared by authoring and export. */
export class ProjectSceneRuntime<Host extends ProjectSceneHost = ProjectSceneHost> {
  protected renderer?: Renderer;
  private readonly geometries = new Map<"cube" | "quad", Geometry>();
  private readonly nodeMaterials = new Map<string, { readonly signature: string; readonly material: Material }>();
  private readonly importedMaterials = new Map<string, { readonly assetKey: string; readonly materials: Map<Material, MaterialInstance> }>();
  protected readonly modelInstances = new Map<string, ModelInstance>();
  private readonly graphMaterials = new Map<string, PortableShaderMaterial>();
  // A graph preflight is specific to the imported resource and its geometry.
  // Lazily create this map so existing lightweight editor harnesses remain valid.
  private graphImportedResources?: Map<string, GLTFRenderResources>;
  private readonly assetManager = new AssetManager();
  protected readonly meshAssets = new Map<string, MeshAssetEntry>();
  private graphMaterialSerial = 0;
  protected disposed = false;
  private readonly textureAssets = new Map<string, TextureAssetEntry>();
  private textureRevision = 0;
  protected animationTime: number | undefined;

  constructor(protected readonly shell: Host) {
    this.assetManager.register(new GLTFLoader());
  }

  /** Attach a renderer owned by this scene runtime. */
  setRenderer(renderer: Renderer): void {
    if (this.disposed) throw new Error("Cannot attach a renderer to a disposed scene.");
    if (this.renderer && this.renderer !== renderer) throw new Error("The scene already owns a renderer.");
    this.renderer = renderer;
  }

  /** Update asynchronous assets and return current scene geometry. */
  prepareFrame(delta: number): RenderItem[] {
    this.syncTextureAssets();
    this.syncMeshAssets();
    this.shell.scene.updateWorldTransforms();
    return this.sceneRenderItems(delta);
  }

  collectSceneLights(): ReturnType<typeof collectLight>[] { return this.sceneLights(); }

  assetState(): { readonly loading: readonly string[]; readonly errors: readonly string[] } {
    const loading: string[] = [];
    const errors: string[] = [];
    const assets = new Map(this.shell.project.assets.map((asset) => [asset.id, asset]));
    for (const node of this.shell.project.scene.nodes) {
      if (!node.mesh.enabled || node.mesh.primitive !== "imported") continue;
      const asset = node.mesh.assetId ? assets.get(node.mesh.assetId) : undefined;
      if (!asset || asset.type !== "gltf") errors.push(`${node.name}: the imported model asset is missing.`);
    }
    for (const [id, entry] of this.meshAssets) {
      const label = assets.get(id)?.name ?? id;
      if (entry.error) errors.push(`${label}: ${entry.error}`);
      else if (!entry.resources) loading.push(label);
    }
    for (const [id, entry] of this.textureAssets) {
      const label = assets.get(id)?.name ?? id;
      if (entry.error) errors.push(`${label}: ${entry.error}`);
      else if (!entry.texture) loading.push(label);
    }
    for (const [id, instance] of this.modelInstances) {
      if (instance.error) errors.push(`${this.shell.project.scene.nodes.find((node) => node.id === id)?.name ?? id}: ${instance.error}`);
    }
    return { loading, errors };
  }

  hasActiveAnimations(): boolean {
    return [...this.modelInstances.values()].some((instance) => !instance.error && instance.mixer.snapshot().activeClipNames.length > 0);
  }

  protected sceneRenderItems(delta: number): RenderItem[] {
    const items: RenderItem[] = [];
    const activeNodes = new Map(this.shell.project.scene.nodes.map((node) => [node.id, node]));
    for (const [id, entry] of this.nodeMaterials) {
      const node = activeNodes.get(id);
      if (!node || !node.mesh.enabled || node.mesh.primitive === "imported") { entry.material.dispose(); this.nodeMaterials.delete(id); }
    }
    for (const id of this.importedMaterials.keys()) {
      const node = activeNodes.get(id);
      if (!node || !node.mesh.enabled || node.mesh.primitive !== "imported") this.importedMaterials.delete(id);
    }
    for (const [id, instance] of this.modelInstances) {
      const node = activeNodes.get(id);
      if (!node || !node.mesh.enabled || node.mesh.primitive !== "imported") this.disposeModelInstance(id, instance);
    }
    for (const node of this.shell.project.scene.nodes) {
      const sceneNode = this.shell.scene.getNodeById(node.id);
      if (!sceneNode || !node.mesh.enabled) continue;
      const modelMatrix = sceneNode.transform.worldMatrix;
      let graphMaterial = this.graphMaterials.get(node.id);
      if (node.mesh.primitive !== "imported") {
        const geometry = this.primitiveGeometry(node.mesh.primitive);
        items.push({ geometry, material: graphMaterial ?? this.nodeMaterial(node), label: node.name, modelMatrix, userData: { editorNodeId: node.id } });
        continue;
      }
      const entry = node.mesh.assetId ? this.meshAssets.get(node.mesh.assetId) : undefined;
      if (!entry?.resources || !entry.handle) continue;
      const resources = entry.resources;
      if (graphMaterial && this.graphImportedResources?.get(node.id) !== resources) {
        // A model was replaced since the graph was checked. Never submit the
        // old material against unvalidated skin, morph, or vertex inputs.
        graphMaterial.dispose();
        this.graphMaterials.delete(node.id);
        this.graphImportedResources?.delete(node.id);
        graphMaterial = undefined;
        queueMicrotask(() => { if (!this.disposed) this.shell.notifyShaderTexturesChanged(); });
      }
      const instance = this.modelInstance(node, entry);
      if (this.shell.runtime.mode === "play" && node.animation.enabled && !instance.error) {
        try { instance.mixer.update(delta); } catch (error) {
          instance.error = redactDiagnostic(error instanceof Error ? error.message : "Animation update failed.");
        }
      }
      instance.scene.updateWorldTransforms();
      for (const imported of instance.scene.collectRenderables()) {
        const geometry = resources.geometryLibrary.get(imported.renderable.geometry);
        const material = resources.materialLibrary.get(imported.renderable.material);
        if (!geometry || !material) continue;
        const morphTargets = resources.morphTargetLibrary.get(imported.renderable.geometry);
        items.push({
          geometry,
          material: graphMaterial ?? this.importedMaterial(node, entry.key, material),
          label: `${node.name}: ${imported.node.name}`,
          modelMatrix: multiplyMat4(modelMatrix, imported.node.transform.worldMatrix),
          userData: { editorNodeId: node.id },
          ...(imported.renderable.skinning ? { skinning: imported.renderable.skinning } : {}),
          ...(imported.renderable.instanceTransforms ? { instanceTransforms: imported.renderable.instanceTransforms } : {}),
          ...(imported.renderable.instanceColors ? { instanceColors: imported.renderable.instanceColors } : {}),
          ...(morphTargets && imported.renderable.morphWeights.length ? { morphTargets, morphWeights: imported.renderable.morphWeights } : {})
        });
      }
    }
    return items;
  }

  private primitiveGeometry(primitive: "cube" | "quad"): Geometry {
    let geometry = this.geometries.get(primitive);
    if (!geometry) {
      geometry = primitive === "cube" ? Geometry.box({ textured: true }) : createQuadGeometry();
      this.geometries.set(primitive, geometry);
    }
    return geometry;
  }

  private graphGeometry(node: EditorProjectNode): readonly Geometry[] {
    if (node.mesh.primitive !== "imported") return [this.primitiveGeometry(node.mesh.primitive)];
    const resources = node.mesh.assetId ? this.meshAssets.get(node.mesh.assetId)?.resources : undefined;
    if (!resources) return [];
    return resources.scene.collectRenderables().flatMap(({ renderable }) => {
      const geometry = resources.geometryLibrary.get(renderable.geometry);
      return geometry ? [geometry] : [];
    });
  }

  private missingGraphAttributes(material: Material, geometries: readonly Geometry[]): readonly string[] {
    return material.requiredAttributes.filter((name) => geometries.some((geometry) =>
      !geometry.vertexBuffer.format.attributes.some((attribute) => attribute.semantic === name || attribute.shaderName === name)
    ));
  }

  private modelInstance(node: EditorProjectNode, entry: MeshAssetEntry): ModelInstance {
    const configuration = JSON.stringify([entry.key, node.animation.enabled, node.animation.clip, node.animation.loop]);
    const existing = this.modelInstances.get(node.id);
    if (existing?.configuration === configuration) return existing;
    if (existing) this.disposeModelInstance(node.id, existing);
    const asset = entry.handle!.value;
    const scene = asset.createScene();
    const mixer = createGLTFSceneAnimationMixer({ scene, asset, clips: asset.animations, autoPlay: false });
    const clip = node.animation.clip || asset.animations[0]?.name;
    let error: string | undefined;
    if (node.animation.enabled) {
      if (!clip || !mixer.listClips().includes(clip)) error = `Animation clip ${clip || "(none)"} is unavailable.`;
      else mixer.playExclusive(clip, { loopMode: node.animation.loop ? "repeat" : "once", reset: true, clampWhenFinished: !node.animation.loop });
    }
    const instance: ModelInstance = { assetKey: entry.key, configuration, scene, mixer, ...(error ? { error } : {}) };
    this.modelInstances.set(node.id, instance);
    return instance;
  }

  private disposeModelInstance(id: string, instance: ModelInstance): void {
    instance.mixer.dispose();
    instance.scene.root.dispose();
    this.modelInstances.delete(id);
  }

  resetSceneInstances(): void {
    for (const [id, instance] of this.modelInstances) this.disposeModelInstance(id, instance);
    this.animationTime = undefined;
  }

  private nodeMaterial(node: EditorProjectNode): Material {
    const slots = node.material.textureSlots;
    const base = this.textureForSlot(slots.baseColor, false);
    const normal = this.textureForSlot(slots.normal, true);
    const metallicRoughness = this.textureForSlot(slots.metallicRoughness, true);
    const emissive = this.textureForSlot(slots.emissive, false);
    const signature = JSON.stringify({ material: node.material, textureRevision: this.textureRevision });
    const current = this.nodeMaterials.get(node.id);
    if (current?.signature === signature) return current.material;
    const options = { name: node.material.name, baseColor: hexToRgba(node.material.baseColor), metallic: node.material.metallic, roughness: node.material.roughness };
    const material = base || normal || metallicRoughness || emissive
      ? new TexturedPBRMaterial({ ...options, baseColorTexture: base, normalTexture: normal, metallicRoughnessTexture: metallicRoughness, emissiveTexture: emissive })
      : new PBRMaterial(options);
    current?.material.dispose();
    this.nodeMaterials.set(node.id, { signature, material });
    return material;
  }

  private importedMaterial(node: EditorProjectNode, assetKey: string, base: Material): MaterialInstance {
    let entry = this.importedMaterials.get(node.id);
    if (!entry || entry.assetKey !== assetKey) {
      entry = { assetKey, materials: new Map() };
      this.importedMaterials.set(node.id, entry);
    }
    let material = entry.materials.get(base);
    if (!material) { material = new MaterialInstance(base); entry.materials.set(base, material); }
    const parameters = base.getParameters();
    if (parameters.has("u_baseColor")) material.setOverride("u_baseColor", hexToRgba(node.material.baseColor));
    if (parameters.has("u_metallic")) material.setOverride("u_metallic", node.material.metallic);
    if (parameters.has("u_roughness")) material.setOverride("u_roughness", node.material.roughness);
    for (const [slot, uniform, linear] of [
      ["baseColor", "u_baseColorTexture", false], ["normal", "u_normalTexture", true],
      ["metallicRoughness", "u_metallicRoughnessTexture", true], ["emissive", "u_emissiveTexture", false]
    ] as const) {
      if (!parameters.has(uniform)) continue;
      const texture = this.textureForSlot(node.material.textureSlots[slot], linear);
      if (texture) {
        material.setOverride(uniform, new TextureBinding({ name: uniform, texture }));
        if (parameters.has(`${uniform}Enabled`)) material.setOverride(`${uniform}Enabled`, 1);
      } else {
        material.clearOverride(uniform);
        material.clearOverride(`${uniform}Enabled`);
      }
    }
    return material;
  }

  private textureForSlot(id: string, linear: boolean): Texture | undefined {
    const entry = this.textureAssets.get(id);
    if (!entry?.texture || entry.texture.disposed) return undefined;
    if (!linear) return entry.texture;
    return entry.linearTexture ??= new Texture({ width: entry.image.naturalWidth, height: entry.image.naturalHeight, source: entry.image, label: `${entry.texture.label} (linear)`, colorSpace: "linear" });
  }

  protected sceneLights(): ReturnType<typeof collectLight>[] {
    return this.shell.project.scene.nodes.flatMap((node) => {
      const sceneNode = this.shell.scene.getNodeById(node.id);
      if (!sceneNode || node.light.kind === "none" || !Number.isFinite(node.light.intensity) || node.light.intensity < 0) return [];
      const light = node.light.kind === "directional" ? new DirectionalLight(node.name) : node.light.kind === "point" ? new PointLight(node.name) : new SpotLight(node.name);
      light.intensity = node.light.intensity;
      light.transform.setLocalMatrix(sceneNode.transform.worldMatrix, { decompose: false });
      light.updateWorldTransform();
      return [collectLight(light)];
    });
  }

  /**
   * Only decoded, live project textures are exposed; asset metadata is not a
   * texture. Textures the live device holds that no project asset owns
   * (render targets, shadow maps, generated lookups) follow as runtime-only
   * entries with stable per-handle identifiers.
   */
  getInspectableTextures(): readonly InspectableTexture[] {
    const direct = [...this.textureAssets].flatMap(([id, entry]) => entry.texture && !entry.texture.disposed ? [{ id, texture: entry.texture, origin: "asset" as const }] : []);
    const embedded = [...this.meshAssets].flatMap(([assetId, entry]) => [...(entry.resources?.textureLibrary ?? [])]
      .flatMap(([key, texture]) => texture.disposed ? [] : [{ id: embeddedTextureId(assetId, key), texture, origin: "asset" as const }]));
    const owned = new Set<Texture>([...direct, ...embedded].map((entry) => entry.texture));
    for (const entry of this.textureAssets.values()) if (entry.linearTexture) owned.add(entry.linearTexture);
    return [...direct, ...embedded, ...this.runtimeOnlyTextures(owned)];
  }

  private runtimeTextureIds?: WeakMap<Texture, string>;
  private nextRuntimeTextureId?: number;

  private runtimeOnlyTextures(owned: ReadonlySet<Texture>): InspectableTexture[] {
    let live: readonly Texture[] = [];
    try { live = this.renderer?.device.getLiveTextures?.() ?? []; } catch { return []; }
    return live.flatMap((texture) => {
      if (texture.disposed || owned.has(texture)) return [];
      const ids = this.runtimeTextureIds ??= new WeakMap<Texture, string>();
      let id = ids.get(texture);
      if (!id) {
        const next = this.nextRuntimeTextureId ?? 1;
        this.nextRuntimeTextureId = next + 1;
        id = `${RUNTIME_TEXTURE_PREFIX}${next}`;
        ids.set(texture, id);
      }
      return [{ id, texture, origin: "runtime" as const }];
    });
  }

  textureInspectionState(): { readonly status: "loading" | "ready" | "error"; readonly message?: string } {
    const entries = [...this.textureAssets.values()];
    if (entries.some((entry) => !entry.texture && !entry.error) || [...this.meshAssets.values()].some((entry) => !entry.resources && !entry.error)) return { status: "loading", message: "Loading texture assets…" };
    const failed = entries.filter((entry) => entry.error).length;
    if (failed && !entries.some((entry) => entry.texture)) return { status: "error", message: `${failed} texture asset${failed === 1 ? "" : "s"} could not be loaded.` };
    return { status: "ready" };
  }

  textureResourceState(id: string): TextureResourceState | null {
    const entry = this.textureAssets.get(id);
    if (!entry && id.startsWith(RUNTIME_TEXTURE_PREFIX)) {
      const texture = this.getInspectableTextures().find((candidate) => candidate.id === id)?.texture;
      // Listed by the device itself, so it is a live device allocation.
      return texture ? { status: "ready", gpuResident: true, message: "Runtime-only texture created by the renderer, not a project asset." }
        : { status: "unloaded", message: "This runtime texture has been released by the renderer." };
    }
    if (!entry) {
      const assetId = embeddedTextureAssetId(id);
      const mesh = assetId ? this.meshAssets.get(assetId) : undefined;
      if (!mesh) return null;
      if (mesh.error) return { status: "error", message: mesh.error };
      const texture = this.getInspectableTextures().find((candidate) => candidate.id === id)?.texture;
      return texture ? { status: texture.disposed ? "disposed" : "ready", gpuResident: null }
        : mesh.resources ? { status: "unloaded", message: "This glTF texture is no longer available." } : { status: "loading" };
    }
    if (entry.error) return { status: "error", message: entry.error };
    if (!entry.texture) return { status: "loading" };
    return { status: entry.texture.disposed ? "disposed" : "ready", gpuResident: null };
  }

  /** Compile a candidate on the live device and keep the last successful material on failure. */
  setShaderGraph(materialId: string, graph: ShaderGraphDocument | null, bindings: Readonly<Record<string, EditorProjectShaderBinding>>): { readonly ok: boolean; readonly diagnostics: readonly string[] } {
    if (!graph) {
      this.graphMaterials.get(materialId)?.dispose();
      this.graphMaterials.delete(materialId);
      this.graphImportedResources?.delete(materialId);
      return { ok: true, diagnostics: [] };
    }
    if (!this.renderer) return { ok: false, diagnostics: ["Renderer is still loading."] };
    const node = this.shell?.project.scene.nodes.find((entry) => entry.id === materialId);
    let skinInputs: readonly GraphJointInput[] = [];
    let graphResources: GLTFRenderResources | undefined;
    if (node?.mesh.primitive === "imported") {
      const entry = node.mesh.assetId ? this.meshAssets.get(node.mesh.assetId) : undefined;
      if (!entry?.resources || !entry.handle) return { ok: false, diagnostics: [entry?.error ?? "Imported model is not loaded yet."] };
      try {
        skinInputs = importedGraphSkinInputs(entry, this.renderer.device.kind);
        graphResources = entry.resources;
      } catch (error) {
        this.graphMaterials.get(materialId)?.dispose();
        this.graphMaterials.delete(materialId);
        this.graphImportedResources?.delete(materialId);
        const detail = error instanceof Error ? error.message : "unsupported imported geometry";
        return { ok: false, diagnostics: [`Shader graph materials cannot yet deform skinned or morph-target glTF meshes: ${detail}.`] };
      }
    }
    let candidate: PortableShaderMaterial | undefined;
    try {
      const uniforms: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const [name, binding] of Object.entries(bindings)) {
        if (binding.kind === "uniform") uniforms[name] = binding.value;
        else {
          const entry = this.textureAssets.get(binding.assetId);
          const texture = this.getInspectableTextures().find((candidate) => candidate.id === binding.assetId)?.texture;
          if (!texture || texture.disposed) {
            throw new Error(entry?.error ?? `Texture asset ${binding.assetId} is not loaded.`);
          }
          const resource = graph.resources?.find((candidate) => candidate.name === name);
          if (resource && (resource.kind === "texture2d" || resource.kind === "texture3d" || resource.kind === "depth2d") && graphSampledTextureKind(texture) !== resource.kind) {
            throw new Error(`Texture asset ${binding.assetId} is not a compatible sampled ${resource.kind} texture for ${name}.`);
          }
          uniforms[name] = texture;
        }
      }
      for (const resource of graph.resources ?? []) {
        if (resource.kind === "texture2d" || resource.kind === "texture3d" || resource.kind === "depth2d") {
          if (bindings[resource.name]?.kind !== "texture") throw new Error(`Choose a compatible ${resource.kind} texture for ${resource.name}.`);
        }
      }
      const material = shaderGraphMaterial({ graph, uniforms });
      if (!material.custom) throw new Error("Shader graph did not produce a renderer material.");
      candidate = createCustomShaderMaterial(material.custom, `editor-graph-${++this.graphMaterialSerial}`);
      if (node) {
        const geometries = this.graphGeometry(node);
        const missing = this.missingGraphAttributes(candidate, geometries);
        if (missing.length) {
          const previous = this.graphMaterials.get(materialId);
          if (previous && this.missingGraphAttributes(previous, geometries).length) {
            previous.dispose();
            this.graphMaterials.delete(materialId);
            this.graphImportedResources?.delete(materialId);
          }
          candidate.dispose();
          return { ok: false, diagnostics: [`Mesh is missing shader graph attributes: ${missing.join(", ")}.`] };
        }
      }
      const result = candidate.compile(this.renderer.device);
      if (!result.ok) {
        candidate.dispose();
        return { ok: false, diagnostics: result.diagnostics.map(redactDiagnostic) };
      }
      // Preflight creates a transient program; the renderer maintains its own cache.
      result.program?.dispose();
      for (const jointInput of skinInputs) {
        for (const pass of ["forward", "depth"] as const) {
          const key = candidate.graphSkinningVariant(4, jointInput, "float", pass);
          if (!key) throw new Error(`Shader graph has no ${pass} variant for the imported skin.`);
          const module = ShaderModule.fromLibrary(new ShaderLibrary(), key);
          if (["a_joints", "a_weights"].some((name) => !module.reflection.attributes.has(name))
            || ["u_jointMatrices", "u_jointCount", "u_jointPaletteMode", "u_jointPaletteTexture", "u_jointPaletteTextureSize"].some((name) => !module.reflection.uniforms.has(name))) {
            throw new Error(`Shader graph ${pass} variant is missing the imported skin palette contract.`);
          }
          const program = module.compile(this.renderer.device);
          program.dispose();
        }
      }
      this.graphMaterials.get(materialId)?.dispose();
      this.graphMaterials.set(materialId, candidate);
      if (graphResources) (this.graphImportedResources ??= new Map()).set(materialId, graphResources);
      else this.graphImportedResources?.delete(materialId);
      return { ok: true, diagnostics: [] };
    } catch (error) {
      candidate?.dispose();
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, diagnostics: [redactDiagnostic(message)] };
    }
  }

  clearShaderGraphs(): void {
    for (const material of this.graphMaterials.values()) material.dispose();
    this.graphMaterials.clear();
    this.graphImportedResources?.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resetSceneInstances();
    this.clearShaderGraphs();
    for (const entry of this.nodeMaterials.values()) entry.material.dispose();
    this.nodeMaterials.clear();
    this.importedMaterials.clear();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
    for (const entry of this.meshAssets.values()) {
      this.retireMeshAsset(entry);
    }
    this.meshAssets.clear();
    for (const entry of this.textureAssets.values()) {
      entry.image.onload = null;
      entry.image.onerror = null;
      entry.image.src = "";
      entry.texture?.dispose();
      entry.linearTexture?.dispose();
    }
    this.textureAssets.clear();
    this.renderer?.dispose();
    this.renderer = undefined;
  }

  protected syncTextureAssets(): void {
    const assets = this.shell.project.assets.filter((asset) => asset.type === "texture");
    const current = new Map(assets.map((asset) => [asset.id, asset]));
    let invalidatedMaterial = false;
    for (const [id, entry] of this.textureAssets) {
      const asset = current.get(id);
      if (asset && entry.key === textureAssetKey(asset)) continue;
      entry.image.onload = null;
      entry.image.onerror = null;
      entry.image.src = "";
      for (const [materialId, material] of this.graphMaterials) {
        if (entry.texture && Array.from(material.getParameters().values()).some((value) => isTextureBinding(value) && value.texture === entry.texture)) {
          material.dispose();
          this.graphMaterials.delete(materialId);
          this.graphImportedResources?.delete(materialId);
          invalidatedMaterial = true;
        }
      }
      entry.texture?.dispose();
      entry.linearTexture?.dispose();
      this.textureAssets.delete(id);
      this.textureRevision += 1;
    }
    if (invalidatedMaterial) queueMicrotask(() => { if (!this.disposed) this.shell.notifyShaderTexturesChanged(); });
    for (const asset of assets) {
      if (this.textureAssets.has(asset.id)) continue;
      const image = new Image();
      const entry: TextureAssetEntry = { key: textureAssetKey(asset), uri: asset.uri, image };
      this.textureAssets.set(asset.id, entry);
      try {
        const url = new URL(asset.uri, document.baseURI);
        if (!(["http:", "https:", "blob:"].includes(url.protocol) || (url.protocol === "data:" && /^data:image\//i.test(asset.uri)))) {
          throw new Error("Texture assets require an image URL.");
        }
        image.crossOrigin = "anonymous";
        image.onload = () => {
          if (this.textureAssets.get(asset.id) !== entry) return;
          try {
            entry.texture = new Texture({ width: image.naturalWidth, height: image.naturalHeight, source: image, label: asset.name, colorSpace: "srgb" });
            this.textureRevision += 1;
          } catch (error) {
            entry.error = redactDiagnostic(error instanceof Error ? error.message : "Invalid texture image.");
          }
          this.shell.notifyShaderTexturesChanged();
        };
        image.onerror = () => {
          if (this.textureAssets.get(asset.id) !== entry) return;
          entry.error = "The texture image could not be loaded.";
          this.shell.notifyShaderTexturesChanged();
        };
        image.src = url.href;
      } catch (error) {
        entry.error = redactDiagnostic(error instanceof Error ? error.message : "Invalid texture URL.");
      }
    }
  }

  protected syncMeshAssets(): void {
    const required = new Set(this.shell.project.scene.nodes.flatMap((node) =>
      node.mesh.enabled && node.mesh.primitive === "imported" && node.mesh.assetId ? [node.mesh.assetId] : []));
    for (const graph of this.shell.project.shaderGraphs ?? []) {
      for (const binding of Object.values(graph.bindings ?? {})) {
        if (binding.kind !== "texture") continue;
        const owner = embeddedTextureAssetId(binding.assetId);
        if (owner) required.add(owner);
      }
    }
    for (const selected of this.shell.project.editor?.selectedResourceIds ?? []) {
      const owner = embeddedTextureAssetId(selected);
      if (owner) required.add(owner);
    }
    const assets = new Map(this.shell.project.assets.filter((asset) => asset.type === "gltf" && required.has(asset.id)).map((asset) => [asset.id, asset]));
    for (const [id, entry] of this.meshAssets) {
      const asset = assets.get(id);
      const key = asset ? JSON.stringify([asset.uri, asset.cacheKey ?? null, asset.revision ?? 1]) : null;
      if (entry.key === key) continue;
      this.retireMeshAsset(entry);
      this.meshAssets.delete(id);
    }
    for (const [id, asset] of assets) {
      if (this.meshAssets.has(id)) continue;
      const entry: MeshAssetEntry = { key: JSON.stringify([asset.uri, asset.cacheKey ?? null, asset.revision ?? 1]), controller: new AbortController() };
      this.meshAssets.set(id, entry);
      void this.loadMeshAsset(id, asset.uri, entry);
    }
  }

  private async loadMeshAsset(id: string, uri: string, entry: MeshAssetEntry): Promise<void> {
    const isCurrent = (): boolean => !this.disposed && this.meshAssets.get(id) === entry;
    try {
      const handle = await this.assetManager.load<GLTFAsset>(uri, { type: "gltf", signal: entry.controller.signal });
      if (!isCurrent()) { await this.assetManager.release(handle); return; }
      entry.handle = handle;
      entry.building = true;
      const resources = await createGLTFRenderResources(handle.value, { signal: entry.controller.signal });
      if (!isCurrent()) { resources.dispose(); return; }
      entry.resources = resources;
    } catch (error) {
      if (!isCurrent()) return;
      entry.error = redactDiagnostic(error instanceof Error ? error.message : "Unable to load glTF asset.");
      if (entry.handle) {
        const handle = entry.handle;
        entry.handle = undefined;
        try { await this.assetManager.release(handle); } catch (releaseError) {
          const reason = releaseError instanceof Error ? releaseError.message : "asset release failed";
          entry.error = `${entry.error} (${redactDiagnostic(reason)})`;
        }
      }
    } finally {
      entry.building = false;
      if (!isCurrent() && entry.handle) {
        const handle = entry.handle;
        entry.handle = undefined;
        await this.assetManager.release(handle).catch((error: unknown) => {
          if (!this.disposed) this.shell.addConsoleMessage("error", error instanceof Error ? error.message : "Failed to release glTF asset.");
        });
      }
      if (isCurrent()) queueMicrotask(() => { if (isCurrent()) this.shell.notifyShaderTexturesChanged(); });
    }
  }

  private retireMeshAsset(entry: MeshAssetEntry): void {
    entry.controller.abort();
    for (const [id, instance] of this.modelInstances) if (instance.assetKey === entry.key) this.disposeModelInstance(id, instance);
    for (const [id, cached] of this.importedMaterials) if (cached.assetKey === entry.key) this.importedMaterials.delete(id);
    const textures = new Set(entry.resources?.textureLibrary.values() ?? []);
    let invalidated = false;
    for (const [id, material] of this.graphMaterials) {
      const ownsModel = entry.resources !== undefined && this.graphImportedResources?.get(id) === entry.resources;
      if (!ownsModel && ![...material.getParameters().values()].some((value) => isTextureBinding(value) && value.texture && textures.has(value.texture))) continue;
      material.dispose();
      this.graphMaterials.delete(id);
      this.graphImportedResources?.delete(id);
      invalidated = true;
    }
    entry.resources?.dispose();
    entry.resources = undefined;
    if (entry.handle && !entry.building) {
      const handle = entry.handle;
      entry.handle = undefined;
      void this.assetManager.release(handle).catch((error: unknown) => {
        if (!this.disposed) this.shell.addConsoleMessage("error", error instanceof Error ? error.message : "Failed to release glTF asset.");
      });
    }
    if (invalidated) queueMicrotask(() => { if (!this.disposed) this.shell.notifyShaderTexturesChanged(); });
  }

}

function createQuadGeometry(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3N3T4T2, 4);
  const positions = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]] as const;
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
  positions.forEach((position, index) => {
    vertices.setAttribute(index, "position", position);
    vertices.setAttribute(index, "normal", [0, 0, 1]);
    vertices.setAttribute(index, "tangent", [1, 0, 0, 1]);
    vertices.setAttribute(index, "uv", uvs[index]!);
  });
  return new Geometry(vertices, new IndexBuffer([0, 1, 2, 0, 2, 3], 4));
}

function textureAssetKey(asset: EditorAssetRecord): string {
  return JSON.stringify([asset.uri, asset.cacheKey ?? null, asset.revision ?? 1]);
}

const RUNTIME_TEXTURE_PREFIX = "runtime:";

function embeddedTextureId(assetId: string, key: string): string {
  return `gltf-texture:${encodeURIComponent(assetId)}:${encodeURIComponent(key)}`;
}

/** Recover the owning glTF asset from an inspector texture selection. */
export function embeddedTextureAssetId(id: string): string | null {
  const match = /^gltf-texture:([^:]+):([^:]+)$/.exec(id);
  if (!match) return null;
  try { return decodeURIComponent(match[1]!); } catch { return null; }
}

function redactDiagnostic(value: string): string {
  return value.replace(/\b(?:https?|wss?):\/\/[^\s)\]"']+/gi, "[url]")
    .replace(/data:[^\s)\]"']+/gi, "[data]")
    .replace(/\b(bearer)\s+[^\s,;]+/gi, "$1 [redacted]")
    .replace(/\b(token|secret|password|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

function hexToRgba(hex: string): readonly [number, number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "80a6ff";
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
    1
  ];
}

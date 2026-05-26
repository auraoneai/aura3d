import type { EditorPrefab } from "@aura3d/editor-runtime";
import { validatePrefab } from "@aura3d/editor-runtime";
import { Scene, SceneNode } from "@aura3d/scene";

export const EDITOR_PROJECT_VERSION = 1;

export interface EditorImportSettings {
  readonly colorSpace: "srgb" | "linear";
  readonly generateMipmaps: boolean;
  readonly compression: "none" | "ktx2";
  readonly scale: number;
  readonly orientation: "y-up" | "z-up";
  readonly materialMode: "import" | "reuse" | "override";
  readonly textureMode: "embedded" | "external" | "none";
  readonly importNormals: boolean;
  readonly importTangents: boolean;
  readonly importAnimations: boolean;
  readonly generateCollider: boolean;
  readonly materialVariants: boolean;
}

export interface EditorAssetRecord {
  readonly id: string;
  readonly name: string;
  readonly type: "gltf" | "texture" | "material";
  readonly uri: string;
  readonly importedAt: string;
  readonly preview: string;
  readonly diagnostics: readonly string[];
  readonly folder?: string;
  readonly status?: "imported" | "warning" | "error";
  readonly thumbnailColor?: string;
  readonly dependencies?: readonly string[];
  readonly variants?: readonly string[];
  readonly animationClips?: readonly EditorAssetAnimationClip[];
  readonly revision?: number;
  readonly cacheKey?: string;
}

export interface EditorAssetAnimationClip {
  readonly name: string;
  readonly duration: number;
}

export interface EditorProvenanceOperation {
  readonly id: string;
  readonly runtimeApi: string;
  readonly target: string;
}

export interface EditorProjectProvenance {
  readonly authoringTool: "aura3d-browser-editor";
  readonly workflow: "editor-import-save-export";
  readonly runtimePackage: "@aura3d/editor-runtime";
  readonly operations: readonly EditorProvenanceOperation[];
  readonly evidenceHash: string;
}

export interface EditorNodeMaterial {
  readonly name: string;
  readonly baseColor: string;
  readonly metallic: number;
  readonly roughness: number;
  readonly textureSlots: {
    readonly baseColor: string;
    readonly normal: string;
    readonly metallicRoughness: string;
    readonly emissive: string;
  };
}

type EditorNodeMaterialDraft = Omit<EditorNodeMaterial, "textureSlots"> & {
  readonly textureSlots?: Partial<EditorNodeMaterial["textureSlots"]>;
};

export interface EditorNodeLight {
  readonly kind: "none" | "directional" | "point" | "spot";
  readonly intensity: number;
}

export interface EditorNodeCamera {
  readonly enabled: boolean;
  readonly fov: number;
}

export interface EditorNodePhysics {
  readonly body: "none" | "static" | "dynamic";
  readonly collider: "none" | "box" | "sphere";
  readonly friction: number;
  readonly restitution: number;
}

export interface EditorNodeScript {
  readonly behavior: string;
  readonly enabled: boolean;
}

export interface EditorNodeMesh {
  readonly enabled: boolean;
  readonly assetId: string | null;
  readonly primitive: "cube" | "quad" | "imported";
}

export interface EditorNodeAnimation {
  readonly enabled: boolean;
  readonly clip: string;
  readonly loop: boolean;
}

export interface EditorNodeAudio {
  readonly source: string;
  readonly listener: boolean;
  readonly volume: number;
}

export interface EditorNodeParticleEmitter {
  readonly enabled: boolean;
  readonly preset: "none" | "fire" | "fountain" | "collision-burst";
  readonly emissionRate: number;
  readonly maxParticles: number;
  readonly lifetime: number;
  readonly speed: number;
  readonly looping: boolean;
}

export interface EditorProjectNode {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly transform: {
    readonly position: readonly [number, number, number];
    readonly rotation: readonly [number, number, number, number];
    readonly scale: readonly [number, number, number];
  };
  readonly material: EditorNodeMaterial;
  readonly mesh: EditorNodeMesh;
  readonly light: EditorNodeLight;
  readonly camera: EditorNodeCamera;
  readonly physics: EditorNodePhysics;
  readonly animation: EditorNodeAnimation;
  readonly audio: EditorNodeAudio;
  readonly particleEmitter: EditorNodeParticleEmitter;
  readonly script: EditorNodeScript;
}

export type EditorProjectPrefab = EditorPrefab<EditorProjectNode>;

export interface EditorProject {
  readonly version: typeof EDITOR_PROJECT_VERSION;
  readonly metadata: {
    readonly name: string;
    readonly savedAt: string;
    readonly provenance?: EditorProjectProvenance;
  };
  readonly scene: {
    readonly nodes: readonly EditorProjectNode[];
  };
  readonly prefabs: readonly EditorProjectPrefab[];
  readonly assets: readonly EditorAssetRecord[];
  readonly importSettings: EditorImportSettings;
  readonly plugins: readonly string[];
  readonly export: {
    readonly title: string;
    readonly entryNodeId: string | null;
  };
}

export interface ProjectSceneBuild {
  readonly scene: Scene;
  readonly nodes: ReadonlyMap<string, SceneNode>;
}

const defaultImportSettings: EditorImportSettings = {
  colorSpace: "srgb",
  generateMipmaps: true,
  compression: "none",
  scale: 1,
  orientation: "y-up",
  materialMode: "import",
  textureMode: "embedded",
  importNormals: true,
  importTangents: true,
  importAnimations: true,
  generateCollider: true,
  materialVariants: true
};

export class ProjectSerializer {
  createDefaultProject(now = new Date("2026-01-01T00:00:00.000Z")): EditorProject {
    return {
      version: EDITOR_PROJECT_VERSION,
      metadata: {
        name: "Untitled Aura3D Scene",
        savedAt: now.toISOString(),
        provenance: this.createEditorProvenance([
          { id: "select-default-node", runtimeApi: "EditorRuntime.select", target: "node-hero" },
          { id: "inspect-transform", runtimeApi: "EditorRuntime.inspect", target: "node-hero" },
          { id: "serialize-project", runtimeApi: "ProjectSerializer.serialize", target: "project.json" }
        ])
      },
      scene: {
        nodes: [
          createProjectNode({
            id: "node-hero",
            name: "Hero Cube",
            parentId: null,
            position: [0, 0, 0],
            material: { name: "Mint Material", baseColor: "#38d99f", metallic: 0, roughness: 0.45 },
            light: { kind: "directional", intensity: 1.2 },
            camera: { enabled: true, fov: 60 },
            physics: { body: "static", collider: "box", friction: 0.7, restitution: 0.1 },
            script: { behavior: "SpinBehavior", enabled: true }
          }),
          createProjectNode({
            id: "node-child",
            name: "Imported Placeholder",
            parentId: "node-hero",
            position: [1.2, 0, 0],
            material: { name: "Slate Material", baseColor: "#7fa4ff", metallic: 0.1, roughness: 0.6 }
          })
        ]
      },
      prefabs: [],
      assets: [],
      importSettings: { ...defaultImportSettings },
      plugins: ["aura3d.default-authoring"],
      export: {
        title: "Aura3D Editor Export",
        entryNodeId: "node-hero"
      }
    };
  }

  createExternalParityStarterProject(now = new Date("2026-05-08T00:00:00.000Z")): EditorProject {
    const asset: EditorAssetRecord = {
      id: "asset-external-parity-fox",
      name: "Fox.glb",
      type: "gltf",
      uri: "../../tests/assets/corpus/khronos/Fox/Fox.glb",
      importedAt: now.toISOString(),
      preview: "real glTF asset reference with animation clips",
      diagnostics: ["ExternalParity starter imported with embedded textures, animation clips, and material variants enabled"],
      folder: "Imported/glTF",
      status: "imported",
      thumbnailColor: "#ff8844",
      dependencies: ["Fox.glb", "Survey camera", "Run animation clip", "Edited material"],
      variants: ["Default", "Copper", "Arctic"],
      animationClips: [
        { name: "Survey", duration: 3.5 },
        { name: "Run", duration: 0.8 },
        { name: "Walk", duration: 1.2 }
      ],
      revision: 1,
      cacheKey: "../../tests/assets/corpus/khronos/Fox/Fox.glb#rev-1"
    };
    return {
      version: EDITOR_PROJECT_VERSION,
      metadata: {
        name: "ExternalParity Editor Authored Starter",
        savedAt: now.toISOString(),
        provenance: this.createEditorProvenance([
          { id: "external-parity-starter-project", runtimeApi: "ProjectSerializer.createExternalParityStarterProject", target: "project.json" },
          { id: "import-external-parity-fox", runtimeApi: "EditorRuntime.executeCommand", target: asset.id },
          { id: "select-external-parity-fox", runtimeApi: "EditorRuntime.select", target: "node-external-parity-fox" },
          { id: "configure-external-parity-play", runtimeApi: "EditorRuntime.enterPlayMode", target: "node-external-parity-fox" }
        ])
      },
      scene: {
        nodes: [
          createProjectNode({
            id: "node-external-parity-stage",
            name: "ExternalParity Stage Root",
            parentId: null,
            position: [0, -0.25, 0],
            material: { name: "Stage Contact Material", baseColor: "#172033", metallic: 0.1, roughness: 0.72 },
            mesh: { enabled: true, assetId: null, primitive: "cube" },
            light: { kind: "directional", intensity: 1.8 },
            camera: { enabled: false, fov: 60 },
            physics: { body: "static", collider: "box", friction: 0.8, restitution: 0.05 }
          }),
          createProjectNode({
            id: "node-external-parity-fox",
            name: "Imported Fox Hero",
            parentId: "node-external-parity-stage",
            position: [0.7, 0.35, 0],
            material: {
              name: "Edited ExternalParity Fox Material",
              baseColor: "#ff8844",
              metallic: 0.15,
              roughness: 0.36,
              textureSlots: {
                baseColor: "Fox_baseColor",
                normal: "Fox_normal",
                metallicRoughness: "Fox_metallicRoughness",
                emissive: ""
              }
            },
            mesh: { enabled: true, assetId: asset.id, primitive: "imported" },
            physics: { body: "dynamic", collider: "box", friction: 0.35, restitution: 0.25 },
            animation: { enabled: true, clip: "Run", loop: true },
            particleEmitter: { enabled: true, preset: "fountain", emissionRate: 42, maxParticles: 220, lifetime: 1.4, speed: 2.8, looping: true },
            script: { behavior: "BounceBehavior", enabled: true }
          }),
          createProjectNode({
            id: "node-external-parity-key-light",
            name: "ExternalParity Key Light",
            parentId: null,
            position: [-1.2, 1.25, 0],
            material: { name: "Light Gizmo Material", baseColor: "#facc15", metallic: 0, roughness: 0.2 },
            light: { kind: "point", intensity: 2.4 },
            script: { behavior: "PulseLightBehavior", enabled: true }
          }),
          createProjectNode({
            id: "node-external-parity-camera",
            name: "ExternalParity Export Camera",
            parentId: null,
            position: [1.65, 0.85, 0],
            material: { name: "Camera Gizmo Material", baseColor: "#67e8f9", metallic: 0, roughness: 0.4 },
            camera: { enabled: true, fov: 52 },
            audio: { source: "", listener: true, volume: 0.75 },
            script: { behavior: "OrbitCameraBehavior", enabled: true }
          })
        ]
      },
      prefabs: [],
      assets: [asset],
      importSettings: {
        ...defaultImportSettings,
        scale: 1.25,
        materialMode: "import",
        textureMode: "embedded",
        importAnimations: true,
        generateCollider: true,
        materialVariants: true
      },
      plugins: ["aura3d.default-authoring"],
      export: {
        title: "Aura3D ExternalParity Editor Export",
        entryNodeId: "node-external-parity-camera"
      }
    };
  }

  serialize(project: EditorProject): string {
    this.validate(project);
    return JSON.stringify(project, null, 2);
  }

  parse(source: string): EditorProject {
    const parsed = normalizeProject(this.migrate(JSON.parse(source)));
    this.validate(parsed);
    return parsed;
  }

  migrate(source: unknown): EditorProject {
    if (!isRecord(source)) {
      throw new Error("Editor project source must be an object.");
    }
    if (source.version === EDITOR_PROJECT_VERSION) {
      return source as unknown as EditorProject;
    }
    if (source.version === 0 || source.version === undefined) {
      return this.migrateV0(source);
    }
    return source as unknown as EditorProject;
  }

  clone(project: EditorProject): EditorProject {
    return this.parse(this.serialize(project));
  }

  createEditorProvenance(operations: readonly EditorProvenanceOperation[]): EditorProjectProvenance {
    const provenance = {
      authoringTool: "aura3d-browser-editor" as const,
      workflow: "editor-import-save-export" as const,
      runtimePackage: "@aura3d/editor-runtime" as const,
      operations: operations.map((operation) => ({ ...operation })),
      evidenceHash: ""
    };
    return {
      ...provenance,
      evidenceHash: computeProvenanceHash(provenance)
    };
  }

  verifyEditorAuthoredProvenance(project: EditorProject): void {
    const provenance = project.metadata.provenance;
    if (!provenance) {
      throw new Error("Editor-authored project is missing metadata.provenance.");
    }
    validateProvenance(provenance);
    const runtimeOperations = provenance.operations.filter((operation) => operation.runtimeApi.startsWith("EditorRuntime."));
    if (runtimeOperations.length < 2) {
      throw new Error("Editor-authored project provenance must include at least two EditorRuntime operations.");
    }
    if (!provenance.operations.some((operation) => operation.runtimeApi === "StaticProjectExporter.export" || operation.runtimeApi === "createStaticExportRuntime")) {
      throw new Error("Editor-authored project provenance must include static export evidence.");
    }
  }

  buildScene(project: EditorProject): ProjectSceneBuild {
    this.validate(project);
    const scene = new Scene();
    const nodes = new Map<string, SceneNode>();
    for (const nodeRecord of project.scene.nodes) {
      const node = new SceneNode({ id: nodeRecord.id, name: nodeRecord.name });
      node.transform.setPosition(...nodeRecord.transform.position);
      node.transform.setRotation(...nodeRecord.transform.rotation);
      node.transform.setScale(...nodeRecord.transform.scale);
      nodes.set(nodeRecord.id, node);
    }
    for (const nodeRecord of project.scene.nodes) {
      const node = mustGet(nodes, nodeRecord.id);
      const parent = nodeRecord.parentId ? mustGet(nodes, nodeRecord.parentId) : scene.root;
      parent.addChild(node);
    }
    for (const child of scene.root.children) {
      scene.registerSubtree(child);
    }
    scene.updateWorldTransforms();
    return { scene, nodes };
  }

  captureScene(scene: Scene, previous: EditorProject): EditorProject {
    const previousNodes = new Map(previous.scene.nodes.map((node) => [node.id, node]));
    const nodes: EditorProjectNode[] = [];
    scene.root.traverse((node) => {
      if (node === scene.root) {
        return;
      }
      const previousNode = previousNodes.get(node.id);
      nodes.push({
        ...(previousNode ?? createProjectNode({ id: node.id, name: node.name, parentId: node.parent?.id === "root" ? null : node.parent?.id ?? null })),
        name: node.name,
        parentId: node.parent?.id === "root" ? null : node.parent?.id ?? null,
        transform: {
          position: [...node.transform.position] as [number, number, number],
          rotation: [...node.transform.rotation] as [number, number, number, number],
          scale: [...node.transform.scale] as [number, number, number]
        }
      });
    });
    return {
      ...previous,
      metadata: { ...previous.metadata, savedAt: new Date().toISOString() },
      scene: { nodes }
    };
  }

  validate(project: EditorProject): void {
    if (project.version !== EDITOR_PROJECT_VERSION) {
      throw new Error(`Unsupported editor project version: ${String(project.version)}`);
    }
    const ids = new Set<string>();
    for (const node of project.scene.nodes) {
      if (!node.id || ids.has(node.id)) {
        throw new Error(`Duplicate or empty project node id: ${node.id}`);
      }
      ids.add(node.id);
      assertFiniteTuple(node.transform.position, 3, `${node.id}.position`);
      assertFiniteTuple(node.transform.rotation, 4, `${node.id}.rotation`);
      assertFiniteTuple(node.transform.scale, 3, `${node.id}.scale`);
      if (node.parentId && !ids.has(node.parentId) && !project.scene.nodes.some((candidate) => candidate.id === node.parentId)) {
        throw new Error(`Project node ${node.id} references missing parent ${node.parentId}`);
      }
    }
    for (const asset of project.assets) {
      if (!asset.id || !asset.name || !asset.uri) {
        throw new Error("Editor asset records require id, name, and uri.");
      }
    }
    for (const prefab of project.prefabs) {
      validatePrefab(prefab);
    }
    if (project.importSettings.scale <= 0 || !Number.isFinite(project.importSettings.scale)) {
      throw new Error("Editor import scale must be a positive finite number.");
    }
    if (project.metadata.provenance) {
      validateProvenance(project.metadata.provenance);
    }
  }

  private migrateV0(source: Record<string, unknown>): EditorProject {
    const base = this.createDefaultProject();
    const metadata = isRecord(source.metadata) ? source.metadata : {};
    const scene = isRecord(source.scene) ? source.scene : {};
    const rawNodes = Array.isArray(scene.nodes) ? scene.nodes : [];
    const nodes = rawNodes.length > 0
      ? rawNodes.filter(isRecord).map((node, index) => createProjectNode({
          id: typeof node.id === "string" && node.id.length > 0 ? node.id : `migrated-node-${index}`,
          name: typeof node.name === "string" && node.name.length > 0 ? node.name : `Migrated Node ${index + 1}`,
          parentId: typeof node.parentId === "string" ? node.parentId : null,
          position: isRecord(node.transform) && isFiniteTuple(node.transform.position, 3)
            ? node.transform.position
            : isFiniteTuple(node.position, 3)
              ? node.position
              : [0, 0, 0],
          material: isRecord(node.material) ? node.material as EditorNodeMaterialDraft : undefined,
          mesh: isRecord(node.mesh) ? node.mesh as unknown as EditorNodeMesh : undefined,
          light: isRecord(node.light) ? node.light as unknown as EditorNodeLight : undefined,
          camera: isRecord(node.camera) ? node.camera as unknown as EditorNodeCamera : undefined,
          physics: isRecord(node.physics) ? node.physics as unknown as EditorNodePhysics : undefined,
          animation: isRecord(node.animation) ? node.animation as unknown as EditorNodeAnimation : undefined,
          audio: isRecord(node.audio) ? node.audio as unknown as EditorNodeAudio : undefined,
          particleEmitter: isRecord(node.particleEmitter) ? node.particleEmitter as unknown as EditorNodeParticleEmitter : undefined,
          script: isRecord(node.script) ? node.script as unknown as EditorNodeScript : undefined
        }))
      : base.scene.nodes;
    const importSettings = isRecord(source.importSettings) ? source.importSettings : {};
    const exportSettings = isRecord(source.export) ? source.export : {};
    return {
      ...base,
      version: EDITOR_PROJECT_VERSION,
      metadata: {
        name: typeof metadata.name === "string" ? metadata.name : base.metadata.name,
        savedAt: typeof metadata.savedAt === "string" ? metadata.savedAt : base.metadata.savedAt,
        provenance: base.metadata.provenance
      },
      scene: { nodes },
      prefabs: [],
      assets: Array.isArray(source.assets) ? source.assets.filter(isRecord).map((asset, index) => ({
        id: typeof asset.id === "string" && asset.id.length > 0 ? asset.id : `migrated-asset-${index}`,
        name: typeof asset.name === "string" && asset.name.length > 0 ? asset.name : `Migrated Asset ${index + 1}`,
        type: asset.type === "texture" || asset.type === "material" ? asset.type : "gltf",
        uri: typeof asset.uri === "string" && asset.uri.length > 0 ? asset.uri : `migrated-asset-${index}.gltf`,
        importedAt: typeof asset.importedAt === "string" ? asset.importedAt : base.metadata.savedAt,
        preview: typeof asset.preview === "string" ? asset.preview : "Migrated asset",
        diagnostics: Array.isArray(asset.diagnostics) ? asset.diagnostics.map(String) : ["Migrated from v0 project"],
        folder: typeof asset.folder === "string" ? asset.folder : "Migrated",
        status: asset.status === "error" || asset.status === "warning" || asset.status === "imported" ? asset.status : "warning",
        thumbnailColor: typeof asset.thumbnailColor === "string" ? asset.thumbnailColor : "#38d99f",
        dependencies: Array.isArray(asset.dependencies) ? asset.dependencies.map(String) : [],
        variants: Array.isArray(asset.variants) ? asset.variants.map(String) : [],
        animationClips: Array.isArray(asset.animationClips)
          ? asset.animationClips.filter(isRecord).map((clip, clipIndex) => ({
              name: typeof clip.name === "string" && clip.name.length > 0 ? clip.name : `clip-${clipIndex}`,
              duration: typeof clip.duration === "number" && Number.isFinite(clip.duration) ? clip.duration : 0
            }))
          : [],
        revision: typeof asset.revision === "number" && Number.isFinite(asset.revision) ? asset.revision : 1,
        cacheKey: typeof asset.cacheKey === "string" && asset.cacheKey.length > 0 ? asset.cacheKey : `${typeof asset.uri === "string" ? asset.uri : `migrated-asset-${index}.gltf`}#rev-1`
      })) : base.assets,
      importSettings: {
        ...base.importSettings,
        ...importSettings
      },
      plugins: Array.isArray(source.plugins) ? source.plugins.map(String) : base.plugins,
      export: {
        title: typeof exportSettings.title === "string" ? exportSettings.title : base.export.title,
        entryNodeId: typeof exportSettings.entryNodeId === "string" || exportSettings.entryNodeId === null ? exportSettings.entryNodeId : base.export.entryNodeId
      }
    };
  }
}

export function createProjectNode(options: {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number, number];
  readonly scale?: readonly [number, number, number];
  readonly material?: EditorNodeMaterialDraft;
  readonly mesh?: EditorNodeMesh;
  readonly light?: EditorNodeLight;
  readonly camera?: EditorNodeCamera;
  readonly physics?: EditorNodePhysics;
  readonly animation?: EditorNodeAnimation;
  readonly audio?: EditorNodeAudio;
  readonly particleEmitter?: EditorNodeParticleEmitter;
  readonly script?: EditorNodeScript;
}): EditorProjectNode {
  return {
    id: options.id,
    name: options.name,
    parentId: options.parentId,
    transform: {
      position: options.position ?? [0, 0, 0],
      rotation: options.rotation ?? [0, 0, 0, 1],
      scale: options.scale ?? [1, 1, 1]
    },
    material: normalizeMaterial(options.material ?? { name: "Default Material", baseColor: "#9ecbff", metallic: 0, roughness: 0.5 } as EditorNodeMaterial),
    mesh: options.mesh ?? { enabled: true, assetId: null, primitive: "cube" },
    light: options.light ?? { kind: "none", intensity: 0 },
    camera: options.camera ?? { enabled: false, fov: 60 },
    physics: normalizePhysics(options.physics),
    animation: options.animation ?? { enabled: false, clip: "", loop: true },
    audio: options.audio ?? { source: "", listener: false, volume: 1 },
    particleEmitter: normalizeParticleEmitter(options.particleEmitter),
    script: options.script ?? { behavior: "", enabled: false }
  };
}

function normalizePhysics(physics: EditorNodePhysics | undefined): EditorNodePhysics {
  const friction = physics?.friction;
  const restitution = physics?.restitution;
  return {
    body: physics?.body ?? "none",
    collider: physics?.collider ?? "none",
    friction: typeof friction === "number" && Number.isFinite(friction) ? friction : 0.5,
    restitution: typeof restitution === "number" && Number.isFinite(restitution) ? restitution : 0
  };
}

function normalizeParticleEmitter(emitter: EditorNodeParticleEmitter | undefined): EditorNodeParticleEmitter {
  return {
    enabled: emitter?.enabled ?? false,
    preset: emitter?.preset === "fire" || emitter?.preset === "fountain" || emitter?.preset === "collision-burst" ? emitter.preset : "none",
    emissionRate: finiteOrDefault(emitter?.emissionRate, 24),
    maxParticles: Math.max(1, Math.round(finiteOrDefault(emitter?.maxParticles, 160))),
    lifetime: Math.max(0.05, finiteOrDefault(emitter?.lifetime, 1.2)),
    speed: Math.max(0, finiteOrDefault(emitter?.speed, 2.4)),
    looping: emitter?.looping ?? true
  };
}

function normalizeProject(project: EditorProject): EditorProject {
  return {
    ...project,
    scene: {
      nodes: project.scene.nodes.map((node) => ({
        ...createProjectNode({
          id: node.id,
          name: node.name,
          parentId: node.parentId,
          position: node.transform.position,
          material: node.material,
          mesh: node.mesh,
          light: node.light,
          camera: node.camera,
          physics: node.physics,
          animation: node.animation,
          audio: node.audio,
          particleEmitter: node.particleEmitter,
          script: node.script
        }),
        transform: {
          position: node.transform.position,
          rotation: node.transform.rotation,
          scale: node.transform.scale
        }
      }))
    },
    assets: project.assets.map((asset) => ({
      ...asset,
      status: asset.status ?? (asset.diagnostics.length > 0 ? "warning" : "imported"),
      folder: asset.folder ?? "Imported",
      thumbnailColor: asset.thumbnailColor ?? "#38d99f",
      dependencies: asset.dependencies ?? [],
      variants: asset.variants ?? [],
      animationClips: asset.animationClips ?? [],
      revision: asset.revision ?? 1,
      cacheKey: asset.cacheKey ?? `${asset.uri}#rev-${asset.revision ?? 1}`
    })),
    prefabs: (project.prefabs ?? []).map((prefab) => ({
      ...prefab,
      nodes: prefab.nodes.map((node) => ({
        ...createProjectNode({
          id: node.id,
          name: node.name,
          parentId: node.parentId,
          position: node.transform.position,
          material: node.material,
          mesh: node.mesh,
          light: node.light,
          camera: node.camera,
          physics: node.physics,
          animation: node.animation,
          audio: node.audio,
          particleEmitter: node.particleEmitter,
          script: node.script
        }),
        transform: {
          position: node.transform.position,
          rotation: node.transform.rotation,
          scale: node.transform.scale
        }
      }))
    })),
    importSettings: {
      ...defaultImportSettings,
      ...project.importSettings
    }
  };
}

function normalizeMaterial(material: EditorNodeMaterialDraft): EditorNodeMaterial {
  return {
    ...material,
    textureSlots: {
      baseColor: material.textureSlots?.baseColor ?? "",
      normal: material.textureSlots?.normal ?? "",
      metallicRoughness: material.textureSlots?.metallicRoughness ?? "",
      emissive: material.textureSlots?.emissive ?? ""
    }
  };
}

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mustGet<T>(map: ReadonlyMap<string, T>, key: string): T {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing project node: ${key}`);
  }
  return value;
}

function assertFiniteTuple(value: readonly number[], length: number, label: string): void {
  if (value.length !== length || value.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`Project tuple ${label} must contain ${length} finite numbers.`);
  }
}

function isFiniteTuple(value: unknown, length: number): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === length && value.every((entry) => Number.isFinite(entry));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateProvenance(provenance: EditorProjectProvenance): void {
  if (
    provenance.authoringTool !== "aura3d-browser-editor" ||
    provenance.workflow !== "editor-import-save-export" ||
    provenance.runtimePackage !== "@aura3d/editor-runtime"
  ) {
    throw new Error("Editor project provenance must identify the Aura3D browser editor workflow.");
  }
  if (provenance.operations.length === 0) {
    throw new Error("Editor project provenance must include at least one authoring operation.");
  }
  for (const operation of provenance.operations) {
    if (!operation.id || !operation.runtimeApi || !operation.target) {
      throw new Error("Editor project provenance operations require id, runtimeApi, and target.");
    }
  }
  const expected = computeProvenanceHash({ ...provenance, evidenceHash: "" });
  if (provenance.evidenceHash !== expected) {
    throw new Error("Editor project provenance evidenceHash does not match its operation log.");
  }
}

function computeProvenanceHash(provenance: Omit<EditorProjectProvenance, "evidenceHash"> | EditorProjectProvenance): string {
  const source = JSON.stringify({
    authoringTool: provenance.authoringTool,
    workflow: provenance.workflow,
    runtimePackage: provenance.runtimePackage,
    operations: provenance.operations
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `a3d-prov-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

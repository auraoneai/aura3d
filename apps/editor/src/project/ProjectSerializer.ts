import { Scene, SceneNode } from "@galileo3d/scene";

export const EDITOR_PROJECT_VERSION = 1;

export interface EditorImportSettings {
  readonly colorSpace: "srgb" | "linear";
  readonly generateMipmaps: boolean;
  readonly compression: "none" | "ktx2";
  readonly scale: number;
  readonly importNormals: boolean;
  readonly importTangents: boolean;
  readonly importAnimations: boolean;
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
}

export interface EditorProvenanceOperation {
  readonly id: string;
  readonly runtimeApi: string;
  readonly target: string;
}

export interface EditorProjectProvenance {
  readonly authoringTool: "galileo3d-browser-editor";
  readonly workflow: "editor-import-save-export";
  readonly runtimePackage: "@galileo3d/editor-runtime";
  readonly operations: readonly EditorProvenanceOperation[];
  readonly evidenceHash: string;
}

export interface EditorNodeMaterial {
  readonly name: string;
  readonly baseColor: string;
  readonly metallic: number;
  readonly roughness: number;
}

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
}

export interface EditorNodeScript {
  readonly behavior: string;
  readonly enabled: boolean;
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
  readonly light: EditorNodeLight;
  readonly camera: EditorNodeCamera;
  readonly physics: EditorNodePhysics;
  readonly script: EditorNodeScript;
}

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
  importNormals: true,
  importTangents: true,
  importAnimations: true,
  materialVariants: true
};

export class ProjectSerializer {
  createDefaultProject(now = new Date("2026-01-01T00:00:00.000Z")): EditorProject {
    return {
      version: EDITOR_PROJECT_VERSION,
      metadata: {
        name: "Untitled Galileo3D Scene",
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
            physics: { body: "static", collider: "box" },
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
      assets: [],
      importSettings: { ...defaultImportSettings },
      plugins: ["galileo.default-authoring"],
      export: {
        title: "Galileo3D Editor Export",
        entryNodeId: "node-hero"
      }
    };
  }

  serialize(project: EditorProject): string {
    this.validate(project);
    return JSON.stringify(project, null, 2);
  }

  parse(source: string): EditorProject {
    const parsed = JSON.parse(source) as EditorProject;
    this.validate(parsed);
    return parsed;
  }

  clone(project: EditorProject): EditorProject {
    return this.parse(this.serialize(project));
  }

  createEditorProvenance(operations: readonly EditorProvenanceOperation[]): EditorProjectProvenance {
    const provenance = {
      authoringTool: "galileo3d-browser-editor" as const,
      workflow: "editor-import-save-export" as const,
      runtimePackage: "@galileo3d/editor-runtime" as const,
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
    if (project.importSettings.scale <= 0 || !Number.isFinite(project.importSettings.scale)) {
      throw new Error("Editor import scale must be a positive finite number.");
    }
    if (project.metadata.provenance) {
      validateProvenance(project.metadata.provenance);
    }
  }
}

export function createProjectNode(options: {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly position?: readonly [number, number, number];
  readonly material?: EditorNodeMaterial;
  readonly light?: EditorNodeLight;
  readonly camera?: EditorNodeCamera;
  readonly physics?: EditorNodePhysics;
  readonly script?: EditorNodeScript;
}): EditorProjectNode {
  return {
    id: options.id,
    name: options.name,
    parentId: options.parentId,
    transform: {
      position: options.position ?? [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    },
    material: options.material ?? { name: "Default Material", baseColor: "#9ecbff", metallic: 0, roughness: 0.5 },
    light: options.light ?? { kind: "none", intensity: 0 },
    camera: options.camera ?? { enabled: false, fov: 60 },
    physics: options.physics ?? { body: "none", collider: "none" },
    script: options.script ?? { behavior: "", enabled: false }
  };
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

function validateProvenance(provenance: EditorProjectProvenance): void {
  if (
    provenance.authoringTool !== "galileo3d-browser-editor" ||
    provenance.workflow !== "editor-import-save-export" ||
    provenance.runtimePackage !== "@galileo3d/editor-runtime"
  ) {
    throw new Error("Editor project provenance must identify the Galileo3D browser editor workflow.");
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
  return `g3d-prov-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

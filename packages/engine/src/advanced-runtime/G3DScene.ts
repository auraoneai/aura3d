import { Scene, type Mesh, type MeshOptions } from "@galileo3d/scene";
import type { RenderSource, Geometry, RenderMaterial, MorphTargetDelta } from "@galileo3d/rendering";

export interface G3DSceneMeshOptions extends Omit<MeshOptions, "renderable"> {
  readonly geometry: string | Geometry;
  readonly material: string | RenderMaterial;
  readonly geometryId?: string;
  readonly materialId?: string;
}

export interface G3DSceneRenderSourceOptions extends Omit<RenderSource, "scene" | "geometryLibrary" | "materialLibrary" | "morphTargetLibrary"> {
  readonly geometryLibrary?: RenderSource["geometryLibrary"];
  readonly materialLibrary?: RenderSource["materialLibrary"];
  readonly morphTargetLibrary?: RenderSource["morphTargetLibrary"];
}

export class G3DScene extends Scene {
  readonly geometryLibrary = new Map<string, Geometry>();
  readonly materialLibrary = new Map<string, RenderMaterial>();
  readonly morphTargetLibrary = new Map<string, readonly MorphTargetDelta[]>();

  private generatedGeometryId = 0;
  private generatedMaterialId = 0;

  addGeometry(id: string, geometry: Geometry): this {
    if (!id.trim()) throw new Error("G3DScene geometry id is required.");
    this.geometryLibrary.set(id, geometry);
    return this;
  }

  addMaterial(id: string, material: RenderMaterial): this {
    if (!id.trim()) throw new Error("G3DScene material id is required.");
    this.materialLibrary.set(id, material);
    return this;
  }

  addMorphTargets(id: string, morphTargets: readonly MorphTargetDelta[]): this {
    if (!id.trim()) throw new Error("G3DScene morph target id is required.");
    this.morphTargetLibrary.set(id, morphTargets);
    return this;
  }

  createRenderableMesh(options: G3DSceneMeshOptions): Mesh {
    const geometry = this.resolveGeometryHandle(options.geometry, options.geometryId);
    const material = this.resolveMaterialHandle(options.material, options.materialId);
    const mesh = this.createMesh({
      ...options,
      renderable: { geometry, material }
    });
    this.root.addChild(mesh);
    return mesh;
  }

  toRenderSource(options: G3DSceneRenderSourceOptions = {}): RenderSource {
    return {
      cameraPolicy: "auto-frame",
      frustumCulling: true,
      ...options,
      scene: this,
      geometryLibrary: options.geometryLibrary ?? this.geometryLibrary,
      materialLibrary: options.materialLibrary ?? this.materialLibrary,
      morphTargetLibrary: options.morphTargetLibrary ?? this.morphTargetLibrary
    };
  }

  override dispose(): void {
    super.dispose();
    for (const geometry of this.geometryLibrary.values()) geometry.dispose();
    for (const material of this.materialLibrary.values()) {
      if (isDisposableResource(material)) material.dispose();
    }
    this.geometryLibrary.clear();
    this.materialLibrary.clear();
    this.morphTargetLibrary.clear();
  }

  private resolveGeometryHandle(geometry: string | Geometry, preferredId?: string): string {
    if (typeof geometry === "string") {
      if (!this.geometryLibrary.has(geometry)) throw new Error(`G3DScene missing geometry resource: ${geometry}`);
      return geometry;
    }
    const id = preferredId ?? `geometry:${++this.generatedGeometryId}`;
    this.addGeometry(id, geometry);
    return id;
  }

  private resolveMaterialHandle(material: string | RenderMaterial, preferredId?: string): string {
    if (typeof material === "string") {
      if (!this.materialLibrary.has(material)) throw new Error(`G3DScene missing material resource: ${material}`);
      return material;
    }
    const id = preferredId ?? `material:${++this.generatedMaterialId}`;
    this.addMaterial(id, material);
    return id;
  }
}

function isDisposableResource(value: unknown): value is { dispose(): void } {
  return typeof value === "object" && value !== null && "dispose" in value && typeof value.dispose === "function";
}

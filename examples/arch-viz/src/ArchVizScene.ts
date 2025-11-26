/**
 * G3D Architectural Visualization - Scene Setup
 * Creates a modern architectural environment with PBR materials
 */

import { Vector3, Color, Quaternion } from 'g3d';
import { MaterialLibrary, PBRMaterialParams } from './MaterialLibrary';
import { LightingController } from './LightingController';

export interface GeometryData {
  vertices: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export interface MeshObject {
  geometry: GeometryData;
  material: PBRMaterialParams;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  castShadow: boolean;
  receiveShadow: boolean;
}

/**
 * Architectural scene with modern house model
 */
export class ArchVizScene {
  private meshes: MeshObject[] = [];
  private materialLibrary: MaterialLibrary;
  private lightingController: LightingController;

  constructor(materialLibrary: MaterialLibrary, lightingController: LightingController) {
    this.materialLibrary = materialLibrary;
    this.lightingController = lightingController;
    this.buildScene();
  }

  /**
   * Build the complete architectural scene
   */
  private buildScene(): void {
    this.createFoundation();
    this.createWalls();
    this.createFloor();
    this.createCeiling();
    this.createWindows();
    this.createDoors();
    this.createFurniture();
    this.createKitchen();
    this.createBathroom();
    this.createExteriorElements();
  }

  /**
   * Create foundation/base
   */
  private createFoundation(): void {
    const foundation = this.createBox(
      new Vector3(12.5, 0.3, 12.5),
      new Vector3(0, -0.15, 0)
    );

    this.meshes.push({
      geometry: foundation,
      material: this.materialLibrary.getMaterial('concrete')!,
      position: new Vector3(0, -0.15, 0),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: false,
      receiveShadow: true,
    });
  }

  /**
   * Create walls
   */
  private createWalls(): void {
    const wallHeight = 3.0;
    const wallThickness = 0.2;

    // North wall
    const northWall = this.createBox(
      new Vector3(12, wallHeight, wallThickness),
      new Vector3(0, wallHeight / 2, -6)
    );

    this.meshes.push({
      geometry: northWall,
      material: this.materialLibrary.getMaterial('concrete')!,
      position: new Vector3(0, wallHeight / 2, -6),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // South wall (with large windows)
    const southWall1 = this.createBox(
      new Vector3(3, wallHeight, wallThickness),
      new Vector3(-4.5, wallHeight / 2, 6)
    );

    this.meshes.push({
      geometry: southWall1,
      material: this.materialLibrary.getMaterial('concrete')!,
      position: new Vector3(-4.5, wallHeight / 2, 6),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    const southWall2 = this.createBox(
      new Vector3(3, wallHeight, wallThickness),
      new Vector3(4.5, wallHeight / 2, 6)
    );

    this.meshes.push({
      geometry: southWall2,
      material: this.materialLibrary.getMaterial('concrete')!,
      position: new Vector3(4.5, wallHeight / 2, 6),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // East wall
    const eastWall = this.createBox(
      new Vector3(wallThickness, wallHeight, 12),
      new Vector3(6, wallHeight / 2, 0)
    );

    this.meshes.push({
      geometry: eastWall,
      material: this.materialLibrary.getMaterial('concrete')!,
      position: new Vector3(6, wallHeight / 2, 0),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // West wall
    const westWall = this.createBox(
      new Vector3(wallThickness, wallHeight, 12),
      new Vector3(-6, wallHeight / 2, 0)
    );

    this.meshes.push({
      geometry: westWall,
      material: this.materialLibrary.getMaterial('concrete')!,
      position: new Vector3(-6, wallHeight / 2, 0),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // Interior dividing walls
    this.createInteriorWalls(wallHeight, wallThickness);
  }

  /**
   * Create interior partition walls
   */
  private createInteriorWalls(height: number, thickness: number): void {
    // Living room / Kitchen divider
    const divider1 = this.createBox(
      new Vector3(thickness, height, 4),
      new Vector3(-2, height / 2, 2)
    );

    this.meshes.push({
      geometry: divider1,
      material: this.materialLibrary.getMaterial('concrete')!,
      position: new Vector3(-2, height / 2, 2),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // Bedroom wall
    const divider2 = this.createBox(
      new Vector3(6, height, thickness),
      new Vector3(3, height / 2, -2)
    );

    this.meshes.push({
      geometry: divider2,
      material: this.materialLibrary.getMaterial('concrete')!,
      position: new Vector3(3, height / 2, -2),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });
  }

  /**
   * Create floor
   */
  private createFloor(): void {
    const floor = this.createBox(
      new Vector3(12, 0.1, 12),
      new Vector3(0, 0.05, 0)
    );

    this.meshes.push({
      geometry: floor,
      material: this.materialLibrary.getMaterial('oak')!,
      position: new Vector3(0, 0.05, 0),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: false,
      receiveShadow: true,
    });
  }

  /**
   * Create ceiling
   */
  private createCeiling(): void {
    const ceiling = this.createBox(
      new Vector3(12, 0.1, 12),
      new Vector3(0, 3, 0)
    );

    this.meshes.push({
      geometry: ceiling,
      material: this.materialLibrary.getMaterial('ceramic_white')!,
      position: new Vector3(0, 3, 0),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: false,
      receiveShadow: false,
    });
  }

  /**
   * Create windows
   */
  private createWindows(): void {
    // Large south-facing windows
    const windowGeometry = this.createBox(
      new Vector3(5, 2, 0.05),
      new Vector3(0, 1.5, 6)
    );

    this.meshes.push({
      geometry: windowGeometry,
      material: this.materialLibrary.getMaterial('glass_clear')!,
      position: new Vector3(0, 1.5, 6),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: false,
      receiveShadow: false,
    });

    // East bedroom window
    const bedroomWindow = this.createBox(
      new Vector3(0.05, 1.2, 2),
      new Vector3(6, 1.6, -3)
    );

    this.meshes.push({
      geometry: bedroomWindow,
      material: this.materialLibrary.getMaterial('glass_clear')!,
      position: new Vector3(6, 1.6, -3),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: false,
      receiveShadow: false,
    });
  }

  /**
   * Create doors
   */
  private createDoors(): void {
    // Front door
    const door = this.createBox(
      new Vector3(0.9, 2.1, 0.05),
      new Vector3(-3, 1.05, -6)
    );

    this.meshes.push({
      geometry: door,
      material: this.materialLibrary.getMaterial('walnut')!,
      position: new Vector3(-3, 1.05, -6),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // Door handle
    const handle = this.createBox(
      new Vector3(0.15, 0.05, 0.1),
      new Vector3(-2.6, 1.05, -5.95)
    );

    this.meshes.push({
      geometry: handle,
      material: this.materialLibrary.getMaterial('brass')!,
      position: new Vector3(-2.6, 1.05, -5.95),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: false,
    });
  }

  /**
   * Create furniture
   */
  private createFurniture(): void {
    // Living room sofa
    const sofa = this.createBox(
      new Vector3(2, 0.8, 0.9),
      new Vector3(1, 0.4, 3)
    );

    this.meshes.push({
      geometry: sofa,
      material: this.materialLibrary.getMaterial('velvet')!,
      position: new Vector3(1, 0.4, 3),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // Coffee table
    const coffeeTable = this.createBox(
      new Vector3(1.2, 0.4, 0.6),
      new Vector3(1, 0.2, 1.5)
    );

    this.meshes.push({
      geometry: coffeeTable,
      material: this.materialLibrary.getMaterial('glass_clear')!,
      position: new Vector3(1, 0.2, 1.5),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // Table legs
    this.createTableLegs(new Vector3(1, 0, 1.5), 0.4, 0.05);

    // Bedroom bed
    const bed = this.createBox(
      new Vector3(2, 0.5, 2),
      new Vector3(4, 0.25, -4)
    );

    this.meshes.push({
      geometry: bed,
      material: this.materialLibrary.getMaterial('cotton')!,
      position: new Vector3(4, 0.25, -4),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // Nightstand
    const nightstand = this.createBox(
      new Vector3(0.5, 0.5, 0.4),
      new Vector3(2.5, 0.25, -4.5)
    );

    this.meshes.push({
      geometry: nightstand,
      material: this.materialLibrary.getMaterial('walnut')!,
      position: new Vector3(2.5, 0.25, -4.5),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });
  }

  /**
   * Create kitchen elements
   */
  private createKitchen(): void {
    // Kitchen counter
    const counter = this.createBox(
      new Vector3(3, 0.9, 0.6),
      new Vector3(-4, 0.45, 2)
    );

    this.meshes.push({
      geometry: counter,
      material: this.materialLibrary.getMaterial('granite_black')!,
      position: new Vector3(-4, 0.45, 2),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // Upper cabinets
    const cabinet = this.createBox(
      new Vector3(3, 0.7, 0.35),
      new Vector3(-4, 2.2, 2)
    );

    this.meshes.push({
      geometry: cabinet,
      material: this.materialLibrary.getMaterial('oak')!,
      position: new Vector3(-4, 2.2, 2),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // Kitchen sink
    const sink = this.createBox(
      new Vector3(0.6, 0.15, 0.4),
      new Vector3(-3.5, 0.9, 2)
    );

    this.meshes.push({
      geometry: sink,
      material: this.materialLibrary.getMaterial('steel_brushed')!,
      position: new Vector3(-3.5, 0.9, 2),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });
  }

  /**
   * Create bathroom elements
   */
  private createBathroom(): void {
    // Bathroom vanity
    const vanity = this.createBox(
      new Vector3(1.2, 0.8, 0.5),
      new Vector3(-4, 0.4, -4)
    );

    this.meshes.push({
      geometry: vanity,
      material: this.materialLibrary.getMaterial('marble_carrara')!,
      position: new Vector3(-4, 0.4, -4),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: true,
      receiveShadow: true,
    });

    // Mirror
    const mirror = this.createBox(
      new Vector3(1, 1.2, 0.05),
      new Vector3(-4, 1.8, -4.3)
    );

    this.meshes.push({
      geometry: mirror,
      material: this.materialLibrary.getMaterial('chrome')!,
      position: new Vector3(-4, 1.8, -4.3),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: false,
      receiveShadow: false,
    });
  }

  /**
   * Create exterior elements
   */
  private createExteriorElements(): void {
    // Ground plane
    const ground = this.createBox(
      new Vector3(50, 0.1, 50),
      new Vector3(0, -0.3, 0)
    );

    this.meshes.push({
      geometry: ground,
      material: this.materialLibrary.getMaterial('concrete')!,
      position: new Vector3(0, -0.3, 0),
      rotation: Quaternion.identity(),
      scale: Vector3.one(),
      castShadow: false,
      receiveShadow: true,
    });
  }

  /**
   * Create table legs
   */
  private createTableLegs(center: Vector3, height: number, thickness: number): void {
    const offsets = [
      new Vector3(-0.5, 0, -0.25),
      new Vector3(0.5, 0, -0.25),
      new Vector3(-0.5, 0, 0.25),
      new Vector3(0.5, 0, 0.25),
    ];

    offsets.forEach(offset => {
      const leg = this.createBox(
        new Vector3(thickness, height, thickness),
        center.clone().add(offset).add(new Vector3(0, height / 2, 0))
      );

      this.meshes.push({
        geometry: leg,
        material: this.materialLibrary.getMaterial('metal_black')!,
        position: center.clone().add(offset).add(new Vector3(0, height / 2, 0)),
        rotation: Quaternion.identity(),
        scale: Vector3.one(),
        castShadow: true,
        receiveShadow: true,
      });
    });
  }

  /**
   * Create box geometry
   */
  private createBox(size: Vector3, position: Vector3): GeometryData {
    const w = size.x / 2;
    const h = size.y / 2;
    const d = size.z / 2;

    const vertices = new Float32Array([
      // Front face
      -w, -h, d,  w, -h, d,  w, h, d,  -w, h, d,
      // Back face
      w, -h, -d,  -w, -h, -d,  -w, h, -d,  w, h, -d,
      // Top face
      -w, h, d,  w, h, d,  w, h, -d,  -w, h, -d,
      // Bottom face
      -w, -h, -d,  w, -h, -d,  w, -h, d,  -w, -h, d,
      // Right face
      w, -h, d,  w, -h, -d,  w, h, -d,  w, h, d,
      // Left face
      -w, -h, -d,  -w, -h, d,  -w, h, d,  -w, h, -d,
    ]);

    const normals = new Float32Array([
      // Front
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      // Back
      0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
      // Top
      0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
      // Bottom
      0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
      // Right
      1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
      // Left
      -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
    ]);

    const uvs = new Float32Array([
      0, 0,  1, 0,  1, 1,  0, 1,
      0, 0,  1, 0,  1, 1,  0, 1,
      0, 0,  1, 0,  1, 1,  0, 1,
      0, 0,  1, 0,  1, 1,  0, 1,
      0, 0,  1, 0,  1, 1,  0, 1,
      0, 0,  1, 0,  1, 1,  0, 1,
    ]);

    const indices = new Uint32Array([
      0, 1, 2,  0, 2, 3,    // Front
      4, 5, 6,  4, 6, 7,    // Back
      8, 9, 10,  8, 10, 11,  // Top
      12, 13, 14,  12, 14, 15, // Bottom
      16, 17, 18,  16, 18, 19, // Right
      20, 21, 22,  20, 22, 23, // Left
    ]);

    return { vertices, normals, uvs, indices };
  }

  /**
   * Get all mesh objects
   */
  getMeshes(): MeshObject[] {
    return this.meshes;
  }

  /**
   * Get mesh count
   */
  getMeshCount(): number {
    return this.meshes.length;
  }

  /**
   * Get total vertex count
   */
  getVertexCount(): number {
    return this.meshes.reduce((sum, mesh) => {
      return sum + mesh.geometry.vertices.length / 3;
    }, 0);
  }

  /**
   * Get total triangle count
   */
  getTriangleCount(): number {
    return this.meshes.reduce((sum, mesh) => {
      return sum + mesh.geometry.indices.length / 3;
    }, 0);
  }
}

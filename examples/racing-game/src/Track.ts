/**
 * Track.ts - Race Track
 *
 * Complete race track system with:
 * - Spline-based track generation
 * - Checkpoints and lap detection
 * - Track boundaries and collision
 * - Terrain integration
 * - Environment props (barriers, trees, buildings)
 * - Racing line visualization
 */

import { Vector3, Quaternion, Matrix4 } from 'g3d';
import { CatmullRomSpline } from 'g3d';
import { GeometryGenerator, MeshBuilder } from 'g3d';
import { Scene, SceneNode } from 'g3d';
import { StandardPBRMaterial, Color } from 'g3d';

export interface CheckpointData {
  position: Vector3;
  rotation: Quaternion;
  width: number;
  index: number;
}

export interface TrackConfig {
  name: string;
  lapCount: number;
  checkpointCount: number;
  trackWidth: number;
  terrainSize: Vector3;
}

export class Track {
  public name: string;
  public lapCount: number;
  public trackWidth: number;

  // Track geometry
  private centerline: CatmullRomSpline;
  private checkpoints: CheckpointData[];
  private startPosition: Vector3;
  private startRotation: Quaternion;

  // Scene nodes
  private trackMesh?: SceneNode;
  private environmentNodes: SceneNode[];
  private boundaryNodes: SceneNode[];

  // Racing line (AI hint)
  private racingLine: Vector3[];

  constructor(config: TrackConfig) {
    this.name = config.name;
    this.lapCount = config.lapCount;
    this.trackWidth = config.trackWidth;
    this.checkpoints = [];
    this.environmentNodes = [];
    this.boundaryNodes = [];
    this.racingLine = [];

    // Generate track based on config
    this.generateTrack(config);
  }

  /**
   * Generate race track
   */
  private generateTrack(config: TrackConfig): void {
    // Create control points for track spline
    const controlPoints = this.createTrackControlPoints();

    // Create centerline spline
    this.centerline = new CatmullRomSpline(controlPoints);
    this.centerline.closed = true;
    this.centerline.tension = 0.5;

    // Set start position (first point on track)
    this.startPosition = this.centerline.getPoint(0);
    const tangent = this.centerline.getTangent(0);
    this.startRotation = Quaternion.lookRotation(tangent, Vector3.up());

    // Generate checkpoints
    this.generateCheckpoints(config.checkpointCount);

    // Generate racing line
    this.generateRacingLine();
  }

  /**
   * Create track control points
   * This creates a figure-8 style track with elevation changes
   */
  private createTrackControlPoints(): Vector3[] {
    const points: Vector3[] = [];
    const radius = 100;

    // Main loop
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Add elevation variation
      let y = 0;
      if (i >= 3 && i <= 6) {
        y = 10; // Hill section
      } else if (i >= 9 && i <= 11) {
        y = -5; // Dip section
      }

      points.push(new Vector3(x, y, z));
    }

    // Add chicane section
    points.push(new Vector3(radius + 20, 0, 0));
    points.push(new Vector3(radius + 30, 0, 10));
    points.push(new Vector3(radius + 40, 0, 0));
    points.push(new Vector3(radius + 30, 0, -10));

    return points;
  }

  /**
   * Generate evenly spaced checkpoints along track
   */
  private generateCheckpoints(count: number): void {
    this.checkpoints = [];

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const position = this.centerline.getPoint(t);
      const tangent = this.centerline.getTangent(t);
      const rotation = Quaternion.lookRotation(tangent, Vector3.up());

      this.checkpoints.push({
        position,
        rotation,
        width: this.trackWidth * 1.2,
        index: i
      });
    }
  }

  /**
   * Generate optimal racing line
   */
  private generateRacingLine(): void {
    this.racingLine = [];
    const samples = 200;

    for (let i = 0; i < samples; i++) {
      const t = i / samples;

      // Get point on centerline
      const centerPoint = this.centerline.getPoint(t);

      // Calculate track curvature
      const curvature = this.centerline.getCurvature(t);

      // Offset from center based on curvature (racing line)
      // Outside on entry, inside at apex, outside on exit
      const tangent = this.centerline.getTangent(t);
      const right = new Vector3(-tangent.z, 0, tangent.x).normalize();

      const offset = Math.sin(curvature * 10) * this.trackWidth * 0.3;
      const racingPoint = centerPoint.add(right.scale(offset));

      this.racingLine.push(racingPoint);
    }
  }

  /**
   * Build track mesh
   */
  public buildTrackMesh(scene: Scene): SceneNode {
    const meshBuilder = new MeshBuilder();

    // Generate track surface
    const trackSegments = 200;
    const vertices: Vector3[] = [];
    const normals: Vector3[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= trackSegments; i++) {
      const t = i / trackSegments;
      const position = this.centerline.getPoint(t);
      const tangent = this.centerline.getTangent(t);
      const right = new Vector3(-tangent.z, 0, tangent.x).normalize();

      const halfWidth = this.trackWidth / 2;

      // Left edge
      vertices.push(position.add(right.scale(-halfWidth)));
      normals.push(Vector3.up());
      uvs.push(0, t * 10);

      // Right edge
      vertices.push(position.add(right.scale(halfWidth)));
      normals.push(Vector3.up());
      uvs.push(1, t * 10);

      // Create quad faces (CCW winding when viewed from above)
      // Vertex layout per segment: index = i*2 for left edge, i*2+1 for right edge
      // base = left0, base+1 = right0, base+2 = left1 (next seg), base+3 = right1 (next seg)
      // CCW from +Y: left0 -> right0 -> right1 -> left1
      if (i < trackSegments) {
        const base = i * 2;
        // Triangle 1: left0 -> right0 -> left1 (CCW from above)
        indices.push(base, base + 1, base + 2);
        // Triangle 2: right0 -> right1 -> left1 (CCW from above)
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    meshBuilder.setVertices(vertices);
    meshBuilder.setNormals(normals);
    meshBuilder.setUVs(0, uvs);
    meshBuilder.setIndices(indices);

    const mesh = meshBuilder.build();
    this.trackMesh = new SceneNode('TrackMesh');
    this.trackMesh.setMesh(mesh);

    // Dark asphalt material for track
    const trackMaterial = new StandardPBRMaterial('TrackMaterial');
    trackMaterial.albedo = new Color(0.15, 0.15, 0.18);  // Dark asphalt
    trackMaterial.roughness = 0.8;
    trackMaterial.metallic = 0.0;
    this.trackMesh.setMaterial(trackMaterial);

    scene.addNode(this.trackMesh);

    // Add track boundaries
    this.buildTrackBoundaries(scene);

    // Add environment props
    this.buildEnvironment(scene);

    return this.trackMesh;
  }

  /**
   * Build track boundaries (barriers)
   */
  private buildTrackBoundaries(scene: Scene): void {
    const barrierHeight = 1.0;
    const barrierThickness = 0.2;

    const segments = 200;

    for (let side = -1; side <= 1; side += 2) {
      const meshBuilder = new MeshBuilder();
      const vertices: Vector3[] = [];
      const normals: Vector3[] = [];
      const indices: number[] = [];

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const position = this.centerline.getPoint(t);
        const tangent = this.centerline.getTangent(t);
        const right = new Vector3(-tangent.z, 0, tangent.x).normalize();

        const offset = side * (this.trackWidth / 2 + 1.0);
        const basePos = position.add(right.scale(offset));

        // Bottom vertices
        vertices.push(basePos);
        vertices.push(basePos.add(right.scale(side * barrierThickness)));

        // Top vertices
        vertices.push(basePos.add(new Vector3(0, barrierHeight, 0)));
        vertices.push(basePos.add(new Vector3(0, barrierHeight, 0)).add(right.scale(side * barrierThickness)));

        // Normals (facing inward)
        const normal = right.scale(-side);
        for (let j = 0; j < 4; j++) {
          normals.push(normal);
        }

        // Create quad
        if (i < segments) {
          const base = i * 4;
          // Front face
          indices.push(base, base + 2, base + 6);
          indices.push(base, base + 6, base + 4);
          // Top face
          indices.push(base + 2, base + 3, base + 7);
          indices.push(base + 2, base + 7, base + 6);
        }
      }

      meshBuilder.setVertices(vertices);
      meshBuilder.setNormals(normals);
      meshBuilder.setIndices(indices);

      const barrierMesh = meshBuilder.build();
      const barrierNode = new SceneNode(`Barrier_${side > 0 ? 'Right' : 'Left'}`);
      barrierNode.setMesh(barrierMesh);

      // Red/white barrier material
      const barrierMaterial = new StandardPBRMaterial(`BarrierMaterial_${side}`);
      barrierMaterial.albedo = side > 0 ? new Color(1, 0.2, 0.2) : new Color(1, 1, 1);  // Red or white
      barrierMaterial.roughness = 0.7;
      barrierMaterial.metallic = 0.0;
      barrierNode.setMaterial(barrierMaterial);

      scene.addNode(barrierNode);

      this.boundaryNodes.push(barrierNode);
    }
  }

  /**
   * Build environment decorations
   */
  private buildEnvironment(scene: Scene): void {
    // Add trees along outer edge
    this.addTrees(scene, 50);

    // Add grandstands near start/finish
    this.addGrandstand(scene, this.startPosition, this.startRotation);

    // Add pit buildings
    this.addPitBuilding(scene);

    // Add tire barriers at corners
    this.addTireBarriers(scene);
  }

  /**
   * Add trees around track
   */
  private addTrees(scene: Scene, count: number): void {
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const position = this.centerline.getPoint(t);
      const tangent = this.centerline.getTangent(t);
      const right = new Vector3(-tangent.z, 0, tangent.x).normalize();

      // Place trees outside track boundaries
      const side = (i % 2 === 0) ? -1 : 1;
      const distance = this.trackWidth / 2 + 5 + Math.random() * 10;

      const treePos = position.add(right.scale(side * distance));

      const tree = this.createTreeMesh();
      tree.setPosition(treePos);
      scene.addNode(tree);

      this.environmentNodes.push(tree);
    }
  }

  /**
   * Create simple tree mesh
   */
  private createTreeMesh(): SceneNode {
    const tree = new SceneNode('Tree');

    // Trunk (cylinder) - brown
    // cylinder(radius, height, radialSegments, heightSegments)
    const trunk = GeometryGenerator.cylinder(0.3, 3, 8, 1);
    const trunkNode = new SceneNode('Trunk');
    trunkNode.setMesh(trunk);
    trunkNode.setPosition(new Vector3(0, 1.5, 0));
    const trunkMaterial = new StandardPBRMaterial('TrunkMaterial');
    trunkMaterial.albedo = new Color(0.4, 0.25, 0.1);  // Brown bark
    trunkMaterial.roughness = 0.9;
    trunkNode.setMaterial(trunkMaterial);

    // Foliage (sphere) - green
    // sphere(radius, widthSegments, heightSegments)
    const foliage = GeometryGenerator.sphere(2, 16, 16);
    const foliageNode = new SceneNode('Foliage');
    foliageNode.setMesh(foliage);
    foliageNode.setPosition(new Vector3(0, 4, 0));
    const foliageMaterial = new StandardPBRMaterial('FoliageMaterial');
    foliageMaterial.albedo = new Color(0.1, 0.5, 0.15);  // Dark green
    foliageMaterial.roughness = 0.8;
    foliageNode.setMaterial(foliageMaterial);

    tree.addChild(trunkNode);
    tree.addChild(foliageNode);

    return tree;
  }

  /**
   * Add grandstand structure
   */
  private addGrandstand(scene: Scene, position: Vector3, rotation: Quaternion): void {
    const grandstand = new SceneNode('Grandstand');

    // Create tiered seating
    for (let tier = 0; tier < 5; tier++) {
      // box(width, height, depth)
      const box = GeometryGenerator.box(20, 1, 3);
      const tierNode = new SceneNode(`Tier_${tier}`);
      tierNode.setMesh(box);
      tierNode.setPosition(new Vector3(0, tier * 1.5, -tier * 2));
      grandstand.addChild(tierNode);
    }

    grandstand.setPosition(position.add(new Vector3(0, 0, 20)));
    grandstand.setRotation(rotation);
    scene.addNode(grandstand);

    this.environmentNodes.push(grandstand);
  }

  /**
   * Add pit building
   */
  private addPitBuilding(scene: Scene): void {
    const pitBuilding = new SceneNode('PitBuilding');

    // box(width, height, depth)
    const building = GeometryGenerator.box(30, 4, 8);
    pitBuilding.setMesh(building);

    const pitPos = this.startPosition.add(new Vector3(15, 2, 0));
    pitBuilding.setPosition(pitPos);

    scene.addNode(pitBuilding);
    this.environmentNodes.push(pitBuilding);
  }

  /**
   * Add tire barriers at sharp corners
   */
  private addTireBarriers(scene: Scene): void {
    // Find sharp corners by analyzing curvature
    const samples = 100;

    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      const curvature = Math.abs(this.centerline.getCurvature(t));

      // If curvature is high, add tire barrier
      if (curvature > 0.5) {
        const position = this.centerline.getPoint(t);
        const tangent = this.centerline.getTangent(t);
        const right = new Vector3(-tangent.z, 0, tangent.x).normalize();

        const barrierPos = position.add(right.scale(this.trackWidth / 2 + 2));

        const barrier = this.createTireBarrier();
        barrier.setPosition(barrierPos);
        scene.addNode(barrier);

        this.environmentNodes.push(barrier);
      }
    }
  }

  /**
   * Create tire barrier stack
   */
  private createTireBarrier(): SceneNode {
    const barrier = new SceneNode('TireBarrier');

    // Stack tires
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        // torus(radius, tubeRadius, radialSegments, tubularSegments)
        const tire = GeometryGenerator.torus(0.5, 0.2, 16, 32);
        const tireNode = new SceneNode(`Tire_${row}_${col}`);
        tireNode.setMesh(tire);
        tireNode.setPosition(new Vector3(col * 1.2, row * 0.4, 0));
        tireNode.setRotation(Quaternion.fromEuler(Math.PI / 2, 0, 0));
        barrier.addChild(tireNode);
      }
    }

    return barrier;
  }

  /**
   * Check if position passed through checkpoint
   */
  public checkCheckpoint(position: Vector3, lastCheckpoint: number): number | null {
    const nextCheckpoint = (lastCheckpoint + 1) % this.checkpoints.length;
    const checkpoint = this.checkpoints[nextCheckpoint];

    // Check if within checkpoint bounds
    const toPos = position.sub(checkpoint.position);
    const right = new Vector3(1, 0, 0).applyQuaternion(checkpoint.rotation);
    const forward = new Vector3(0, 0, -1).applyQuaternion(checkpoint.rotation);

    const lateralDist = Math.abs(toPos.dot(right));
    const forwardDist = toPos.dot(forward);

    if (lateralDist < checkpoint.width / 2 && forwardDist > -5 && forwardDist < 5) {
      return nextCheckpoint;
    }

    return null;
  }

  /**
   * Get closest point on racing line
   */
  public getClosestRacingLinePoint(position: Vector3): { point: Vector3; index: number } {
    let closestIndex = 0;
    let closestDist = Infinity;

    for (let i = 0; i < this.racingLine.length; i++) {
      const dist = position.distanceTo(this.racingLine[i]);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }

    return {
      point: this.racingLine[closestIndex],
      index: closestIndex
    };
  }

  /**
   * Get point ahead on racing line
   */
  public getRacingLinePointAhead(currentIndex: number, distance: number): Vector3 {
    const pointsAhead = Math.floor(distance / 2);
    const targetIndex = (currentIndex + pointsAhead) % this.racingLine.length;
    return this.racingLine[targetIndex];
  }

  /**
   * Get start position for vehicle
   */
  public getStartPosition(gridPosition: number): { position: Vector3; rotation: Quaternion } {
    const offset = new Vector3(-3 + (gridPosition % 2) * 6, 0, -gridPosition * 5);
    const position = this.startPosition.add(offset.applyQuaternion(this.startRotation));

    return { position, rotation: this.startRotation };
  }

  /**
   * Get track info
   */
  public getInfo() {
    return {
      name: this.name,
      lapCount: this.lapCount,
      checkpointCount: this.checkpoints.length,
      trackLength: this.centerline.getLength(),
      startPosition: this.startPosition,
      startRotation: this.startRotation
    };
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.environmentNodes.forEach(node => node.dispose());
    this.boundaryNodes.forEach(node => node.dispose());
    if (this.trackMesh) this.trackMesh.dispose();
  }
}

/**
 * ProceduralCarBuilder.ts - Sleek Sports Car Generator
 *
 * Creates realistic-looking sports car models using CAPSULES and SPHERES:
 * - Smooth aerodynamic body using capsule primitives
 * - Low, wide stance like a Lamborghini/Ferrari
 * - Proper proportions for a supercar
 * - Wheels with detailed rims
 * - Spoiler and aero elements
 */

import { SceneNode, GeometryGenerator } from 'g3d';
import { Vector3, Quaternion } from 'g3d';
import { StandardPBRMaterial, Color } from 'g3d';

/**
 * Car style configuration
 */
export interface CarStyle {
  type: 'sports' | 'muscle' | 'supercar' | 'rally';
  length: number;
  width: number;
  height: number;
  groundClearance: number;
  hoodLength: number;
  cabinPosition: number;
  spoilerHeight: number;
}

/**
 * Pre-defined car styles - SLEEK LOW-PROFILE SPORTS CARS
 */
export const CAR_STYLES: Record<string, CarStyle> = {
  sports: {
    type: 'sports',
    length: 4.5,
    width: 2.0,
    height: 1.1,
    groundClearance: 0.12,
    hoodLength: 1.8,
    cabinPosition: 0.55,
    spoilerHeight: 0.15
  },
  muscle: {
    type: 'muscle',
    length: 4.8,
    width: 2.0,
    height: 1.2,
    groundClearance: 0.14,
    hoodLength: 2.2,
    cabinPosition: 0.58,
    spoilerHeight: 0.10
  },
  supercar: {
    type: 'supercar',
    length: 4.6,
    width: 2.1,
    height: 1.05,
    groundClearance: 0.10,
    hoodLength: 1.6,
    cabinPosition: 0.52,
    spoilerHeight: 0.20
  },
  rally: {
    type: 'rally',
    length: 4.2,
    width: 1.85,
    height: 1.3,
    groundClearance: 0.18,
    hoodLength: 1.5,
    cabinPosition: 0.50,
    spoilerHeight: 0.30
  }
};

/**
 * Builds sleek procedural car models using rounded primitives
 */
export class ProceduralCarBuilder {
  private style: CarStyle;
  private bodyColor: Color;
  private name: string;

  constructor(name: string, bodyColor: Color, style: CarStyle = CAR_STYLES.sports) {
    this.name = name;
    this.bodyColor = bodyColor;
    this.style = style;
  }

  /**
   * Build complete car model - SIMPLIFIED for reliable rendering
   * Uses direct child meshes instead of nested hierarchies
   */
  build(): SceneNode {
    const carRoot = new SceneNode(this.name);

    // Create materials
    const bodyMaterial = this.createBodyMaterial();
    const glassMaterial = this.createGlassMaterial();
    const darkMaterial = this.createDarkMaterial();
    const chromeMaterial = this.createChromeMaterial();
    const tireMaterial = this.createTireMaterial();
    const lightMaterial = this.createLightMaterial();
    const tailLightMaterial = this.createTailLightMaterial();

    const L = this.style.length;
    const W = this.style.width;
    const H = this.style.height;
    const GC = this.style.groundClearance;

    // =========================================================================
    // MAIN BODY - Sleek capsule-based shape
    // =========================================================================

    // Main body capsule (horizontal, along Z axis)
    // capsule(radius, length, capSegments, radialSegments)
    const bodyRadius = H * 0.35;
    const bodyLength = L * 0.65;
    const bodyGeom = GeometryGenerator.capsule(bodyRadius, bodyLength, 16, 16);
    const bodyNode = new SceneNode(`${this.name}_MainBody`);
    bodyNode.setMesh(bodyGeom);
    bodyNode.setMaterial(bodyMaterial);
    // Rotate capsule to lie along Z axis and scale for width
    bodyNode.setRotation(Quaternion.fromEuler(Math.PI / 2, 0, 0));
    bodyNode.transform.scale.set(W / (bodyRadius * 2), 1, 1);  // Widen it
    bodyNode.transform.position.set(0, GC + bodyRadius, 0);
    carRoot.addChild(bodyNode);

    // Front nose capsule (tapered, lower)
    const noseRadius = H * 0.25;
    const noseLength = L * 0.25;
    const noseGeom = GeometryGenerator.capsule(noseRadius, noseLength, 12, 12);
    const noseNode = new SceneNode(`${this.name}_Nose`);
    noseNode.setMesh(noseGeom);
    noseNode.setMaterial(bodyMaterial);
    noseNode.setRotation(Quaternion.fromEuler(Math.PI / 2, 0, 0));
    noseNode.transform.scale.set(W * 0.85 / (noseRadius * 2), 1, 0.8);
    noseNode.transform.position.set(0, GC + noseRadius * 0.8, L * 0.42);
    carRoot.addChild(noseNode);

    // Rear body capsule (slightly raised for engine bay)
    const rearRadius = H * 0.32;
    const rearLength = L * 0.2;
    const rearGeom = GeometryGenerator.capsule(rearRadius, rearLength, 12, 12);
    const rearNode = new SceneNode(`${this.name}_Rear`);
    rearNode.setMesh(rearGeom);
    rearNode.setMaterial(bodyMaterial);
    rearNode.setRotation(Quaternion.fromEuler(Math.PI / 2, 0, 0));
    rearNode.transform.scale.set(W * 0.95 / (rearRadius * 2), 1, 1);
    rearNode.transform.position.set(0, GC + rearRadius, -L * 0.38);
    carRoot.addChild(rearNode);

    // =========================================================================
    // CABIN/GREENHOUSE - Low teardrop canopy
    // =========================================================================

    const cabinRadius = H * 0.22;
    const cabinLength = L * 0.28;
    const cabinGeom = GeometryGenerator.capsule(cabinRadius, cabinLength, 12, 12);
    const cabinNode = new SceneNode(`${this.name}_Cabin`);
    cabinNode.setMesh(cabinGeom);
    cabinNode.setMaterial(glassMaterial);
    cabinNode.setRotation(Quaternion.fromEuler(Math.PI / 2 + 0.1, 0, 0));  // Slight rake angle
    cabinNode.transform.scale.set(W * 0.55 / (cabinRadius * 2), 1, 0.7);
    cabinNode.transform.position.set(0, GC + H * 0.62, L * 0.05);
    carRoot.addChild(cabinNode);

    // Roof panel (body color strip on top)
    const roofGeom = GeometryGenerator.capsule(0.03, cabinLength * 0.7, 8, 8);
    const roofNode = new SceneNode(`${this.name}_Roof`);
    roofNode.setMesh(roofGeom);
    roofNode.setMaterial(bodyMaterial);
    roofNode.setRotation(Quaternion.fromEuler(Math.PI / 2, 0, 0));
    roofNode.transform.scale.set(W * 0.4 / 0.06, 1, 1);
    roofNode.transform.position.set(0, GC + H * 0.85, L * 0.02);
    carRoot.addChild(roofNode);

    // =========================================================================
    // WHEELS - 4 wheels with tires and rims
    // =========================================================================

    const wheelRadius = H * 0.32;
    const wheelWidth = W * 0.12;
    const wheelbase = L * 0.58;
    const track = W * 0.88;

    const wheelPositions = [
      { x: -track / 2, z: wheelbase / 2, name: 'FL' },
      { x: track / 2, z: wheelbase / 2, name: 'FR' },
      { x: -track / 2, z: -wheelbase / 2, name: 'RL' },
      { x: track / 2, z: -wheelbase / 2, name: 'RR' }
    ];

    wheelPositions.forEach(pos => {
      // Tire (outer black rubber)
      const tireGeom = GeometryGenerator.cylinder(wheelRadius, wheelWidth, 24, 1);
      const tireNode = new SceneNode(`${this.name}_Tire_${pos.name}`);
      tireNode.setMesh(tireGeom);
      tireNode.setMaterial(tireMaterial);
      tireNode.setRotation(Quaternion.fromEuler(0, 0, Math.PI / 2));
      tireNode.transform.position.set(pos.x, GC + wheelRadius * 0.85, pos.z);
      carRoot.addChild(tireNode);

      // Rim (inner chrome/silver)
      const rimGeom = GeometryGenerator.cylinder(wheelRadius * 0.65, wheelWidth * 0.6, 16, 1);
      const rimNode = new SceneNode(`${this.name}_Rim_${pos.name}`);
      rimNode.setMesh(rimGeom);
      rimNode.setMaterial(chromeMaterial);
      rimNode.setRotation(Quaternion.fromEuler(0, 0, Math.PI / 2));
      rimNode.transform.position.set(pos.x, GC + wheelRadius * 0.85, pos.z);
      carRoot.addChild(rimNode);

      // Hub cap (center)
      const hubGeom = GeometryGenerator.cylinder(wheelRadius * 0.2, wheelWidth * 0.7, 12, 1);
      const hubNode = new SceneNode(`${this.name}_Hub_${pos.name}`);
      hubNode.setMesh(hubGeom);
      hubNode.setMaterial(darkMaterial);
      hubNode.setRotation(Quaternion.fromEuler(0, 0, Math.PI / 2));
      hubNode.transform.position.set(pos.x, GC + wheelRadius * 0.85, pos.z);
      carRoot.addChild(hubNode);
    });

    // =========================================================================
    // SPOILER - Rear wing
    // =========================================================================

    const spoilerWidth = W * 1.0;
    const spoilerGeom = GeometryGenerator.capsule(0.04, spoilerWidth - 0.08, 8, 8);
    const spoilerNode = new SceneNode(`${this.name}_SpoilerWing`);
    spoilerNode.setMesh(spoilerGeom);
    spoilerNode.setMaterial(darkMaterial);
    spoilerNode.setRotation(Quaternion.fromEuler(0, 0, Math.PI / 2));
    spoilerNode.transform.scale.set(1, 2.5, 1);  // Make it wider/flatter like an airfoil
    spoilerNode.transform.position.set(0, GC + H * 0.7 + this.style.spoilerHeight, -L * 0.45);
    carRoot.addChild(spoilerNode);

    // Spoiler mounts
    [-1, 1].forEach((side, i) => {
      const mountGeom = GeometryGenerator.cylinder(0.025, this.style.spoilerHeight * 0.8, 8, 1);
      const mountNode = new SceneNode(`${this.name}_SpoilerMount${i}`);
      mountNode.setMesh(mountGeom);
      mountNode.setMaterial(darkMaterial);
      mountNode.transform.position.set(side * spoilerWidth * 0.35, GC + H * 0.55 + this.style.spoilerHeight * 0.4, -L * 0.42);
      carRoot.addChild(mountNode);
    });

    // Spoiler end plates
    [-1, 1].forEach((side, i) => {
      const endPlateGeom = GeometryGenerator.box(0.02, 0.12, 0.15);
      const endPlateNode = new SceneNode(`${this.name}_EndPlate${i}`);
      endPlateNode.setMesh(endPlateGeom);
      endPlateNode.setMaterial(darkMaterial);
      endPlateNode.transform.position.set(side * spoilerWidth * 0.48, GC + H * 0.7 + this.style.spoilerHeight, -L * 0.45);
      carRoot.addChild(endPlateNode);
    });

    // =========================================================================
    // FRONT SPLITTER
    // =========================================================================

    const splitterGeom = GeometryGenerator.box(W * 1.02, 0.03, 0.2);
    const splitterNode = new SceneNode(`${this.name}_Splitter`);
    splitterNode.setMesh(splitterGeom);
    splitterNode.setMaterial(darkMaterial);
    splitterNode.transform.position.set(0, GC + 0.015, L * 0.52);
    carRoot.addChild(splitterNode);

    // =========================================================================
    // REAR DIFFUSER
    // =========================================================================

    const diffuserGeom = GeometryGenerator.box(W * 0.75, 0.08, 0.15);
    const diffuserNode = new SceneNode(`${this.name}_Diffuser`);
    diffuserNode.setMesh(diffuserGeom);
    diffuserNode.setMaterial(darkMaterial);
    diffuserNode.transform.position.set(0, GC + 0.04, -L * 0.52);
    carRoot.addChild(diffuserNode);

    // =========================================================================
    // SIDE SKIRTS
    // =========================================================================

    [-1, 1].forEach((side, i) => {
      const skirtGeom = GeometryGenerator.capsule(0.03, L * 0.5, 8, 8);
      const skirtNode = new SceneNode(`${this.name}_Skirt${i}`);
      skirtNode.setMesh(skirtGeom);
      skirtNode.setMaterial(darkMaterial);
      skirtNode.setRotation(Quaternion.fromEuler(Math.PI / 2, 0, 0));
      skirtNode.transform.position.set(side * W * 0.48, GC + 0.06, 0);
      carRoot.addChild(skirtNode);
    });

    // =========================================================================
    // HEADLIGHTS
    // =========================================================================

    [-1, 1].forEach((side, i) => {
      // Light housing (dark)
      const housingGeom = GeometryGenerator.capsule(0.06, 0.15, 8, 8);
      const housingNode = new SceneNode(`${this.name}_HeadlightHousing${i}`);
      housingNode.setMesh(housingGeom);
      housingNode.setMaterial(darkMaterial);
      housingNode.setRotation(Quaternion.fromEuler(0, side * 0.2, Math.PI / 2));
      housingNode.transform.scale.set(1, 0.6, 1);
      housingNode.transform.position.set(side * W * 0.35, GC + H * 0.3, L * 0.48);
      carRoot.addChild(housingNode);

      // LED element (bright)
      const ledGeom = GeometryGenerator.sphere(0.035, 12, 8);
      const ledNode = new SceneNode(`${this.name}_HeadlightLED${i}`);
      ledNode.setMesh(ledGeom);
      ledNode.setMaterial(lightMaterial);
      ledNode.transform.position.set(side * W * 0.35, GC + H * 0.3, L * 0.51);
      carRoot.addChild(ledNode);
    });

    // =========================================================================
    // TAILLIGHTS
    // =========================================================================

    [-1, 1].forEach((side, i) => {
      const tailGeom = GeometryGenerator.capsule(0.05, 0.2, 8, 8);
      const tailNode = new SceneNode(`${this.name}_Taillight${i}`);
      tailNode.setMesh(tailGeom);
      tailNode.setMaterial(tailLightMaterial);
      tailNode.setRotation(Quaternion.fromEuler(0, 0, Math.PI / 2));
      tailNode.transform.position.set(side * W * 0.38, GC + H * 0.35, -L * 0.48);
      carRoot.addChild(tailNode);
    });

    // =========================================================================
    // EXHAUST PIPES
    // =========================================================================

    [-1, 1].forEach((side, i) => {
      const exhaustGeom = GeometryGenerator.cylinder(0.035, 0.1, 12, 1);
      const exhaustNode = new SceneNode(`${this.name}_Exhaust${i}`);
      exhaustNode.setMesh(exhaustGeom);
      exhaustNode.setMaterial(chromeMaterial);
      exhaustNode.setRotation(Quaternion.fromEuler(Math.PI / 2, 0, 0));
      exhaustNode.transform.position.set(side * W * 0.22, GC + 0.08, -L * 0.53);
      carRoot.addChild(exhaustNode);
    });

    // =========================================================================
    // SIDE MIRRORS
    // =========================================================================

    [-1, 1].forEach((side, i) => {
      const mirrorGeom = GeometryGenerator.capsule(0.04, 0.06, 8, 8);
      const mirrorNode = new SceneNode(`${this.name}_Mirror${i}`);
      mirrorNode.setMesh(mirrorGeom);
      mirrorNode.setMaterial(bodyMaterial);
      mirrorNode.transform.position.set(side * W * 0.52, GC + H * 0.55, L * 0.15);
      carRoot.addChild(mirrorNode);
    });

    console.log(`[ProceduralCarBuilder] Created sleek ${this.style.type} car: ${this.name} with ${carRoot.children.length} parts`);

    return carRoot;
  }

  // ===========================================================================
  // MATERIAL FACTORIES
  // ===========================================================================

  private createBodyMaterial(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial(`${this.name}_BodyMat`);
    mat.albedo = this.bodyColor;
    mat.metallic = 0.4;   // Car paint metallic flake
    mat.roughness = 0.12; // Glossy clearcoat
    return mat;
  }

  private createGlassMaterial(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial(`${this.name}_GlassMat`);
    mat.albedo = new Color(0.02, 0.03, 0.05);  // Very dark tint
    mat.metallic = 0.0;
    mat.roughness = 0.05;  // Mirror-like
    return mat;
  }

  private createDarkMaterial(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial(`${this.name}_DarkMat`);
    mat.albedo = new Color(0.02, 0.02, 0.02);
    mat.metallic = 0.2;
    mat.roughness = 0.5;
    return mat;
  }

  private createChromeMaterial(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial(`${this.name}_ChromeMat`);
    mat.albedo = new Color(0.85, 0.85, 0.9);
    mat.metallic = 0.95;
    mat.roughness = 0.1;
    return mat;
  }

  private createTireMaterial(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial(`${this.name}_TireMat`);
    mat.albedo = new Color(0.05, 0.05, 0.05);
    mat.metallic = 0.0;
    mat.roughness = 0.95;
    return mat;
  }

  private createLightMaterial(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial(`${this.name}_LightMat`);
    mat.albedo = new Color(1.0, 1.0, 1.0);
    mat.metallic = 0.0;
    mat.roughness = 0.1;
    return mat;
  }

  private createTailLightMaterial(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial(`${this.name}_TailLightMat`);
    mat.albedo = new Color(0.9, 0.1, 0.1);
    mat.metallic = 0.0;
    mat.roughness = 0.15;
    return mat;
  }

  // ===========================================================================
  // STATIC FACTORY METHODS
  // ===========================================================================

  static createSimpleCar(name: string, bodyColor: Color): SceneNode {
    return new ProceduralCarBuilder(name, bodyColor, CAR_STYLES.sports).build();
  }

  static createSportsCar(name: string, bodyColor: Color): SceneNode {
    return new ProceduralCarBuilder(name, bodyColor, CAR_STYLES.sports).build();
  }

  static createMuscleCar(name: string, bodyColor: Color): SceneNode {
    return new ProceduralCarBuilder(name, bodyColor, CAR_STYLES.muscle).build();
  }

  static createSupercar(name: string, bodyColor: Color): SceneNode {
    return new ProceduralCarBuilder(name, bodyColor, CAR_STYLES.supercar).build();
  }

  static createRallyCar(name: string, bodyColor: Color): SceneNode {
    return new ProceduralCarBuilder(name, bodyColor, CAR_STYLES.rally).build();
  }
}

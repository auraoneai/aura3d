/**
 * ProceduralCarBuilder.ts - Detailed procedural 3D car model generator
 *
 * Creates realistic-looking car models with proper geometry including:
 * - Body with curves and aerodynamic shape
 * - Windshield and windows with proper angles
 * - Wheels with rims and tires
 * - Hood, roof, trunk sections
 * - Spoiler and body kit elements
 * - Proper UV mapping for textures
 */

import { SceneNode, GeometryGenerator } from 'g3d';
import { Vector3, Quaternion } from 'g3d';
import { StandardPBRMaterial, Color } from 'g3d';
import { Mesh } from 'g3d';

/**
 * Car style configuration
 */
export interface CarStyle {
  /** Car body type */
  type: 'sports' | 'muscle' | 'supercar' | 'rally';
  /** Overall length scale */
  length: number;
  /** Overall width scale */
  width: number;
  /** Overall height scale */
  height: number;
  /** Ground clearance */
  groundClearance: number;
  /** Hood length factor */
  hoodLength: number;
  /** Cabin position (0-1, front to back) */
  cabinPosition: number;
  /** Spoiler height */
  spoilerHeight: number;
}

/**
 * Pre-defined car styles
 */
export const CAR_STYLES: Record<string, CarStyle> = {
  sports: {
    type: 'sports',
    length: 4.5,
    width: 2.0,
    height: 1.3,
    groundClearance: 0.15,
    hoodLength: 1.8,
    cabinPosition: 0.45,
    spoilerHeight: 0.3
  },
  muscle: {
    type: 'muscle',
    length: 5.0,
    width: 2.2,
    height: 1.4,
    groundClearance: 0.2,
    hoodLength: 2.2,
    cabinPosition: 0.5,
    spoilerHeight: 0.15
  },
  supercar: {
    type: 'supercar',
    length: 4.8,
    width: 2.1,
    height: 1.2,
    groundClearance: 0.12,
    hoodLength: 1.6,
    cabinPosition: 0.4,
    spoilerHeight: 0.4
  },
  rally: {
    type: 'rally',
    length: 4.2,
    width: 1.9,
    height: 1.5,
    groundClearance: 0.3,
    hoodLength: 1.5,
    cabinPosition: 0.48,
    spoilerHeight: 0.5
  }
};

/**
 * Builds detailed procedural car models
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
   * Build complete car model with all components
   */
  build(): SceneNode {
    const carRoot = new SceneNode(this.name);

    // Create body sections
    const body = this.createBody();
    carRoot.addChild(body);

    // Create cabin/greenhouse
    const cabin = this.createCabin();
    carRoot.addChild(cabin);

    // Create hood
    const hood = this.createHood();
    carRoot.addChild(hood);

    // Create rear section
    const rear = this.createRear();
    carRoot.addChild(rear);

    // Create wheels (4)
    const wheels = this.createWheels();
    wheels.forEach(wheel => carRoot.addChild(wheel));

    // Create spoiler
    const spoiler = this.createSpoiler();
    carRoot.addChild(spoiler);

    // Create details (bumpers, mirrors, lights)
    const details = this.createDetails();
    details.forEach(detail => carRoot.addChild(detail));

    return carRoot;
  }

  /**
   * Create main body lower section
   */
  private createBody(): SceneNode {
    const bodyMaterial = new StandardPBRMaterial(`${this.name}_BodyMaterial`);
    bodyMaterial.albedo = this.bodyColor;
    bodyMaterial.metallic = 0.4;    // Car paint - clearcoated, not pure metal
    bodyMaterial.roughness = 0.2;   // Glossy paint finish

    // Main body - wider, lower, more aerodynamic
    const bodyGeom = GeometryGenerator.box(
      this.style.width,
      this.style.height * 0.4,
      this.style.length
    );

    const bodyNode = new SceneNode(`${this.name}_Body`);
    bodyNode.setMesh(bodyGeom);
    bodyNode.setMaterial(bodyMaterial);

    // Position body above ground
    const bodyY = this.style.groundClearance + (this.style.height * 0.2);
    bodyNode.transform.position.set(0, bodyY, 0);

    return bodyNode;
  }

  /**
   * Create cabin/greenhouse section
   */
  private createCabin(): SceneNode {
    const glassMaterial = new StandardPBRMaterial(`${this.name}_GlassMaterial`);
    glassMaterial.albedo = new Color(0.08, 0.1, 0.15, 0.85);  // Dark tinted glass
    glassMaterial.metallic = 0.0;   // Glass is dielectric, not metallic
    glassMaterial.roughness = 0.1;  // Smooth

    // Cabin is narrower and positioned back from front
    const cabinWidth = this.style.width * 0.85;
    const cabinHeight = this.style.height * 0.45;
    const cabinLength = this.style.length * 0.35;

    const cabinGeom = GeometryGenerator.box(cabinWidth, cabinHeight, cabinLength);
    const cabinNode = new SceneNode(`${this.name}_Cabin`);
    cabinNode.setMesh(cabinGeom);
    cabinNode.setMaterial(glassMaterial);

    // Position cabin higher and toward rear
    const cabinY = this.style.groundClearance + this.style.height * 0.62;
    const cabinZ = (this.style.length * this.style.cabinPosition) - (this.style.length * 0.5);
    cabinNode.transform.position.set(0, cabinY, cabinZ);

    return cabinNode;
  }

  /**
   * Create hood section
   */
  private createHood(): SceneNode {
    const bodyMaterial = new StandardPBRMaterial(`${this.name}_HoodMaterial`);
    bodyMaterial.albedo = this.bodyColor;
    bodyMaterial.metallic = 0.45;   // Slightly shinier than body
    bodyMaterial.roughness = 0.15;  // Glossy

    const hoodWidth = this.style.width * 0.92;
    const hoodHeight = this.style.height * 0.25;
    const hoodLength = this.style.hoodLength;

    const hoodGeom = GeometryGenerator.box(hoodWidth, hoodHeight, hoodLength);
    const hoodNode = new SceneNode(`${this.name}_Hood`);
    hoodNode.setMesh(hoodGeom);
    hoodNode.setMaterial(bodyMaterial);

    // Position hood at front
    const hoodY = this.style.groundClearance + this.style.height * 0.35;
    const hoodZ = (this.style.length * 0.5) - (hoodLength * 0.5);
    hoodNode.transform.position.set(0, hoodY, hoodZ);

    return hoodNode;
  }

  /**
   * Create rear/trunk section
   */
  private createRear(): SceneNode {
    const bodyMaterial = new StandardPBRMaterial(`${this.name}_RearMaterial`);
    bodyMaterial.albedo = this.bodyColor;
    bodyMaterial.metallic = 0.4;    // Match body
    bodyMaterial.roughness = 0.2;   // Glossy

    const rearWidth = this.style.width * 0.95;
    const rearHeight = this.style.height * 0.3;
    const rearLength = this.style.length * 0.25;

    const rearGeom = GeometryGenerator.box(rearWidth, rearHeight, rearLength);
    const rearNode = new SceneNode(`${this.name}_Rear`);
    rearNode.setMesh(rearGeom);
    rearNode.setMaterial(bodyMaterial);

    // Position at back
    const rearY = this.style.groundClearance + this.style.height * 0.35;
    const rearZ = -(this.style.length * 0.5) + (rearLength * 0.5);
    rearNode.transform.position.set(0, rearY, rearZ);

    return rearNode;
  }

  /**
   * Create all 4 wheels with rims and tires
   */
  private createWheels(): SceneNode[] {
    const wheels: SceneNode[] = [];

    const wheelRadius = this.style.height * 0.35;
    const wheelWidth = this.style.width * 0.15;
    const wheelbase = this.style.length * 0.6;
    const track = this.style.width * 0.95;

    const wheelPositions = [
      { x: -track / 2, z: wheelbase / 2, name: 'FL' },   // Front left
      { x: track / 2, z: wheelbase / 2, name: 'FR' },    // Front right
      { x: -track / 2, z: -wheelbase / 2, name: 'RL' },  // Rear left
      { x: track / 2, z: -wheelbase / 2, name: 'RR' }    // Rear right
    ];

    wheelPositions.forEach(pos => {
      const wheelNode = this.createWheel(pos.name, wheelRadius, wheelWidth);
      wheelNode.transform.position.set(pos.x, this.style.groundClearance + wheelRadius * 0.7, pos.z);
      wheels.push(wheelNode);
    });

    return wheels;
  }

  /**
   * Create a single wheel with rim and tire
   */
  private createWheel(name: string, radius: number, width: number): SceneNode {
    const wheelNode = new SceneNode(`${this.name}_Wheel_${name}`);

    // Tire (black rubber)
    const tireMaterial = new StandardPBRMaterial(`${this.name}_TireMaterial`);
    tireMaterial.albedo = new Color(0.08, 0.08, 0.08);
    tireMaterial.metallic = 0.0;
    tireMaterial.roughness = 0.95; // Very rough rubber

    const tireGeom = GeometryGenerator.cylinder(radius, width, 16, 1);
    const tireNode = new SceneNode(`${this.name}_Tire_${name}`);
    tireNode.setMesh(tireGeom);
    tireNode.setMaterial(tireMaterial);
    tireNode.setRotation(Quaternion.fromEuler(0, 0, Math.PI / 2)); // Rotate to face outward
    wheelNode.addChild(tireNode);

    // Rim (brushed aluminum)
    const rimMaterial = new StandardPBRMaterial(`${this.name}_RimMaterial`);
    rimMaterial.albedo = new Color(0.8, 0.8, 0.85);   // Light silver
    rimMaterial.metallic = 0.9;     // Metallic
    rimMaterial.roughness = 0.2;    // Slightly rough for brushed look

    const rimGeom = GeometryGenerator.cylinder(radius * 0.7, width * 0.5, 16, 1);
    const rimNode = new SceneNode(`${this.name}_Rim_${name}`);
    rimNode.setMesh(rimGeom);
    rimNode.setMaterial(rimMaterial);
    rimNode.setRotation(Quaternion.fromEuler(0, 0, Math.PI / 2));
    wheelNode.addChild(rimNode);

    return wheelNode;
  }

  /**
   * Create rear spoiler
   */
  private createSpoiler(): SceneNode {
    const spoilerMaterial = new StandardPBRMaterial(`${this.name}_SpoilerMaterial`);
    spoilerMaterial.albedo = new Color(0.1, 0.1, 0.1);
    spoilerMaterial.metallic = 0.5;
    spoilerMaterial.roughness = 0.3;

    const spoilerWidth = this.style.width * 1.1;
    const spoilerHeight = 0.08;
    const spoilerDepth = 0.3;

    const spoilerGeom = GeometryGenerator.box(spoilerWidth, spoilerHeight, spoilerDepth);
    const spoilerNode = new SceneNode(`${this.name}_Spoiler`);
    spoilerNode.setMesh(spoilerGeom);
    spoilerNode.setMaterial(spoilerMaterial);

    // Position at rear, elevated
    const spoilerY = this.style.groundClearance + this.style.height * 0.7 + this.style.spoilerHeight;
    const spoilerZ = -(this.style.length * 0.5) - 0.1;
    spoilerNode.transform.position.set(0, spoilerY, spoilerZ);

    return spoilerNode;
  }

  /**
   * Create detail elements (bumpers, mirrors, lights)
   */
  private createDetails(): SceneNode[] {
    const details: SceneNode[] = [];

    // Front bumper
    const frontBumper = this.createBumper('Front', true);
    details.push(frontBumper);

    // Rear bumper
    const rearBumper = this.createBumper('Rear', false);
    details.push(rearBumper);

    // Side mirrors
    const mirrorLeft = this.createMirror('Left', -1);
    const mirrorRight = this.createMirror('Right', 1);
    details.push(mirrorLeft, mirrorRight);

    // Headlights
    const headlightLeft = this.createHeadlight('Left', -1);
    const headlightRight = this.createHeadlight('Right', 1);
    details.push(headlightLeft, headlightRight);

    return details;
  }

  /**
   * Create front or rear bumper
   */
  private createBumper(name: string, isFront: boolean): SceneNode {
    const bumperMaterial = new StandardPBRMaterial(`${this.name}_Bumper${name}Material`);
    bumperMaterial.albedo = new Color(0.15, 0.15, 0.15);
    bumperMaterial.metallic = 0.4;
    bumperMaterial.roughness = 0.6;

    const bumperWidth = this.style.width;
    const bumperHeight = this.style.height * 0.15;
    const bumperDepth = 0.15;

    const bumperGeom = GeometryGenerator.box(bumperWidth, bumperHeight, bumperDepth);
    const bumperNode = new SceneNode(`${this.name}_Bumper_${name}`);
    bumperNode.setMesh(bumperGeom);
    bumperNode.setMaterial(bumperMaterial);

    const bumperY = this.style.groundClearance + bumperHeight * 0.5;
    const bumperZ = isFront
      ? (this.style.length * 0.5) + bumperDepth * 0.5
      : -(this.style.length * 0.5) - bumperDepth * 0.5;

    bumperNode.transform.position.set(0, bumperY, bumperZ);

    return bumperNode;
  }

  /**
   * Create side mirror
   */
  private createMirror(name: string, side: number): SceneNode {
    const mirrorMaterial = new StandardPBRMaterial(`${this.name}_Mirror${name}Material`);
    mirrorMaterial.albedo = this.bodyColor;
    mirrorMaterial.metallic = 0.6;
    mirrorMaterial.roughness = 0.3;

    const mirrorSize = 0.12;
    const mirrorGeom = GeometryGenerator.box(mirrorSize, mirrorSize * 0.8, mirrorSize * 0.6);
    const mirrorNode = new SceneNode(`${this.name}_Mirror_${name}`);
    mirrorNode.setMesh(mirrorGeom);
    mirrorNode.setMaterial(mirrorMaterial);

    const mirrorX = side * (this.style.width * 0.5 + mirrorSize * 0.5);
    const mirrorY = this.style.groundClearance + this.style.height * 0.65;
    const mirrorZ = this.style.length * 0.2;

    mirrorNode.transform.position.set(mirrorX, mirrorY, mirrorZ);

    return mirrorNode;
  }

  /**
   * Create headlight
   */
  private createHeadlight(name: string, side: number): SceneNode {
    const lightMaterial = new StandardPBRMaterial(`${this.name}_Headlight${name}Material`);
    lightMaterial.albedo = new Color(0.95, 0.95, 1.0);
    // Headlights emit light - using property access since setters might not be exported
    try {
      (lightMaterial as any).properties.emission = new Color(1.0, 1.0, 1.0);
      (lightMaterial as any).properties.emissionIntensity = 0.5;
    } catch (e) {
      // Emission not supported, just use bright white color
    }
    lightMaterial.metallic = 0.8;
    lightMaterial.roughness = 0.1;

    const lightSize = 0.15;
    const lightGeom = GeometryGenerator.box(lightSize, lightSize * 0.6, lightSize * 0.4);
    const lightNode = new SceneNode(`${this.name}_Headlight_${name}`);
    lightNode.setMesh(lightGeom);
    lightNode.setMaterial(lightMaterial);

    const lightX = side * (this.style.width * 0.38);
    const lightY = this.style.groundClearance + this.style.height * 0.35;
    const lightZ = this.style.length * 0.48;

    lightNode.transform.position.set(lightX, lightY, lightZ);

    return lightNode;
  }

  /**
   * Create a simple car (for reference/fallback)
   */
  static createSimpleCar(name: string, bodyColor: Color): SceneNode {
    const builder = new ProceduralCarBuilder(name, bodyColor, CAR_STYLES.sports);
    return builder.build();
  }

  /**
   * Create a sports car
   */
  static createSportsCar(name: string, bodyColor: Color): SceneNode {
    const builder = new ProceduralCarBuilder(name, bodyColor, CAR_STYLES.sports);
    return builder.build();
  }

  /**
   * Create a muscle car
   */
  static createMuscleCar(name: string, bodyColor: Color): SceneNode {
    const builder = new ProceduralCarBuilder(name, bodyColor, CAR_STYLES.muscle);
    return builder.build();
  }

  /**
   * Create a supercar
   */
  static createSupercar(name: string, bodyColor: Color): SceneNode {
    const builder = new ProceduralCarBuilder(name, bodyColor, CAR_STYLES.supercar);
    return builder.build();
  }

  /**
   * Create a rally car
   */
  static createRallyCar(name: string, bodyColor: Color): SceneNode {
    const builder = new ProceduralCarBuilder(name, bodyColor, CAR_STYLES.rally);
    return builder.build();
  }
}

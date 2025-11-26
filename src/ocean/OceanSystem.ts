import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { Logger } from '../core/Logger';
import { WaveCascade } from './WaveCascade';
import { GerstnerWaves } from './GerstnerWaves';
import { FoamGenerator } from './FoamGenerator';
import { BuoyancySystem } from './BuoyancySystem';
import { OceanRenderer } from './OceanRenderer';
import { UnderwaterEffects } from './UnderwaterEffects';
import { OceanMaterial } from './OceanMaterial';
import { PhillipsParams } from './OceanFFT';

/**
 * Ocean simulation mode
 */
export enum OceanMode {
  FFT = 'fft',
  Gerstner = 'gerstner',
  Hybrid = 'hybrid'
}

/**
 * Ocean system configuration
 */
export interface OceanConfig {
  mode: OceanMode;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  enableFoam: boolean;
  enableBuoyancy: boolean;
  enableUnderwater: boolean;
}

/**
 * OceanSystem - Complete ocean simulation and rendering system
 *
 * Integrates all ocean subsystems into a cohesive system:
 * - Wave simulation (FFT or Gerstner)
 * - Foam generation
 * - Buoyancy physics
 * - Rendering
 * - Underwater effects
 * - Material system
 *
 * Features:
 * - Multiple simulation modes
 * - Quality presets
 * - Easy integration
 * - Performance optimization
 *
 * @example
 * ```typescript
 * const ocean = new OceanSystem({
 *   mode: OceanMode.FFT,
 *   quality: 'high',
 *   enableFoam: true,
 *   enableBuoyancy: true,
 *   enableUnderwater: true
 * });
 * ocean.update(deltaTime);
 * const mesh = ocean.generateMesh(cameraPos, viewMatrix, projMatrix);
 * ```
 */
export class OceanSystem {
  private config: OceanConfig;
  private logger: Logger;

  private cascade: WaveCascade | null = null;
  private gerstner: GerstnerWaves | null = null;
  private foam: FoamGenerator | null = null;
  private buoyancy: BuoyancySystem | null = null;
  private renderer: OceanRenderer;
  private underwater: UnderwaterEffects;
  private material: OceanMaterial;

  private time: number = 0;

  /**
   * Creates a new ocean system
   */
  constructor(config?: Partial<OceanConfig>) {
    this.logger = Logger.getInstance();

    this.config = {
      mode: OceanMode.FFT,
      quality: 'medium',
      enableFoam: true,
      enableBuoyancy: true,
      enableUnderwater: true,
      ...config
    };

    this.renderer = new OceanRenderer();
    this.underwater = new UnderwaterEffects();
    this.material = new OceanMaterial();

    this.initialize();
  }

  /**
   * Initializes ocean systems based on configuration
   */
  private initialize(): void {
    const { mode, quality, enableFoam, enableBuoyancy } = this.config;

    // Initialize wave simulation
    if (mode === OceanMode.FFT || mode === OceanMode.Hybrid) {
      this.cascade = new WaveCascade();
      this.cascade.applyRecommendedSetup(quality);

      if (enableFoam) {
        const resolution = this.getResolutionForQuality(quality);
        this.foam = new FoamGenerator(resolution);
      }
    }

    if (mode === OceanMode.Gerstner || mode === OceanMode.Hybrid) {
      const preset = this.getGerstnerPresetForQuality(quality);
      this.gerstner = GerstnerWaves.createPreset(preset);
    }

    if (enableBuoyancy) {
      this.buoyancy = new BuoyancySystem(this.cascade || undefined, this.gerstner || undefined);
    }

    this.logger.info(`Ocean system initialized: mode=${mode}, quality=${quality}`);
  }

  /**
   * Gets resolution for quality level
   */
  private getResolutionForQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): number {
    switch (quality) {
      case 'low': return 128;
      case 'medium': return 256;
      case 'high': return 512;
      case 'ultra': return 512;
    }
  }

  /**
   * Gets Gerstner preset for quality level
   */
  private getGerstnerPresetForQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): 'calm' | 'moderate' | 'rough' | 'storm' {
    switch (quality) {
      case 'low': return 'calm';
      case 'medium': return 'moderate';
      case 'high': return 'rough';
      case 'ultra': return 'storm';
    }
  }

  /**
   * Sets ocean parameters
   */
  public setOceanParams(params: Partial<PhillipsParams>): void {
    if (this.cascade) {
      this.cascade.setGlobalParams(params);
    }
  }

  /**
   * Updates the ocean simulation
   */
  public update(deltaTime: number): void {
    this.time += deltaTime;

    // Update wave simulation
    if (this.cascade) {
      this.cascade.update(deltaTime);

      // Update foam
      if (this.foam && this.cascade.getLevelCount() > 0) {
        const level = this.cascade.getLevel(0);
        if (level) {
          const jacobian = level.fft.getJacobian();
          this.foam.update(jacobian, deltaTime);
        }
      }
    }
  }

  /**
   * Gets height at world position
   */
  public getHeightAt(x: number, z: number): number {
    let height = 0;

    if (this.cascade) {
      height += this.cascade.getHeightAt(x, z);
    }

    if (this.gerstner) {
      height += this.gerstner.getHeight(x, z, this.time);
    }

    return height;
  }

  /**
   * Gets normal at world position
   */
  public getNormalAt(x: number, z: number): Vector3 {
    let normal = new Vector3(0, 1, 0);

    if (this.cascade) {
      normal = this.cascade.getNormalAt(x, z);
    }

    if (this.gerstner) {
      const gerstnerNormal = this.gerstner.getNormal(x, z, this.time);
      normal = normal.add(gerstnerNormal).normalize();
    }

    return normal;
  }

  /**
   * Gets displacement at world position
   */
  public getDisplacementAt(x: number, z: number): Vector3 {
    let displacement = new Vector3(0, 0, 0);

    if (this.cascade) {
      displacement = this.cascade.getDisplacementAt(x, z);
    }

    if (this.gerstner) {
      const gerstnerDisp = this.gerstner.getHorizontalDisplacement(x, z, this.time);
      displacement = displacement.add(gerstnerDisp);
    }

    return displacement;
  }

  /**
   * Generates ocean mesh
   */
  public generateMesh(cameraPosition: Vector3, viewMatrix: Matrix4, projectionMatrix: Matrix4) {
    const mesh = this.renderer.generateMesh(cameraPosition, viewMatrix, projectionMatrix);

    // Update mesh with wave data
    this.renderer.updateMeshWithWaves(
      mesh,
      (x, z) => this.getHeightAt(x, z),
      (x, z) => this.getNormalAt(x, z)
    );

    return mesh;
  }

  /**
   * Gets buoyancy system
   */
  public getBuoyancy(): BuoyancySystem | null {
    return this.buoyancy;
  }

  /**
   * Gets underwater effects
   */
  public getUnderwaterEffects(): UnderwaterEffects {
    return this.underwater;
  }

  /**
   * Gets material system
   */
  public getMaterial(): OceanMaterial {
    return this.material;
  }

  /**
   * Gets renderer
   */
  public getRenderer(): OceanRenderer {
    return this.renderer;
  }

  /**
   * Gets foam generator
   */
  public getFoam(): FoamGenerator | null {
    return this.foam;
  }

  /**
   * Gets wave cascade
   */
  public getCascade(): WaveCascade | null {
    return this.cascade;
  }

  /**
   * Gets Gerstner waves
   */
  public getGerstner(): GerstnerWaves | null {
    return this.gerstner;
  }

  /**
   * Checks if position is underwater
   */
  public isUnderwater(position: Vector3): boolean {
    const waterHeight = this.getHeightAt(position.x, position.z);
    return this.underwater.isUnderwater(position, waterHeight);
  }

  /**
   * Gets current time
   */
  public getTime(): number {
    return this.time;
  }

  /**
   * Sets simulation time
   */
  public setTime(time: number): void {
    this.time = time;
  }

  /**
   * Gets configuration
   */
  public getConfig(): OceanConfig {
    return { ...this.config };
  }
}

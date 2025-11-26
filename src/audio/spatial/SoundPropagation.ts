import { Logger } from '../../core/Logger';
import { Vector3 } from '../../math/Vector3';

/**
 * Material acoustic properties
 */
export interface MaterialProperties {
  /** Material name */
  name: string;
  /** Absorption coefficient (0-1) */
  absorption: number;
  /** Reflection coefficient (0-1) */
  reflection: number;
  /** Transmission coefficient (0-1) */
  transmission: number;
  /** Scattering coefficient (0-1) */
  scattering: number;
}

/**
 * Propagation path segment
 */
export interface PathSegment {
  /** Start position */
  start: Vector3;
  /** End position */
  end: Vector3;
  /** Distance */
  distance: number;
  /** Material encountered (if any) */
  material?: MaterialProperties;
  /** Path loss in dB */
  pathLoss: number;
}

/**
 * Sound propagation configuration
 */
export interface PropagationConfig {
  /** Enable air absorption */
  airAbsorption?: boolean;
  /** Temperature in Celsius */
  temperature?: number;
  /** Relative humidity (0-1) */
  humidity?: number;
  /** Atmospheric pressure in kPa */
  pressure?: number;
  /** Maximum propagation distance */
  maxDistance?: number;
  /** Enable material-based attenuation */
  materialAttenuation?: boolean;
}

/**
 * Propagation analysis result
 */
export interface PropagationResult {
  /** Total path length */
  totalDistance: number;
  /** Path segments */
  segments: PathSegment[];
  /** Total attenuation in dB */
  totalAttenuation: number;
  /** Arrival time in seconds */
  arrivalTime: number;
  /** Direct path available */
  directPath: boolean;
}

/**
 * Sound propagation simulation with distance and material-based attenuation.
 * Simulates realistic sound propagation including air absorption and material interactions.
 *
 * @example
 * ```typescript
 * const propagation = new SoundPropagation({
 *   airAbsorption: true,
 *   temperature: 20,
 *   humidity: 0.5
 * });
 * const result = propagation.calculatePropagation(sourcePos, listenerPos, 1000);
 * ```
 */
export class SoundPropagation {
  private logger: Logger;
  private config: Required<PropagationConfig>;

  private materials: Map<string, MaterialProperties> = new Map();

  private readonly SPEED_OF_SOUND_BASE = 331.3;
  private readonly REFERENCE_PRESSURE = 101.325;

  /**
   * Creates a new SoundPropagation instance
   *
   * @param config - Propagation configuration
   */
  constructor(config: PropagationConfig = {}) {
    this.logger = Logger.getInstance();

    this.config = {
      airAbsorption: config.airAbsorption ?? true,
      temperature: config.temperature ?? 20,
      humidity: config.humidity ?? 0.5,
      pressure: config.pressure ?? 101.325,
      maxDistance: config.maxDistance ?? 1000,
      materialAttenuation: config.materialAttenuation ?? true
    };

    this.initializeDefaultMaterials();

    this.logger.info('SoundPropagation', 'Initialized');
  }

  /**
   * Initializes default material properties
   */
  private initializeDefaultMaterials(): void {
    this.materials.set('air', {
      name: 'air',
      absorption: 0.0,
      reflection: 0.0,
      transmission: 1.0,
      scattering: 0.0
    });

    this.materials.set('concrete', {
      name: 'concrete',
      absorption: 0.02,
      reflection: 0.8,
      transmission: 0.05,
      scattering: 0.15
    });

    this.materials.set('brick', {
      name: 'brick',
      absorption: 0.03,
      reflection: 0.75,
      transmission: 0.1,
      scattering: 0.15
    });

    this.materials.set('wood', {
      name: 'wood',
      absorption: 0.15,
      reflection: 0.6,
      transmission: 0.15,
      scattering: 0.25
    });

    this.materials.set('carpet', {
      name: 'carpet',
      absorption: 0.5,
      reflection: 0.2,
      transmission: 0.05,
      scattering: 0.45
    });

    this.materials.set('glass', {
      name: 'glass',
      absorption: 0.05,
      reflection: 0.9,
      transmission: 0.03,
      scattering: 0.05
    });

    this.materials.set('metal', {
      name: 'metal',
      absorption: 0.01,
      reflection: 0.95,
      transmission: 0.01,
      scattering: 0.04
    });
  }

  /**
   * Calculates speed of sound based on atmospheric conditions
   *
   * @returns Speed of sound in m/s
   */
  private calculateSpeedOfSound(): number {
    const tempKelvin = this.config.temperature + 273.15;
    const speedOfSound = this.SPEED_OF_SOUND_BASE * Math.sqrt(tempKelvin / 273.15);

    return speedOfSound;
  }

  /**
   * Calculates air absorption coefficient (ISO 9613-1)
   *
   * @param frequency - Frequency in Hz
   * @returns Absorption coefficient in dB/m
   */
  private calculateAirAbsorption(frequency: number): number {
    if (!this.config.airAbsorption) {
      return 0;
    }

    const T = this.config.temperature + 273.15;
    const T0 = 293.15;
    const T01 = 273.16;

    const ps = this.config.pressure;
    const pr = this.REFERENCE_PRESSURE;

    const h = this.config.humidity;

    const F = frequency / pr;

    const psat = pr * Math.pow(10, -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151);
    const h_rel = h * (psat / ps);

    const frO = (ps / pr) * (24 + 4.04e4 * h_rel * (0.02 + h_rel) / (0.391 + h_rel));

    const frN = (ps / pr) * Math.pow(T0 / T, 0.5) *
                (9 + 280 * h_rel * Math.exp(-4.17 * (Math.pow(T0 / T, 1/3) - 1)));

    const z = 0.1068 * Math.exp(-3352 / T) * frN;
    const y = Math.pow(T0 / T, 2.5) * (0.01275 * Math.exp(-2239.1 / T) * frO + z);

    const alpha = 8.686 * F * F * (1.84e-11 * (pr / ps) * Math.sqrt(T / T0) + y);

    return alpha;
  }

  /**
   * Calculates geometric spreading loss
   *
   * @param distance - Distance in meters
   * @returns Attenuation in dB
   */
  private calculateSpreadingLoss(distance: number): number {
    if (distance < 1) {
      return 0;
    }

    return 20 * Math.log10(distance);
  }

  /**
   * Calculates propagation from source to listener
   *
   * @param sourcePosition - Sound source position
   * @param listenerPosition - Listener position
   * @param frequency - Frequency in Hz (for air absorption)
   * @param materials - Optional array of materials along the path
   * @returns Propagation result
   */
  calculatePropagation(
    sourcePosition: Vector3,
    listenerPosition: Vector3,
    frequency: number = 1000,
    materials?: MaterialProperties[]
  ): PropagationResult {
    const direction = listenerPosition.clone().sub(sourcePosition);
    const totalDistance = direction.length();

    if (totalDistance > this.config.maxDistance) {
      return {
        totalDistance,
        segments: [],
        totalAttenuation: Infinity,
        arrivalTime: totalDistance / this.calculateSpeedOfSound(),
        directPath: false
      };
    }

    const segments: PathSegment[] = [];
    let totalAttenuation = 0;

    const spreadingLoss = this.calculateSpreadingLoss(totalDistance);
    totalAttenuation += spreadingLoss;

    const airAbsorption = this.calculateAirAbsorption(frequency) * totalDistance;
    totalAttenuation += airAbsorption;

    if (materials && this.config.materialAttenuation) {
      for (const material of materials) {
        const materialLoss = this.calculateMaterialLoss(material, frequency);
        totalAttenuation += materialLoss;
      }
    }

    segments.push({
      start: sourcePosition.clone(),
      end: listenerPosition.clone(),
      distance: totalDistance,
      material: this.materials.get('air'),
      pathLoss: totalAttenuation
    });

    const speedOfSound = this.calculateSpeedOfSound();
    const arrivalTime = totalDistance / speedOfSound;

    return {
      totalDistance,
      segments,
      totalAttenuation,
      arrivalTime,
      directPath: true
    };
  }

  /**
   * Calculates material-based attenuation
   *
   * @param material - Material properties
   * @param frequency - Frequency in Hz
   * @returns Attenuation in dB
   */
  private calculateMaterialLoss(material: MaterialProperties, frequency: number): number {
    const baseAbsorption = material.absorption * 10;

    const frequencyFactor = Math.log10(frequency / 1000) * 3;

    const totalLoss = baseAbsorption + frequencyFactor;

    return Math.max(0, totalLoss);
  }

  /**
   * Calculates attenuation for a given distance
   *
   * @param distance - Distance in meters
   * @param frequency - Frequency in Hz
   * @returns Attenuation in dB
   */
  calculateAttenuation(distance: number, frequency: number = 1000): number {
    const spreadingLoss = this.calculateSpreadingLoss(distance);
    const airAbsorption = this.calculateAirAbsorption(frequency) * distance;

    return spreadingLoss + airAbsorption;
  }

  /**
   * Converts attenuation in dB to linear gain
   *
   * @param attenuationDb - Attenuation in dB
   * @returns Linear gain (0-1)
   */
  attenuationToGain(attenuationDb: number): number {
    return Math.pow(10, -attenuationDb / 20);
  }

  /**
   * Registers a custom material
   *
   * @param material - Material properties
   */
  registerMaterial(material: MaterialProperties): void {
    this.materials.set(material.name, material);
    this.logger.info('SoundPropagation', `Registered material: ${material.name}`);
  }

  /**
   * Gets a material by name
   *
   * @param name - Material name
   * @returns Material properties or undefined
   */
  getMaterial(name: string): MaterialProperties | undefined {
    return this.materials.get(name);
  }

  /**
   * Gets all registered materials
   *
   * @returns Array of all materials
   */
  getAllMaterials(): MaterialProperties[] {
    return Array.from(this.materials.values());
  }

  /**
   * Calculates reflection based on material
   *
   * @param material - Material properties
   * @param incidentAngle - Incident angle in radians
   * @returns Reflection coefficient
   */
  calculateReflection(material: MaterialProperties, incidentAngle: number): number {
    const baseReflection = material.reflection;
    const angleFactor = Math.cos(incidentAngle);

    return baseReflection * angleFactor;
  }

  /**
   * Calculates delay time for a given distance
   *
   * @param distance - Distance in meters
   * @returns Delay time in seconds
   */
  calculateDelayTime(distance: number): number {
    const speedOfSound = this.calculateSpeedOfSound();
    return distance / speedOfSound;
  }

  /**
   * Updates propagation configuration
   *
   * @param config - New configuration options
   */
  updateConfig(config: Partial<PropagationConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('SoundPropagation', 'Configuration updated');
  }

  /**
   * Gets the current speed of sound
   *
   * @returns Speed of sound in m/s
   */
  getSpeedOfSound(): number {
    return this.calculateSpeedOfSound();
  }

  /**
   * Gets the current configuration
   *
   * @returns Propagation configuration
   */
  getConfig(): PropagationConfig {
    return { ...this.config };
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.materials.clear();
    this.logger.info('SoundPropagation', 'Disposed');
  }
}

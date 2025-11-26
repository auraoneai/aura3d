import { Vector3 } from '../math/Vector3';
import { Logger } from '../core/Logger';

/**
 * Gerstner wave parameters
 */
export interface GerstnerWave {
  amplitude: number;
  wavelength: number;
  speed: number;
  direction: Vector3;
  steepness: number;
}

/**
 * GerstnerWaves - Analytical Gerstner wave calculations
 *
 * Implements Gerstner (trochoidal) waves for realistic ocean surface.
 * These waves have circular particle motion and sharp crests with flat
 * troughs, providing more realistic wave shapes than simple sine waves.
 *
 * Features:
 * - Multiple wave superposition
 * - Configurable amplitude, wavelength, direction
 * - Steepness control
 * - Analytical displacement and derivatives
 * - Normal calculation
 * - Fast evaluation
 *
 * @example
 * ```typescript
 * const gerstner = new GerstnerWaves();
 * gerstner.addWave({
 *   amplitude: 2.0,
 *   wavelength: 60,
 *   speed: 10,
 *   direction: new Vector3(1, 0, 0),
 *   steepness: 0.5
 * });
 * const pos = gerstner.getDisplacedPosition(new Vector3(10, 0, 5), time);
 * ```
 */
export class GerstnerWaves {
  private waves: GerstnerWave[];
  private logger: Logger;

  constructor() {
    this.waves = [];
    this.logger = Logger.getInstance();
  }

  /**
   * Adds a Gerstner wave
   */
  public addWave(wave: GerstnerWave): void {
    // Normalize direction
    wave.direction = wave.direction.clone().normalize();

    // Clamp steepness to prevent loops
    wave.steepness = Math.min(wave.steepness, 1.0);

    this.waves.push(wave);
  }

  /**
   * Removes all waves
   */
  public clearWaves(): void {
    this.waves = [];
  }

  /**
   * Gets displaced position for a world position
   */
  public getDisplacedPosition(position: Vector3, time: number): Vector3 {
    let displacement = new Vector3(0, 0, 0);

    for (const wave of this.waves) {
      const k = (2 * Math.PI) / wave.wavelength;
      const omega = wave.speed * k;

      const dot = wave.direction.x * position.x + wave.direction.z * position.z;
      const phase = k * dot - omega * time;

      const Q = wave.steepness / (wave.amplitude * k * this.waves.length);

      displacement.x += Q * wave.amplitude * wave.direction.x * Math.cos(phase);
      displacement.y += wave.amplitude * Math.sin(phase);
      displacement.z += Q * wave.amplitude * wave.direction.z * Math.cos(phase);
    }

    return position.clone().add(displacement);
  }

  /**
   * Gets height at position
   */
  public getHeight(x: number, z: number, time: number): number {
    let height = 0;

    for (const wave of this.waves) {
      const k = (2 * Math.PI) / wave.wavelength;
      const omega = wave.speed * k;

      const dot = wave.direction.x * x + wave.direction.z * z;
      const phase = k * dot - omega * time;

      height += wave.amplitude * Math.sin(phase);
    }

    return height;
  }

  /**
   * Gets horizontal displacement at position
   */
  public getHorizontalDisplacement(x: number, z: number, time: number): Vector3 {
    let displacement = new Vector3(0, 0, 0);

    for (const wave of this.waves) {
      const k = (2 * Math.PI) / wave.wavelength;
      const omega = wave.speed * k;

      const dot = wave.direction.x * x + wave.direction.z * z;
      const phase = k * dot - omega * time;

      const Q = wave.steepness / (wave.amplitude * k * this.waves.length);

      displacement.x += Q * wave.amplitude * wave.direction.x * Math.cos(phase);
      displacement.z += Q * wave.amplitude * wave.direction.z * Math.cos(phase);
    }

    return displacement;
  }

  /**
   * Gets normal at position
   */
  public getNormal(x: number, z: number, time: number): Vector3 {
    let normal = new Vector3(0, 1, 0);

    for (const wave of this.waves) {
      const k = (2 * Math.PI) / wave.wavelength;
      const omega = wave.speed * k;

      const dot = wave.direction.x * x + wave.direction.z * z;
      const phase = k * dot - omega * time;

      const WA = k * wave.amplitude;
      const Q = wave.steepness / (wave.amplitude * k * this.waves.length);

      const sinPhase = Math.sin(phase);
      const cosPhase = Math.cos(phase);

      normal.x -= wave.direction.x * WA * cosPhase;
      normal.y -= Q * WA * sinPhase;
      normal.z -= wave.direction.z * WA * cosPhase;
    }

    return normal.normalize();
  }

  /**
   * Gets tangent at position
   */
  public getTangent(x: number, z: number, time: number): Vector3 {
    let tangent = new Vector3(1, 0, 0);

    for (const wave of this.waves) {
      const k = (2 * Math.PI) / wave.wavelength;
      const omega = wave.speed * k;

      const dot = wave.direction.x * x + wave.direction.z * z;
      const phase = k * dot - omega * time;

      const WA = k * wave.amplitude;
      const Q = wave.steepness / (wave.amplitude * k * this.waves.length);

      const sinPhase = Math.sin(phase);
      const cosPhase = Math.cos(phase);

      tangent.x += Q * wave.direction.x * wave.direction.x * WA * sinPhase;
      tangent.y += wave.direction.x * WA * cosPhase;
      tangent.z += Q * wave.direction.x * wave.direction.z * WA * sinPhase;
    }

    return tangent.normalize();
  }

  /**
   * Gets binormal at position
   */
  public getBinormal(x: number, z: number, time: number): Vector3 {
    let binormal = new Vector3(0, 0, 1);

    for (const wave of this.waves) {
      const k = (2 * Math.PI) / wave.wavelength;
      const omega = wave.speed * k;

      const dot = wave.direction.x * x + wave.direction.z * z;
      const phase = k * dot - omega * time;

      const WA = k * wave.amplitude;
      const Q = wave.steepness / (wave.amplitude * k * this.waves.length);

      const sinPhase = Math.sin(phase);
      const cosPhase = Math.cos(phase);

      binormal.x += Q * wave.direction.x * wave.direction.z * WA * sinPhase;
      binormal.y += wave.direction.z * WA * cosPhase;
      binormal.z += Q * wave.direction.z * wave.direction.z * WA * sinPhase;
    }

    return binormal.normalize();
  }

  /**
   * Evaluates all wave properties at once (more efficient)
   */
  public evaluate(x: number, z: number, time: number): {
    position: Vector3;
    normal: Vector3;
    tangent: Vector3;
    binormal: Vector3;
  } {
    let displacement = new Vector3(0, 0, 0);
    let normal = new Vector3(0, 1, 0);
    let tangent = new Vector3(1, 0, 0);
    let binormal = new Vector3(0, 0, 1);

    for (const wave of this.waves) {
      const k = (2 * Math.PI) / wave.wavelength;
      const omega = wave.speed * k;

      const dot = wave.direction.x * x + wave.direction.z * z;
      const phase = k * dot - omega * time;

      const WA = k * wave.amplitude;
      const Q = wave.steepness / (wave.amplitude * k * this.waves.length);

      const sinPhase = Math.sin(phase);
      const cosPhase = Math.cos(phase);

      // Displacement
      displacement.x += Q * wave.amplitude * wave.direction.x * cosPhase;
      displacement.y += wave.amplitude * sinPhase;
      displacement.z += Q * wave.amplitude * wave.direction.z * cosPhase;

      // Normal
      normal.x -= wave.direction.x * WA * cosPhase;
      normal.y -= Q * WA * sinPhase;
      normal.z -= wave.direction.z * WA * cosPhase;

      // Tangent
      tangent.x += Q * wave.direction.x * wave.direction.x * WA * sinPhase;
      tangent.y += wave.direction.x * WA * cosPhase;
      tangent.z += Q * wave.direction.x * wave.direction.z * WA * sinPhase;

      // Binormal
      binormal.x += Q * wave.direction.x * wave.direction.z * WA * sinPhase;
      binormal.y += wave.direction.z * WA * cosPhase;
      binormal.z += Q * wave.direction.z * wave.direction.z * WA * sinPhase;
    }

    return {
      position: new Vector3(x, 0, z).add(displacement),
      normal: normal.normalize(),
      tangent: tangent.normalize(),
      binormal: binormal.normalize()
    };
  }

  /**
   * Gets all waves
   */
  public getWaves(): GerstnerWave[] {
    return this.waves;
  }

  /**
   * Gets wave count
   */
  public getWaveCount(): number {
    return this.waves.length;
  }

  /**
   * Creates preset wave configuration
   */
  public static createPreset(preset: 'calm' | 'moderate' | 'rough' | 'storm'): GerstnerWaves {
    const gerstner = new GerstnerWaves();

    switch (preset) {
      case 'calm':
        gerstner.addWave({
          amplitude: 0.5,
          wavelength: 60,
          speed: 8,
          direction: new Vector3(1, 0, 0),
          steepness: 0.2
        });
        gerstner.addWave({
          amplitude: 0.3,
          wavelength: 31,
          speed: 6,
          direction: new Vector3(0.7, 0, 0.7),
          steepness: 0.2
        });
        break;

      case 'moderate':
        gerstner.addWave({
          amplitude: 1.5,
          wavelength: 80,
          speed: 12,
          direction: new Vector3(1, 0, 0),
          steepness: 0.4
        });
        gerstner.addWave({
          amplitude: 1.0,
          wavelength: 45,
          speed: 10,
          direction: new Vector3(0.8, 0, 0.6),
          steepness: 0.3
        });
        gerstner.addWave({
          amplitude: 0.6,
          wavelength: 25,
          speed: 8,
          direction: new Vector3(0.6, 0, 0.8),
          steepness: 0.3
        });
        break;

      case 'rough':
        gerstner.addWave({
          amplitude: 3.0,
          wavelength: 120,
          speed: 15,
          direction: new Vector3(1, 0, 0),
          steepness: 0.6
        });
        gerstner.addWave({
          amplitude: 2.0,
          wavelength: 70,
          speed: 13,
          direction: new Vector3(0.9, 0, 0.4),
          steepness: 0.5
        });
        gerstner.addWave({
          amplitude: 1.2,
          wavelength: 35,
          speed: 11,
          direction: new Vector3(0.7, 0, 0.7),
          steepness: 0.4
        });
        gerstner.addWave({
          amplitude: 0.7,
          wavelength: 18,
          speed: 9,
          direction: new Vector3(0.5, 0, 0.8),
          steepness: 0.4
        });
        break;

      case 'storm':
        gerstner.addWave({
          amplitude: 5.0,
          wavelength: 180,
          speed: 20,
          direction: new Vector3(1, 0, 0),
          steepness: 0.8
        });
        gerstner.addWave({
          amplitude: 3.5,
          wavelength: 100,
          speed: 17,
          direction: new Vector3(0.95, 0, 0.3),
          steepness: 0.7
        });
        gerstner.addWave({
          amplitude: 2.5,
          wavelength: 55,
          speed: 14,
          direction: new Vector3(0.8, 0, 0.6),
          steepness: 0.6
        });
        gerstner.addWave({
          amplitude: 1.5,
          wavelength: 28,
          speed: 12,
          direction: new Vector3(0.6, 0, 0.8),
          steepness: 0.5
        });
        gerstner.addWave({
          amplitude: 0.9,
          wavelength: 14,
          speed: 10,
          direction: new Vector3(0.4, 0, 0.9),
          steepness: 0.5
        });
        break;
    }

    return gerstner;
  }
}

import { Vector3 } from '../math/Vector3';
import { Logger } from '../core/Logger';

/**
 * Ocean material parameters
 */
export interface OceanMaterialParams {
  // Base color
  deepColor: [number, number, number];
  shallowColor: [number, number, number];
  depthFalloff: number;

  // Fresnel
  fresnelBias: number;
  fresnelStrength: number;
  fresnelPower: number;

  // Specular
  specularColor: [number, number, number];
  specularIntensity: number;
  roughness: number;
  metallic: number;

  // Subsurface scattering
  sssColor: [number, number, number];
  sssStrength: number;
  sssDistortion: number;
  sssScale: number;

  // Reflection
  reflectionStrength: number;
  refractionStrength: number;
  refractionIndex: number;

  // Foam
  foamColor: [number, number, number];
  foamThreshold: number;
  foamIntensity: number;

  // Animation
  normalStrength: number;
  displacementStrength: number;
}

/**
 * OceanMaterial - Ocean surface material with SSR and subsurface scattering
 *
 * Implements physically-based ocean material with:
 * - Fresnel reflection
 * - Subsurface scattering
 * - Screen-space reflections
 * - Refraction
 * - Foam rendering
 * - Depth-based color variation
 *
 * @example
 * ```typescript
 * const material = new OceanMaterial();
 * material.setParams({ fresnelPower: 5.0 });
 * const color = material.calculateColor(view, normal, depth);
 * ```
 */
export class OceanMaterial {
  private params: OceanMaterialParams;
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();

    this.params = {
      deepColor: [0.0, 0.1, 0.2],
      shallowColor: [0.0, 0.5, 0.6],
      depthFalloff: 0.1,

      fresnelBias: 0.02,
      fresnelStrength: 1.0,
      fresnelPower: 5.0,

      specularColor: [1.0, 1.0, 1.0],
      specularIntensity: 1.0,
      roughness: 0.05,
      metallic: 0.0,

      sssColor: [0.1, 0.6, 0.5],
      sssStrength: 0.5,
      sssDistortion: 0.2,
      sssScale: 1.0,

      reflectionStrength: 0.8,
      refractionStrength: 0.3,
      refractionIndex: 1.33,

      foamColor: [1.0, 1.0, 1.0],
      foamThreshold: 0.5,
      foamIntensity: 1.0,

      normalStrength: 1.0,
      displacementStrength: 1.0
    };
  }

  /**
   * Sets material parameters
   */
  public setParams(params: Partial<OceanMaterialParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Gets material parameters
   */
  public getParams(): OceanMaterialParams {
    return { ...this.params };
  }

  /**
   * Calculates Fresnel term
   */
  public calculateFresnel(viewDir: Vector3, normal: Vector3): number {
    const { fresnelBias, fresnelStrength, fresnelPower } = this.params;

    const NdotV = Math.max(0, normal.dot(viewDir));
    const fresnel = fresnelBias + (1 - fresnelBias) * Math.pow(1 - NdotV, fresnelPower);

    return Math.min(1, fresnel * fresnelStrength);
  }

  /**
   * Calculates specular highlight
   */
  public calculateSpecular(viewDir: Vector3, lightDir: Vector3, normal: Vector3): number {
    const { specularIntensity, roughness } = this.params;

    // Half vector
    const halfDir = viewDir.clone().add(lightDir).normalize();
    const NdotH = Math.max(0, normal.dot(halfDir));

    // Blinn-Phong specular
    const shininess = (1 - roughness) * 128;
    const specular = Math.pow(NdotH, shininess) * specularIntensity;

    return specular;
  }

  /**
   * Calculates subsurface scattering
   */
  public calculateSSS(viewDir: Vector3, lightDir: Vector3, normal: Vector3, thickness: number): number {
    const { sssStrength, sssDistortion, sssScale } = this.params;

    // Distorted light direction
    const distortedLight = lightDir.clone().add(normal.clone().multiplyScalar(sssDistortion)).normalize();

    // Subsurface scattering
    const VdotL = Math.max(0, viewDir.dot(distortedLight.clone().negate()));
    const sss = Math.pow(VdotL, sssScale) * sssStrength * thickness;

    return sss;
  }

  /**
   * Calculates depth-based color
   */
  public calculateDepthColor(depth: number): [number, number, number] {
    const { deepColor, shallowColor, depthFalloff } = this.params;

    const t = 1 - Math.exp(-depth * depthFalloff);

    return [
      shallowColor[0] + (deepColor[0] - shallowColor[0]) * t,
      shallowColor[1] + (deepColor[1] - shallowColor[1]) * t,
      shallowColor[2] + (deepColor[2] - shallowColor[2]) * t
    ];
  }

  /**
   * Calculates foam intensity
   */
  public calculateFoam(jacobian: number, height: number): number {
    const { foamThreshold, foamIntensity } = this.params;

    // Foam from wave compression
    let foam = 0;

    if (jacobian < 0) {
      foam = Math.abs(jacobian) * foamIntensity;
    }

    // Additional foam at wave crests
    if (height > 0.5) {
      foam += (height - 0.5) * 2 * foamIntensity;
    }

    return Math.min(1, foam);
  }

  /**
   * Calculates refraction offset
   */
  public calculateRefraction(viewDir: Vector3, normal: Vector3): Vector3 {
    const { refractionStrength, refractionIndex } = this.params;

    const eta = 1.0 / refractionIndex;
    const NdotV = normal.dot(viewDir);
    const k = 1 - eta * eta * (1 - NdotV * NdotV);

    if (k < 0) {
      // Total internal reflection
      return normal.clone().multiplyScalar(2 * NdotV).sub(viewDir);
    }

    const refracted = viewDir.clone()
      .multiplyScalar(eta)
      .sub(normal.clone().multiplyScalar(eta * NdotV + Math.sqrt(k)));

    return refracted.multiplyScalar(refractionStrength);
  }

  /**
   * Calculates complete ocean color
   */
  public calculateColor(
    viewDir: Vector3,
    normal: Vector3,
    lightDir: Vector3,
    depth: number,
    jacobian: number,
    height: number,
    reflectionColor: [number, number, number],
    skyColor: [number, number, number]
  ): [number, number, number] {
    // Depth color
    const depthColor = this.calculateDepthColor(depth);

    // Fresnel
    const fresnel = this.calculateFresnel(viewDir, normal);

    // Specular
    const specular = this.calculateSpecular(viewDir, lightDir, normal);

    // Subsurface scattering
    const sss = this.calculateSSS(viewDir, lightDir, normal, 1 - depth * 0.1);

    // Foam
    const foam = this.calculateFoam(jacobian, height);

    // Mix colors
    const baseColor = [
      depthColor[0] + this.params.sssColor[0] * sss,
      depthColor[1] + this.params.sssColor[1] * sss,
      depthColor[2] + this.params.sssColor[2] * sss
    ];

    const reflectedColor = [
      reflectionColor[0] * this.params.reflectionStrength,
      reflectionColor[1] * this.params.reflectionStrength,
      reflectionColor[2] * this.params.reflectionStrength
    ];

    const finalColor = [
      baseColor[0] * (1 - fresnel) + reflectedColor[0] * fresnel + this.params.specularColor[0] * specular + this.params.foamColor[0] * foam,
      baseColor[1] * (1 - fresnel) + reflectedColor[1] * fresnel + this.params.specularColor[1] * specular + this.params.foamColor[1] * foam,
      baseColor[2] * (1 - fresnel) + reflectedColor[2] * fresnel + this.params.specularColor[2] * specular + this.params.foamColor[2] * foam
    ];

    return [
      Math.min(1, Math.max(0, finalColor[0])),
      Math.min(1, Math.max(0, finalColor[1])),
      Math.min(1, Math.max(0, finalColor[2]))
    ];
  }

  /**
   * Gets preset material configurations
   */
  public static getPreset(preset: 'tropical' | 'arctic' | 'deep' | 'murky'): Partial<OceanMaterialParams> {
    switch (preset) {
      case 'tropical':
        return {
          deepColor: [0.0, 0.15, 0.3],
          shallowColor: [0.0, 0.7, 0.8],
          sssColor: [0.2, 0.8, 0.7],
          fresnelPower: 5.0
        };

      case 'arctic':
        return {
          deepColor: [0.1, 0.15, 0.2],
          shallowColor: [0.3, 0.5, 0.6],
          sssColor: [0.4, 0.5, 0.6],
          fresnelPower: 3.0
        };

      case 'deep':
        return {
          deepColor: [0.0, 0.05, 0.1],
          shallowColor: [0.0, 0.2, 0.3],
          sssColor: [0.0, 0.3, 0.4],
          fresnelPower: 7.0
        };

      case 'murky':
        return {
          deepColor: [0.1, 0.15, 0.1],
          shallowColor: [0.2, 0.35, 0.25],
          sssColor: [0.3, 0.4, 0.3],
          fresnelPower: 4.0
        };
    }
  }

  /**
   * Applies preset configuration
   */
  public applyPreset(preset: 'tropical' | 'arctic' | 'deep' | 'murky'): void {
    const presetParams = OceanMaterial.getPreset(preset);
    this.setParams(presetParams);
  }
}

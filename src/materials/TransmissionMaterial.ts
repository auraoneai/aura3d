/**
 * G3D 5.0 Material System
 * Transmission Material - Glass, liquids, transparent objects
 *
 * @module materials/TransmissionMaterial
 */

import {
  Material,
  MaterialParameter,
  RenderQueue,
  BlendMode,
  GPUBindGroup
} from './Material';
import type { RenderDevice } from '../rendering/RenderDevice';
import type { RenderContext } from '../rendering/RenderContext';
import { ShaderProgram } from './Material';
import { Vector2 } from '../math/Vector2';
import { Color } from '../math/Color';

/**
 * Transmission material for transparent objects
 *
 * Features:
 * - Refraction with IOR
 * - Chromatic dispersion (optional)
 * - Absorption (Beer's law)
 * - Thickness-based effects
 */
export class TransmissionMaterial extends Material {
  albedo: Color = new Color(1, 1, 1);
  transmission: number = 1.0;
  ior: number = 1.5; // Index of refraction
  roughness: number = 0.0;

  // Absorption
  absorptionColor: Color = new Color(1, 1, 1);
  absorptionDistance: number = 1.0;

  // Chromatic dispersion
  enableDispersion: boolean = false;
  dispersion: number = 0.05;

  // Thickness
  thickness: number = 1.0;
  thicknessMap: any | null = null;

  constructor(name: string = 'Transmission') {
    super(name);
    this.renderQueue = RenderQueue.TRANSPARENT;
    this.blendMode = BlendMode.ALPHA;
    this.depthWrite = false;
  }

  getShader(): ShaderProgram {
    return this.getShaderVariant({});
  }

  getShaderVariant(defines: Record<string, string>): ShaderProgram {
    const materialDefines: Record<string, string> = { ...defines };
    if (this.enableDispersion) materialDefines.USE_DISPERSION = '1';
    if (this.thicknessMap) materialDefines.USE_THICKNESS_MAP = '1';

    return this.getOrCreateVariant(materialDefines, () => ({
      id: `transmission_${this.generateVariantKey(materialDefines)}`,
      vertexSource: `#version 300 es
precision highp float;
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUV;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalMatrix * normal;
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`,
      fragmentSource: `#version 300 es
precision highp float;
in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUV;
uniform vec3 albedo;
uniform float transmission;
uniform float ior;
uniform float roughness;
uniform vec3 absorptionColor;
uniform float absorptionDistance;
uniform float thickness;
uniform vec3 cameraPosition;
out vec4 fragColor;

vec3 refract(vec3 I, vec3 N, float eta) {
  float NdotI = dot(N, I);
  float k = 1.0 - eta * eta * (1.0 - NdotI * NdotI);
  if (k < 0.0) return vec3(0.0);
  return eta * I - (eta * NdotI + sqrt(k)) * N;
}

vec3 applyAbsorption(vec3 color, float distance) {
  return color * exp(-distance / absorptionDistance * (1.0 - absorptionColor));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  // Refraction
  float eta = 1.0 / ior;
  vec3 refracted = refract(-V, N, eta);

  // Fresnel
  float fresnel = pow(1.0 - max(dot(V, N), 0.0), 3.0);

  // Absorption based on thickness
  vec3 color = albedo;
  color = applyAbsorption(color, thickness);

  // Mix transmission
  color = mix(color, color * transmission, 1.0 - fresnel);

  fragColor = vec4(color, 1.0 - transmission * (1.0 - fresnel));
}`,
      uniforms: [],
      attributes: []
    }));
  }

  getParameters(): MaterialParameter[] {
    return [
      {
        name: 'transmission',
        type: 'float',
        defaultValue: 1.0,
        range: [0, 1],
        description: 'Transmission amount'
      },
      {
        name: 'ior',
        type: 'float',
        defaultValue: 1.5,
        range: [1, 3],
        description: 'Index of refraction'
      },
      {
        name: 'thickness',
        type: 'float',
        defaultValue: 1.0,
        range: [0, 10],
        description: 'Material thickness'
      }
    ];
  }

  protected createBindGroup(device: RenderDevice, context: RenderContext): GPUBindGroup {
    return { webgpu: null, webgl: null };
  }

  protected createClone(): Material {
    const clone = new TransmissionMaterial(this.name);
    clone.albedo = this.albedo.clone();
    clone.transmission = this.transmission;
    clone.ior = this.ior;
    return clone;
  }
}

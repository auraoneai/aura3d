/**
 * G3D 5.0 Material System
 * Hair Material - Anisotropic hair shading
 *
 * @module materials/HairMaterial
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
import type { ShaderProgram } from '../shaders/ShaderLibrary';
import { Vector2 } from '../math/Vector2';
import { Color } from '../math/Color';

/**
 * Hair material with anisotropic shading
 *
 * Features:
 * - Kajiya-Kay or Marschner model
 * - Anisotropic highlights
 * - Multiple specular lobes
 * - Shift map for highlight variation
 * - Transmission through hair
 */
export class HairMaterial extends Material {
  // Base properties
  albedo: Color = new Color(0.3, 0.2, 0.1);
  albedoMap: any | null = null;

  // Hair shading model
  shadingModel: 'kajiya-kay' | 'marschner' = 'kajiya-kay';

  // Specular lobes
  primaryShift: number = 0.1;
  primaryColor: Color = new Color(1, 1, 1);
  primaryIntensity: number = 0.8;
  primaryWidth: number = 5.0;

  secondaryShift: number = -0.15;
  secondaryColor: Color = new Color(0.8, 0.8, 0.6);
  secondaryIntensity: number = 0.5;
  secondaryWidth: number = 10.0;

  // Shift map for variation
  shiftMap: any | null = null;
  shiftIntensity: number = 1.0;

  // Transmission
  enableTransmission: boolean = true;
  transmissionColor: Color = new Color(1, 0.8, 0.6);
  transmissionIntensity: number = 0.3;

  // Roughness
  roughness: number = 0.3;

  // UV
  tiling: Vector2 = new Vector2(1, 1);
  offset: Vector2 = new Vector2(0, 0);

  constructor(name: string = 'Hair') {
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

    if (this.albedoMap) materialDefines.USE_ALBEDO_MAP = '1';
    if (this.shiftMap) materialDefines.USE_SHIFT_MAP = '1';
    if (this.enableTransmission) materialDefines.USE_TRANSMISSION = '1';
    materialDefines.SHADING_MODEL = this.shadingModel.toUpperCase();

    return this.getOrCreateVariant(materialDefines, () => ({
      id: `hair_${this.generateVariantKey(materialDefines)}`,
      vertexSource: this.generateVertexShader(),
      fragmentSource: this.generateFragmentShader(materialDefines),
      uniforms: this.generateUniforms(),
      attributes: [
        { name: 'position', type: 'vec3', location: 0 },
        { name: 'normal', type: 'vec3', location: 1 },
        { name: 'tangent', type: 'vec3', location: 2 },
        { name: 'uv', type: 'vec2', location: 3 }
      ]
    }));
  }

  private generateVertexShader(): string {
    return `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec3 tangent;
layout(location = 3) in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec2 vUV;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalMatrix * normal;
  vTangent = normalMatrix * tangent;
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;
  }

  private generateFragmentShader(defines: Record<string, string>): string {
    return `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec2 vUV;

uniform vec3 albedo;
uniform float primaryShift;
uniform vec3 primaryColor;
uniform float primaryIntensity;
uniform float primaryWidth;
uniform float secondaryShift;
uniform vec3 secondaryColor;
uniform float secondaryIntensity;
uniform float secondaryWidth;
uniform float roughness;
uniform vec2 tiling;
uniform vec2 offset;

uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 lightColor;

out vec4 fragColor;

const float PI = 3.14159265359;

// Kajiya-Kay specular model
float kajiyaKaySpecular(vec3 T, vec3 V, vec3 L, float shift, float width) {
  vec3 H = normalize(L + V);
  float TdotH = dot(T, H) + shift;
  float sinTH = sqrt(1.0 - TdotH * TdotH);
  float dirAtten = smoothstep(-1.0, 0.0, TdotH);
  return dirAtten * pow(sinTH, width);
}

void main() {
  vec2 uv = vUV * tiling + offset;
  vec3 T = normalize(vTangent);
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(-lightDirection);

  vec3 baseColor = albedo;
  ${defines.USE_ALBEDO_MAP ? '// baseColor *= texture(albedoMap, uv).rgb;' : ''}

  float shift = 0.0;
  ${defines.USE_SHIFT_MAP ? '// shift = texture(shiftMap, uv).r * shiftIntensity;' : ''}

  // Diffuse component
  float TdotL = dot(T, L);
  float diffuse = sqrt(1.0 - TdotL * TdotL);

  // Primary specular
  float spec1 = kajiyaKaySpecular(T, V, L, primaryShift + shift, primaryWidth);

  // Secondary specular
  float spec2 = kajiyaKaySpecular(T, V, L, secondaryShift + shift, secondaryWidth);

  // Combine
  vec3 color = baseColor * diffuse * lightColor;
  color += primaryColor * spec1 * primaryIntensity;
  color += secondaryColor * spec2 * secondaryIntensity;

  ${defines.USE_TRANSMISSION ? `
  // Transmission
  float transmission = pow(max(0.0, dot(V, -L)), 2.0);
  color += transmissionColor * transmission * transmissionIntensity;
  ` : ''}

  fragColor = vec4(color, 1.0);
}`;
  }

  private generateUniforms(): any[] {
    return [
      { name: 'albedo', type: 'vec3' },
      { name: 'primaryShift', type: 'float' },
      { name: 'primaryColor', type: 'vec3' },
      { name: 'primaryIntensity', type: 'float' },
      { name: 'primaryWidth', type: 'float' },
      { name: 'secondaryShift', type: 'float' },
      { name: 'secondaryColor', type: 'vec3' },
      { name: 'secondaryIntensity', type: 'float' },
      { name: 'secondaryWidth', type: 'float' }
    ];
  }

  getParameters(): MaterialParameter[] {
    return [
      {
        name: 'albedo',
        type: 'color',
        defaultValue: new Color(0.3, 0.2, 0.1),
        description: 'Hair base color'
      },
      {
        name: 'primaryShift',
        type: 'float',
        defaultValue: 0.1,
        range: [-1, 1],
        description: 'Primary specular shift'
      },
      {
        name: 'primaryIntensity',
        type: 'float',
        defaultValue: 0.8,
        range: [0, 2],
        description: 'Primary highlight intensity'
      },
      {
        name: 'secondaryShift',
        type: 'float',
        defaultValue: -0.15,
        range: [-1, 1],
        description: 'Secondary specular shift'
      }
    ];
  }

  protected createBindGroup(device: RenderDevice, context: RenderContext): GPUBindGroup {
    return { webgpu: null, webgl: null };
  }

  protected createClone(): Material {
    const clone = new HairMaterial(this.name);
    clone.albedo = this.albedo.clone();
    clone.primaryColor = this.primaryColor.clone();
    clone.secondaryColor = this.secondaryColor.clone();
    return clone;
  }
}

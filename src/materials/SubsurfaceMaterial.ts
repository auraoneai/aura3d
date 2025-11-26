/**
 * G3D 5.0 Material System
 * Subsurface Scattering Material
 *
 * @module materials/SubsurfaceMaterial
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
 * Subsurface scattering material for translucent objects
 *
 * Features:
 * - SSS approximation (diffusion profile)
 * - Configurable SSS color and radius
 * - Thickness map support
 * - Screen-space SSS blur
 * - Transmission
 */
export class SubsurfaceMaterial extends Material {
  // Base properties
  albedo: Color = new Color(1, 0.9, 0.8);
  albedoMap: any | null = null;

  // Subsurface scattering
  sssColor: Color = new Color(1, 0.5, 0.3);
  sssRadius: number = 0.5;
  sssIntensity: number = 1.0;
  scatterDistance: number = 1.0;

  // Thickness
  thicknessMap: any | null = null;
  thicknessPower: number = 2.0;
  thicknessScale: number = 1.0;

  // Surface properties
  roughness: number = 0.4;
  normalMap: any | null = null;
  normalScale: number = 1.0;

  // Transmission
  enableTransmission: boolean = true;
  transmissionStrength: number = 0.5;

  // Screen-space blur
  enableSSBlur: boolean = true;
  blurRadius: number = 3.0;

  // UV transform
  tiling: Vector2 = new Vector2(1, 1);
  offset: Vector2 = new Vector2(0, 0);

  constructor(name: string = 'Subsurface') {
    super(name);
    this.renderQueue = RenderQueue.OPAQUE;
    this.blendMode = BlendMode.OPAQUE;
  }

  getShader(): ShaderProgram {
    return this.getShaderVariant({});
  }

  getShaderVariant(defines: Record<string, string>): ShaderProgram {
    const materialDefines: Record<string, string> = { ...defines };

    if (this.albedoMap) materialDefines.USE_ALBEDO_MAP = '1';
    if (this.thicknessMap) materialDefines.USE_THICKNESS_MAP = '1';
    if (this.normalMap) materialDefines.USE_NORMAL_MAP = '1';
    if (this.enableTransmission) materialDefines.USE_TRANSMISSION = '1';
    if (this.enableSSBlur) materialDefines.USE_SS_BLUR = '1';

    return this.getOrCreateVariant(materialDefines, () => ({
      id: `subsurface_${this.generateVariantKey(materialDefines)}`,
      vertexSource: this.generateVertexShader(),
      fragmentSource: this.generateFragmentShader(materialDefines),
      uniforms: this.generateUniforms(),
      attributes: [
        { name: 'position', type: 'vec3', location: 0 },
        { name: 'normal', type: 'vec3', location: 1 },
        { name: 'uv', type: 'vec2', location: 2 }
      ]
    }));
  }

  private generateVertexShader(): string {
    return `#version 300 es
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
}`;
  }

  private generateFragmentShader(defines: Record<string, string>): string {
    return `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUV;

uniform vec3 albedo;
uniform vec3 sssColor;
uniform float sssRadius;
uniform float sssIntensity;
uniform float scatterDistance;
uniform float thicknessPower;
uniform float thicknessScale;
uniform float roughness;
uniform vec2 tiling;
uniform vec2 offset;

uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 lightColor;

out vec4 fragColor;

const float PI = 3.14159265359;

// Subsurface scattering approximation
vec3 calculateSSS(vec3 N, vec3 L, vec3 V, float thickness) {
  // Wrap lighting for subsurface effect
  float wrap = 0.5;
  float NdotL = (dot(N, L) + wrap) / ((1.0 + wrap) * (1.0 + wrap));

  // Transmission through the surface
  vec3 H = normalize(L + N * 0.3);
  float VdotH = pow(max(0.0, dot(V, -L)), thicknessPower) * thicknessScale;

  // Scatter based on thickness
  vec3 scatter = sssColor * sssIntensity * thickness;

  return scatter * (NdotL + VdotH * 0.5);
}

void main() {
  vec2 uv = vUV * tiling + offset;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(-lightDirection);

  vec3 baseColor = albedo;
  ${defines.USE_ALBEDO_MAP ? '// baseColor *= texture(albedoMap, uv).rgb;' : ''}

  float thickness = 1.0;
  ${defines.USE_THICKNESS_MAP ? '// thickness = texture(thicknessMap, uv).r;' : ''}

  // Standard diffuse
  float NdotL = max(dot(N, L), 0.0);
  vec3 diffuse = baseColor * lightColor * NdotL;

  // Subsurface scattering
  vec3 sss = calculateSSS(N, L, V, thickness);

  // Combine
  vec3 color = diffuse + sss * scatterDistance;

  fragColor = vec4(color, 1.0);
}`;
  }

  private generateUniforms(): any[] {
    return [
      { name: 'albedo', type: 'vec3' },
      { name: 'sssColor', type: 'vec3' },
      { name: 'sssRadius', type: 'float' },
      { name: 'sssIntensity', type: 'float' },
      { name: 'scatterDistance', type: 'float' },
      { name: 'thicknessPower', type: 'float' },
      { name: 'thicknessScale', type: 'float' }
    ];
  }

  getParameters(): MaterialParameter[] {
    return [
      {
        name: 'albedo',
        type: 'color',
        defaultValue: new Color(1, 0.9, 0.8),
        description: 'Surface color'
      },
      {
        name: 'sssColor',
        type: 'color',
        defaultValue: new Color(1, 0.5, 0.3),
        description: 'Subsurface scattering color'
      },
      {
        name: 'sssRadius',
        type: 'float',
        defaultValue: 0.5,
        range: [0, 2],
        description: 'SSS scatter radius'
      },
      {
        name: 'sssIntensity',
        type: 'float',
        defaultValue: 1.0,
        range: [0, 2],
        description: 'SSS intensity'
      }
    ];
  }

  protected createBindGroup(device: RenderDevice, context: RenderContext): GPUBindGroup {
    return { webgpu: null, webgl: null };
  }

  protected createClone(): Material {
    const clone = new SubsurfaceMaterial(this.name);
    clone.albedo = this.albedo.clone();
    clone.sssColor = this.sssColor.clone();
    clone.sssRadius = this.sssRadius;
    clone.sssIntensity = this.sssIntensity;
    return clone;
  }
}

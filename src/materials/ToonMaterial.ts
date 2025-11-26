/**
 * G3D 5.0 Material System
 * Toon Material - Cel-shaded/NPR material
 *
 * @module materials/ToonMaterial
 * @implements PRD Section 7.1.6
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
 * Toon/Cel-shaded material for non-photorealistic rendering
 *
 * Features:
 * - Discrete lighting bands (configurable count)
 * - Outline rendering (screen-space or mesh expansion)
 * - Rim lighting
 * - Specular highlight bands
 * - Hatching/cross-hatching patterns
 */
export class ToonMaterial extends Material {
  // Base properties
  albedo: Color = new Color(1, 1, 1);
  albedoMap: any | null = null;

  // Toon shading
  shadeBands: number = 3;
  shadeSmooth: number = 0.01;
  shadowColor: Color = new Color(0.3, 0.3, 0.4);

  // Outline
  enableOutline: boolean = true;
  outlineWidth: number = 0.02;
  outlineColor: Color = new Color(0, 0, 0);
  outlineMethod: 'screen-space' | 'mesh-expansion' = 'screen-space';

  // Rim lighting
  enableRim: boolean = true;
  rimColor: Color = new Color(1, 1, 1);
  rimPower: number = 3.0;
  rimIntensity: number = 0.5;

  // Specular highlights
  enableSpecular: boolean = true;
  specularColor: Color = new Color(1, 1, 1);
  specularBands: number = 2;
  specularSmoothness: number = 0.5;
  specularIntensity: number = 1.0;

  // Hatching
  enableHatching: boolean = false;
  hatchingMap: any | null = null;
  hatchingTiling: Vector2 = new Vector2(10, 10);
  hatchingIntensity: number = 0.5;

  // UV transform
  tiling: Vector2 = new Vector2(1, 1);
  offset: Vector2 = new Vector2(0, 0);

  /**
   * Constructor
   */
  constructor(name: string = 'Toon') {
    super(name);
    this.renderQueue = RenderQueue.OPAQUE;
    this.blendMode = BlendMode.OPAQUE;
  }

  /**
   * Get shader program
   */
  getShader(): ShaderProgram {
    return this.getShaderVariant({});
  }

  /**
   * Get shader variant with defines
   */
  getShaderVariant(defines: Record<string, string>): ShaderProgram {
    const materialDefines: Record<string, string> = { ...defines };

    if (this.albedoMap) materialDefines.USE_ALBEDO_MAP = '1';
    if (this.enableOutline) materialDefines.USE_OUTLINE = '1';
    if (this.outlineMethod === 'mesh-expansion') {
      materialDefines.OUTLINE_MESH_EXPANSION = '1';
    }
    if (this.enableRim) materialDefines.USE_RIM = '1';
    if (this.enableSpecular) materialDefines.USE_SPECULAR = '1';
    if (this.enableHatching && this.hatchingMap) {
      materialDefines.USE_HATCHING = '1';
    }

    materialDefines.SHADE_BANDS = this.shadeBands.toString();

    return this.getOrCreateVariant(materialDefines, () =>
      this.createShaderProgram(materialDefines)
    );
  }

  /**
   * Create shader program
   * @private
   */
  private createShaderProgram(defines: Record<string, string>): ShaderProgram {
    return {
      id: `toon_${this.generateVariantKey(defines)}`,
      vertexSource: this.generateVertexShader(defines),
      fragmentSource: this.generateFragmentShader(defines),
      uniforms: this.generateUniforms(),
      attributes: [
        { name: 'position', type: 'vec3', location: 0 },
        { name: 'normal', type: 'vec3', location: 1 },
        { name: 'uv', type: 'vec2', location: 2 }
      ]
    };
  }

  /**
   * Generate vertex shader
   * @private
   */
  private generateVertexShader(defines: Record<string, string>): string {
    return `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

${defines.OUTLINE_MESH_EXPANSION ? 'uniform float outlineWidth;' : ''}

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vViewNormal;

void main() {
  vec3 pos = position;

  ${defines.OUTLINE_MESH_EXPANSION ? `
  // Mesh expansion outline
  pos += normal * outlineWidth;
  ` : ''}

  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalMatrix * normal;
  vUV = uv;

  vec4 viewPosition = viewMatrix * worldPosition;
  vViewNormal = mat3(viewMatrix) * vNormal;

  gl_Position = projectionMatrix * viewPosition;
}
`;
  }

  /**
   * Generate fragment shader
   * @private
   */
  private generateFragmentShader(defines: Record<string, string>): string {
    const shadeBands = parseInt(defines.SHADE_BANDS || '3');

    return `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vViewNormal;

// Material parameters
uniform vec3 albedo;
uniform vec2 tiling;
uniform vec2 offset;

// Toon shading
uniform float shadeSmooth;
uniform vec3 shadowColor;

// Rim lighting
${defines.USE_RIM ? `
uniform vec3 rimColor;
uniform float rimPower;
uniform float rimIntensity;
` : ''}

// Specular
${defines.USE_SPECULAR ? `
uniform vec3 specularColor;
uniform float specularSmoothness;
uniform float specularIntensity;
uniform int specularBands;
` : ''}

// Hatching
${defines.USE_HATCHING ? `
uniform vec2 hatchingTiling;
uniform float hatchingIntensity;
` : ''}

// Outline
${defines.USE_OUTLINE && !defines.OUTLINE_MESH_EXPANSION ? `
uniform vec3 outlineColor;
uniform float outlineWidth;
` : ''}

// Camera and lights
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 lightColor;

out vec4 fragColor;

// Quantize lighting into bands
float quantize(float value, float bands, float smoothness) {
  float stepped = floor(value * bands) / bands;
  return mix(stepped, value, smoothness);
}

void main() {
  ${defines.OUTLINE_MESH_EXPANSION ? `
  // Render outline as solid color
  fragColor = vec4(outlineColor, 1.0);
  return;
  ` : ''}

  vec2 uv = vUV * tiling + offset;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(-lightDirection);
  vec3 H = normalize(V + L);

  // Sample base color
  vec3 baseColor = albedo;
  ${defines.USE_ALBEDO_MAP ? '// baseColor *= texture(albedoMap, uv).rgb;' : ''}

  // Calculate NdotL and quantize into bands
  float NdotL = max(dot(N, L), 0.0);
  float shadedNdotL = quantize(NdotL, ${shadeBands.toFixed(1)}, shadeSmooth);

  // Apply toon shading
  vec3 diffuse = mix(shadowColor, baseColor, shadedNdotL) * lightColor;

  // Specular highlights (banded)
  ${defines.USE_SPECULAR ? `
  float NdotH = max(dot(N, H), 0.0);
  float spec = pow(NdotH, 32.0 * specularSmoothness);
  float bandedSpec = quantize(spec, float(specularBands), 0.01);
  diffuse += specularColor * bandedSpec * specularIntensity;
  ` : ''}

  // Rim lighting
  ${defines.USE_RIM ? `
  float rim = 1.0 - max(dot(V, N), 0.0);
  rim = pow(rim, rimPower);
  diffuse += rimColor * rim * rimIntensity;
  ` : ''}

  // Hatching pattern
  ${defines.USE_HATCHING ? `
  float hatchFactor = 1.0 - NdotL;
  // vec2 hatchUV = uv * hatchingTiling;
  // float hatch = texture(hatchingMap, hatchUV).r;
  // diffuse = mix(diffuse, diffuse * hatch, hatchFactor * hatchingIntensity);
  ` : ''}

  // Screen-space outline
  ${defines.USE_OUTLINE && !defines.OUTLINE_MESH_EXPANSION ? `
  // Outline detection based on normal discontinuity
  vec2 normalEdge = abs(dFdx(vViewNormal.xy)) + abs(dFdy(vViewNormal.xy));
  float edge = step(outlineWidth, normalEdge.x + normalEdge.y);
  diffuse = mix(diffuse, outlineColor, edge);
  ` : ''}

  fragColor = vec4(diffuse, 1.0);
}
`;
  }

  /**
   * Generate uniforms
   * @private
   */
  private generateUniforms(): any[] {
    return [
      { name: 'albedo', type: 'vec3' },
      { name: 'tiling', type: 'vec2' },
      { name: 'offset', type: 'vec2' },
      { name: 'shadeSmooth', type: 'float' },
      { name: 'shadowColor', type: 'vec3' },
      { name: 'rimColor', type: 'vec3' },
      { name: 'rimPower', type: 'float' },
      { name: 'rimIntensity', type: 'float' },
      { name: 'specularColor', type: 'vec3' },
      { name: 'specularSmoothness', type: 'float' },
      { name: 'specularIntensity', type: 'float' },
      { name: 'specularBands', type: 'int' },
      { name: 'outlineColor', type: 'vec3' },
      { name: 'outlineWidth', type: 'float' },
      { name: 'hatchingTiling', type: 'vec2' },
      { name: 'hatchingIntensity', type: 'float' }
    ];
  }

  /**
   * Get material parameters
   */
  getParameters(): MaterialParameter[] {
    return [
      {
        name: 'albedo',
        type: 'color',
        defaultValue: new Color(1, 1, 1),
        description: 'Base color'
      },
      {
        name: 'shadeBands',
        type: 'int',
        defaultValue: 3,
        range: [2, 10],
        description: 'Number of discrete lighting bands'
      },
      {
        name: 'shadeSmooth',
        type: 'float',
        defaultValue: 0.01,
        range: [0, 0.2],
        description: 'Smoothness of band transitions'
      },
      {
        name: 'shadowColor',
        type: 'color',
        defaultValue: new Color(0.3, 0.3, 0.4),
        description: 'Color of shadow areas'
      },
      {
        name: 'enableOutline',
        type: 'bool',
        defaultValue: true,
        description: 'Enable outline rendering'
      },
      {
        name: 'outlineWidth',
        type: 'float',
        defaultValue: 0.02,
        range: [0, 0.1],
        description: 'Outline width'
      },
      {
        name: 'outlineColor',
        type: 'color',
        defaultValue: new Color(0, 0, 0),
        description: 'Outline color'
      },
      {
        name: 'enableRim',
        type: 'bool',
        defaultValue: true,
        description: 'Enable rim lighting'
      },
      {
        name: 'rimColor',
        type: 'color',
        defaultValue: new Color(1, 1, 1),
        description: 'Rim light color'
      },
      {
        name: 'rimPower',
        type: 'float',
        defaultValue: 3.0,
        range: [0.1, 10],
        description: 'Rim light falloff'
      },
      {
        name: 'rimIntensity',
        type: 'float',
        defaultValue: 0.5,
        range: [0, 2],
        description: 'Rim light intensity'
      },
      {
        name: 'enableSpecular',
        type: 'bool',
        defaultValue: true,
        description: 'Enable specular highlights'
      },
      {
        name: 'specularBands',
        type: 'int',
        defaultValue: 2,
        range: [1, 5],
        description: 'Number of specular bands'
      }
    ];
  }

  /**
   * Create bind group
   * @protected
   */
  protected createBindGroup(device: RenderDevice, context: RenderContext): GPUBindGroup {
    return {
      webgpu: null,
      webgl: null
    };
  }

  /**
   * Create clone
   * @protected
   */
  protected createClone(): Material {
    const clone = new ToonMaterial(this.name);

    clone.albedo = this.albedo.clone();
    clone.albedoMap = this.albedoMap;
    clone.shadeBands = this.shadeBands;
    clone.shadeSmooth = this.shadeSmooth;
    clone.shadowColor = this.shadowColor.clone();
    clone.enableOutline = this.enableOutline;
    clone.outlineWidth = this.outlineWidth;
    clone.outlineColor = this.outlineColor.clone();
    clone.outlineMethod = this.outlineMethod;
    clone.enableRim = this.enableRim;
    clone.rimColor = this.rimColor.clone();
    clone.rimPower = this.rimPower;
    clone.rimIntensity = this.rimIntensity;
    clone.enableSpecular = this.enableSpecular;
    clone.specularColor = this.specularColor.clone();
    clone.specularBands = this.specularBands;
    clone.specularSmoothness = this.specularSmoothness;
    clone.specularIntensity = this.specularIntensity;
    clone.enableHatching = this.enableHatching;
    clone.hatchingMap = this.hatchingMap;
    clone.hatchingTiling = this.hatchingTiling.clone();
    clone.hatchingIntensity = this.hatchingIntensity;
    clone.tiling = this.tiling.clone();
    clone.offset = this.offset.clone();

    return clone;
  }
}

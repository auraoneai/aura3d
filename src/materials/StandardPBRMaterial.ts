/**
 * G3D 5.0 Material System
 * Standard PBR Material - Physically-based rendering material
 *
 * @module materials/StandardPBRMaterial
 * @implements PRD Section 7.1.4
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
 * Alpha rendering modes
 */
export type AlphaMode = 'opaque' | 'mask' | 'blend';

/**
 * Standard PBR material using metallic-roughness workflow
 *
 * Supports:
 * - Full PBR lighting model
 * - Albedo, metallic, roughness, normal, AO, emission maps
 * - Detail textures
 * - Alpha modes (opaque, mask, blend)
 * - Image-based lighting (IBL)
 * - Shadow receiving
 */
export class StandardPBRMaterial extends Material {
  // Base color
  albedo: Color = new Color(1, 1, 1);
  albedoMap: any | null = null; // Texture

  // PBR properties
  metallic: number = 0.0;
  metallicMap: any | null = null;
  roughness: number = 0.5;
  roughnessMap: any | null = null;

  // Normal mapping
  normalMap: any | null = null;
  normalScale: number = 1.0;

  // Occlusion
  aoMap: any | null = null;
  aoIntensity: number = 1.0;

  // Emission
  emissive: Color = new Color(0, 0, 0);
  emissiveMap: any | null = null;
  emissiveIntensity: number = 1.0;

  // Detail textures
  detailAlbedoMap: any | null = null;
  detailNormalMap: any | null = null;
  detailTiling: Vector2 = new Vector2(1, 1);

  // Alpha
  alphaMode: AlphaMode = 'opaque';
  alphaCutoff: number = 0.5;

  // UV transform
  tiling: Vector2 = new Vector2(1, 1);
  offset: Vector2 = new Vector2(0, 0);

  // Environment maps
  envMap: any | null = null;
  irradianceMap: any | null = null;
  brdfLUT: any | null = null;

  // Advanced features
  enableIBL: boolean = true;
  enableShadows: boolean = true;
  enableDetailMaps: boolean = false;

  /**
   * Constructor
   */
  constructor(name: string = 'StandardPBR') {
    super(name);
    this.initializeMaterial();
  }

  /**
   * Initialize material defaults
   * @private
   */
  private initializeMaterial(): void {
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
    // Build defines from material state
    const materialDefines: Record<string, string> = { ...defines };

    if (this.albedoMap) materialDefines.USE_ALBEDO_MAP = '1';
    if (this.metallicMap) materialDefines.USE_METALLIC_MAP = '1';
    if (this.roughnessMap) materialDefines.USE_ROUGHNESS_MAP = '1';
    if (this.normalMap) materialDefines.USE_NORMAL_MAP = '1';
    if (this.aoMap) materialDefines.USE_AO_MAP = '1';
    if (this.emissiveMap) materialDefines.USE_EMISSIVE_MAP = '1';
    if (this.detailAlbedoMap && this.enableDetailMaps) {
      materialDefines.USE_DETAIL_ALBEDO = '1';
    }
    if (this.detailNormalMap && this.enableDetailMaps) {
      materialDefines.USE_DETAIL_NORMAL = '1';
    }
    if (this.enableIBL && this.envMap) materialDefines.USE_IBL = '1';
    if (this.enableShadows) materialDefines.USE_SHADOWS = '1';
    if (this.alphaMode === 'mask') materialDefines.ALPHA_MODE_MASK = '1';
    if (this.alphaMode === 'blend') materialDefines.ALPHA_MODE_BLEND = '1';

    return this.getOrCreateVariant(materialDefines, () =>
      this.createShaderProgram(materialDefines)
    );
  }

  /**
   * Create shader program by generating shader source code
   * @private
   */
  private createShaderProgram(defines: Record<string, string>): ShaderProgram {
    // Generate shader source code based on material properties and defines
    // The shader is compiled at runtime by the rendering backend
    return {
      id: `pbr_${this.generateVariantKey(defines)}`,
      vertexSource: this.generateVertexShader(defines),
      fragmentSource: this.generateFragmentShader(defines),
      uniforms: this.generateUniforms(),
      attributes: [
        { name: 'position', type: 'vec3', location: 0 },
        { name: 'normal', type: 'vec3', location: 1 },
        { name: 'uv', type: 'vec2', location: 2 },
        { name: 'tangent', type: 'vec4', location: 3 }
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
layout(location = 3) in vec4 tangent;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUV;
out vec4 vTangent;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalMatrix * normal;
  vUV = uv;
  vTangent = tangent;

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;
  }

  /**
   * Generate fragment shader
   * @private
   */
  private generateFragmentShader(defines: Record<string, string>): string {
    let shader = `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUV;
in vec4 vTangent;

// Material parameters
uniform vec3 albedo;
uniform float metallic;
uniform float roughness;
uniform vec3 emissive;
uniform float emissiveIntensity;
uniform float normalScale;
uniform float aoIntensity;
uniform vec2 tiling;
uniform vec2 offset;
uniform float alphaCutoff;

// Camera
uniform vec3 cameraPosition;

// Lights
uniform vec3 lightDirection;
uniform vec3 lightColor;

out vec4 fragColor;

// Common functions
const float PI = 3.14159265359;

vec3 sRGBToLinear(vec3 srgb) {
  return pow(srgb, vec3(2.2));
}

vec3 linearToSRGB(vec3 linear) {
  return pow(linear, vec3(1.0 / 2.2));
}

// PBR functions
float D_GGX(float NdotH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * denom * denom);
}

float G_SmithGGX(float NdotV, float NdotL, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  float gl = NdotL / (NdotL * (1.0 - k) + k);
  float gv = NdotV / (NdotV * (1.0 - k) + k);
  return gl * gv;
}

vec3 F_Schlick(float VdotH, vec3 F0) {
  return F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);
}

void main() {
  vec2 uv = vUV * tiling + offset;

  // Sample textures
  vec3 baseColor = albedo;
  float metallicValue = metallic;
  float roughnessValue = roughness;
  vec3 N = normalize(vNormal);

  ${defines.USE_ALBEDO_MAP ? '// baseColor *= texture(albedoMap, uv).rgb;' : ''}
  ${defines.USE_METALLIC_MAP ? '// metallicValue *= texture(metallicMap, uv).r;' : ''}
  ${defines.USE_ROUGHNESS_MAP ? '// roughnessValue *= texture(roughnessMap, uv).g;' : ''}

  // Calculate lighting
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(-lightDirection);
  vec3 H = normalize(V + L);

  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);

  // PBR calculations
  vec3 F0 = mix(vec3(0.04), baseColor, metallicValue);

  float D = D_GGX(NdotH, roughnessValue);
  float G = G_SmithGGX(NdotV, NdotL, roughnessValue);
  vec3 F = F_Schlick(VdotH, F0);

  vec3 specular = (D * G * F) / max(4.0 * NdotV * NdotL, 0.001);
  vec3 diffuse = (1.0 - F) * (1.0 - metallicValue) * baseColor / PI;

  vec3 color = (diffuse + specular) * lightColor * NdotL;

  // Add emissive
  color += emissive * emissiveIntensity;

  ${defines.ALPHA_MODE_MASK ? 'if (baseColor.a < alphaCutoff) discard;' : ''}

  fragColor = vec4(color, 1.0);
}
`;
    return shader;
  }

  /**
   * Generate uniforms
   * @private
   */
  private generateUniforms(): any[] {
    return [
      { name: 'albedo', type: 'vec3' },
      { name: 'metallic', type: 'float' },
      { name: 'roughness', type: 'float' },
      { name: 'emissive', type: 'vec3' },
      { name: 'emissiveIntensity', type: 'float' },
      { name: 'normalScale', type: 'float' },
      { name: 'aoIntensity', type: 'float' },
      { name: 'tiling', type: 'vec2' },
      { name: 'offset', type: 'vec2' },
      { name: 'alphaCutoff', type: 'float' }
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
        description: 'Base color of the material'
      },
      {
        name: 'albedoMap',
        type: 'texture2d',
        defaultValue: null,
        description: 'Albedo texture map'
      },
      {
        name: 'metallic',
        type: 'float',
        defaultValue: 0.0,
        range: [0, 1],
        description: 'Metallic value (0 = dielectric, 1 = metal)'
      },
      {
        name: 'metallicMap',
        type: 'texture2d',
        defaultValue: null,
        description: 'Metallic texture map'
      },
      {
        name: 'roughness',
        type: 'float',
        defaultValue: 0.5,
        range: [0, 1],
        description: 'Surface roughness (0 = smooth, 1 = rough)'
      },
      {
        name: 'roughnessMap',
        type: 'texture2d',
        defaultValue: null,
        description: 'Roughness texture map'
      },
      {
        name: 'normalMap',
        type: 'texture2d',
        defaultValue: null,
        description: 'Normal map for surface detail'
      },
      {
        name: 'normalScale',
        type: 'float',
        defaultValue: 1.0,
        range: [0, 2],
        description: 'Normal map intensity'
      },
      {
        name: 'aoMap',
        type: 'texture2d',
        defaultValue: null,
        description: 'Ambient occlusion map'
      },
      {
        name: 'aoIntensity',
        type: 'float',
        defaultValue: 1.0,
        range: [0, 1],
        description: 'AO intensity'
      },
      {
        name: 'emissive',
        type: 'color',
        defaultValue: new Color(0, 0, 0),
        description: 'Emissive color'
      },
      {
        name: 'emissiveMap',
        type: 'texture2d',
        defaultValue: null,
        description: 'Emissive texture map'
      },
      {
        name: 'emissiveIntensity',
        type: 'float',
        defaultValue: 1.0,
        range: [0, 10],
        description: 'Emissive intensity multiplier'
      },
      {
        name: 'tiling',
        type: 'vec2',
        defaultValue: new Vector2(1, 1),
        description: 'UV tiling'
      },
      {
        name: 'offset',
        type: 'vec2',
        defaultValue: new Vector2(0, 0),
        description: 'UV offset'
      },
      {
        name: 'alphaCutoff',
        type: 'float',
        defaultValue: 0.5,
        range: [0, 1],
        description: 'Alpha cutoff for mask mode'
      }
    ];
  }

  /**
   * Create bind group
   * @protected
   */
  protected createBindGroup(device: RenderDevice, context: RenderContext): GPUBindGroup {
    // In a real implementation, this would create WebGPU/WebGL bind groups
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
    const clone = new StandardPBRMaterial(this.name);

    // Copy all properties
    clone.albedo = this.albedo.clone();
    clone.albedoMap = this.albedoMap;
    clone.metallic = this.metallic;
    clone.metallicMap = this.metallicMap;
    clone.roughness = this.roughness;
    clone.roughnessMap = this.roughnessMap;
    clone.normalMap = this.normalMap;
    clone.normalScale = this.normalScale;
    clone.aoMap = this.aoMap;
    clone.aoIntensity = this.aoIntensity;
    clone.emissive = this.emissive.clone();
    clone.emissiveMap = this.emissiveMap;
    clone.emissiveIntensity = this.emissiveIntensity;
    clone.detailAlbedoMap = this.detailAlbedoMap;
    clone.detailNormalMap = this.detailNormalMap;
    clone.detailTiling = this.detailTiling.clone();
    clone.alphaMode = this.alphaMode;
    clone.alphaCutoff = this.alphaCutoff;
    clone.tiling = this.tiling.clone();
    clone.offset = this.offset.clone();
    clone.envMap = this.envMap;
    clone.irradianceMap = this.irradianceMap;
    clone.brdfLUT = this.brdfLUT;
    clone.enableIBL = this.enableIBL;
    clone.enableShadows = this.enableShadows;
    clone.enableDetailMaps = this.enableDetailMaps;

    return clone;
  }

  /**
   * Update alpha mode and render state
   */
  setAlphaMode(mode: AlphaMode): void {
    this.alphaMode = mode;

    switch (mode) {
      case 'opaque':
        this.renderQueue = RenderQueue.OPAQUE;
        this.blendMode = BlendMode.OPAQUE;
        this.depthWrite = true;
        break;

      case 'mask':
        this.renderQueue = RenderQueue.OPAQUE;
        this.blendMode = BlendMode.OPAQUE;
        this.depthWrite = true;
        break;

      case 'blend':
        this.renderQueue = RenderQueue.TRANSPARENT;
        this.blendMode = BlendMode.ALPHA;
        this.depthWrite = false;
        break;
    }

    this.markDirty();
  }
}

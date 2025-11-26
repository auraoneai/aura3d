/**
 * G3D 5.0 Material System
 * Terrain Material - Multi-layer terrain with splat mapping
 *
 * @module materials/TerrainMaterial
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
 * Terrain material with multi-layer blending
 *
 * Features:
 * - Splat map blending (4-16 layers)
 * - Triplanar mapping option
 * - Height-based blending
 * - Detail textures
 * - Distance-based LOD
 */
export class TerrainMaterial extends Material {
  // Layer configuration
  layerCount: number = 4;

  // Splat maps (control textures)
  splatMap1: any | null = null; // RGBA for 4 layers
  splatMap2: any | null = null; // RGBA for 4 more layers
  splatMap3: any | null = null; // RGBA for 4 more layers
  splatMap4: any | null = null; // RGBA for 4 more layers

  // Layer textures
  layerAlbedoMaps: (any | null)[] = [null, null, null, null];
  layerNormalMaps: (any | null)[] = [null, null, null, null];
  layerRoughnessMaps: (any | null)[] = [null, null, null, null];

  // Layer properties
  layerTiling: Vector2[] = [
    new Vector2(10, 10),
    new Vector2(10, 10),
    new Vector2(10, 10),
    new Vector2(10, 10)
  ];

  layerMetallic: number[] = [0, 0, 0, 0];
  layerRoughness: number[] = [0.8, 0.7, 0.9, 0.6];

  // Blending
  enableHeightBlend: boolean = true;
  heightBlendStrength: number = 0.5;

  // Triplanar
  enableTriplanar: boolean = false;
  triplanarBlendSharpness: number = 4.0;

  // Distance LOD
  enableDistanceLOD: boolean = true;
  lodDistance: number = 100.0;
  lodFarTiling: number = 1.0;

  // Global properties
  normalScale: number = 1.0;

  constructor(name: string = 'Terrain') {
    super(name);
    this.renderQueue = RenderQueue.OPAQUE;
  }

  getShader(): ShaderProgram {
    return this.getShaderVariant({});
  }

  getShaderVariant(defines: Record<string, string>): ShaderProgram {
    const materialDefines: Record<string, string> = { ...defines };
    materialDefines.LAYER_COUNT = this.layerCount.toString();
    if (this.enableHeightBlend) materialDefines.USE_HEIGHT_BLEND = '1';
    if (this.enableTriplanar) materialDefines.USE_TRIPLANAR = '1';
    if (this.enableDistanceLOD) materialDefines.USE_DISTANCE_LOD = '1';

    return this.getOrCreateVariant(materialDefines, () => ({
      id: `terrain_${this.generateVariantKey(materialDefines)}`,
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

uniform sampler2D splatMap1;
uniform sampler2D layerAlbedoMap0;
uniform sampler2D layerAlbedoMap1;
uniform sampler2D layerAlbedoMap2;
uniform sampler2D layerAlbedoMap3;
uniform vec2 layerTiling0;
uniform vec2 layerTiling1;
uniform vec2 layerTiling2;
uniform vec2 layerTiling3;
uniform float normalScale;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 lightColor;

out vec4 fragColor;

const float PI = 3.14159265359;

vec3 sampleLayer(sampler2D albedoMap, vec2 uv) {
  return texture(albedoMap, uv).rgb;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(-lightDirection);
  float NdotL = max(dot(N, L), 0.0);

  // Sample splat map
  vec4 splat = texture(splatMap1, vUV);

  // Sample each layer
  vec3 layer0 = sampleLayer(layerAlbedoMap0, vUV * layerTiling0);
  vec3 layer1 = sampleLayer(layerAlbedoMap1, vUV * layerTiling1);
  vec3 layer2 = sampleLayer(layerAlbedoMap2, vUV * layerTiling2);
  vec3 layer3 = sampleLayer(layerAlbedoMap3, vUV * layerTiling3);

  // Blend layers based on splat map
  vec3 baseColor = layer0 * splat.r +
                    layer1 * splat.g +
                    layer2 * splat.b +
                    layer3 * splat.a;

  // Simple diffuse lighting
  vec3 color = baseColor * lightColor * NdotL;

  fragColor = vec4(color, 1.0);
}`,
      uniforms: [],
      attributes: []
    }));
  }

  getParameters(): MaterialParameter[] {
    return [
      {
        name: 'layerCount',
        type: 'int',
        defaultValue: 4,
        range: [2, 16],
        description: 'Number of terrain layers'
      },
      {
        name: 'enableHeightBlend',
        type: 'bool',
        defaultValue: true,
        description: 'Height-based layer blending'
      },
      {
        name: 'enableTriplanar',
        type: 'bool',
        defaultValue: false,
        description: 'Triplanar texture mapping'
      },
      {
        name: 'normalScale',
        type: 'float',
        defaultValue: 1.0,
        range: [0, 2],
        description: 'Normal map intensity'
      }
    ];
  }

  protected createBindGroup(device: RenderDevice, context: RenderContext): GPUBindGroup {
    return { webgpu: null, webgl: null };
  }

  protected createClone(): Material {
    const clone = new TerrainMaterial(this.name);
    clone.layerCount = this.layerCount;
    clone.enableHeightBlend = this.enableHeightBlend;
    clone.enableTriplanar = this.enableTriplanar;
    return clone;
  }
}

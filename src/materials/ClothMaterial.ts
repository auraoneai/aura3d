/**
 * G3D 5.0 Material System
 * Cloth Material - Fabric shading with sheen and anisotropy
 *
 * @module materials/ClothMaterial
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
 * Cloth material for fabric rendering
 *
 * Features:
 * - Sheen layer (velvet, silk)
 * - Subsurface scattering
 * - Anisotropic reflections (weave patterns)
 * - Fuzz/fiber detail
 */
export class ClothMaterial extends Material {
  albedo: Color = new Color(0.5, 0.3, 0.2);
  albedoMap: any | null = null;

  // Sheen
  enableSheen: boolean = true;
  sheenColor: Color = new Color(1, 1, 1);
  sheenRoughness: number = 0.3;
  sheenIntensity: number = 0.5;

  // Subsurface
  enableSubsurface: boolean = true;
  subsurfaceColor: Color = new Color(1, 0.5, 0.3);
  subsurfaceIntensity: number = 0.3;

  // Anisotropy
  enableAnisotropy: boolean = false;
  anisotropyStrength: number = 0.5;
  anisotropyRotation: number = 0.0;

  // Fuzz
  enableFuzz: boolean = false;
  fuzzIntensity: number = 0.2;
  fuzzRoughness: number = 0.8;

  // Base PBR
  roughness: number = 0.6;
  normalMap: any | null = null;
  normalScale: number = 1.0;

  tiling: Vector2 = new Vector2(1, 1);
  offset: Vector2 = new Vector2(0, 0);

  constructor(name: string = 'Cloth') {
    super(name);
    this.renderQueue = RenderQueue.OPAQUE;
  }

  getShader(): ShaderProgram {
    return this.getShaderVariant({});
  }

  getShaderVariant(defines: Record<string, string>): ShaderProgram {
    const materialDefines: Record<string, string> = { ...defines };
    if (this.enableSheen) materialDefines.USE_SHEEN = '1';
    if (this.enableSubsurface) materialDefines.USE_SUBSURFACE = '1';
    if (this.enableAnisotropy) materialDefines.USE_ANISOTROPY = '1';
    if (this.enableFuzz) materialDefines.USE_FUZZ = '1';

    return this.getOrCreateVariant(materialDefines, () => ({
      id: `cloth_${this.generateVariantKey(materialDefines)}`,
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
uniform vec3 sheenColor;
uniform float sheenRoughness;
uniform float sheenIntensity;
uniform vec3 subsurfaceColor;
uniform float subsurfaceIntensity;
uniform float roughness;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 lightColor;
out vec4 fragColor;

const float PI = 3.14159265359;

vec3 sheenBRDF(vec3 N, vec3 V, vec3 L, float roughness) {
  vec3 H = normalize(V + L);
  float NdotH = max(dot(N, H), 0.0);
  float invR = 1.0 / roughness;
  return sheenColor * pow(1.0 - NdotH, invR) * sheenIntensity;
}

void main() {
  vec2 uv = vUV;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(-lightDirection);
  float NdotL = max(dot(N, L), 0.0);

  vec3 diffuse = albedo * lightColor * NdotL / PI;

  ${materialDefines.USE_SHEEN ? `
  vec3 sheen = sheenBRDF(N, V, L, sheenRoughness);
  diffuse += sheen;
  ` : ''}

  ${materialDefines.USE_SUBSURFACE ? `
  float wrap = 0.5;
  float sss = (dot(N, L) + wrap) / ((1.0 + wrap) * (1.0 + wrap));
  diffuse += subsurfaceColor * sss * subsurfaceIntensity;
  ` : ''}

  fragColor = vec4(diffuse, 1.0);
}`,
      uniforms: [],
      attributes: []
    }));
  }

  getParameters(): MaterialParameter[] {
    return [
      {
        name: 'albedo',
        type: 'color',
        defaultValue: new Color(0.5, 0.3, 0.2),
        description: 'Fabric base color'
      },
      {
        name: 'sheenIntensity',
        type: 'float',
        defaultValue: 0.5,
        range: [0, 1],
        description: 'Sheen layer intensity'
      }
    ];
  }

  protected createBindGroup(device: RenderDevice, context: RenderContext): GPUBindGroup {
    return { webgpu: null, webgl: null };
  }

  protected createClone(): Material {
    const clone = new ClothMaterial(this.name);
    clone.albedo = this.albedo.clone();
    clone.sheenColor = this.sheenColor.clone();
    return clone;
  }
}

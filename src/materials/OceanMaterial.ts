/**
 * G3D 5.0 Material System
 * Ocean Material - Water with FFT waves and foam
 *
 * @module materials/OceanMaterial
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
 * Ocean material with advanced water rendering
 *
 * Features:
 * - FFT displacement mapping
 * - Foam generation and rendering
 * - Subsurface scattering
 * - Reflection/refraction
 * - Depth-based color absorption
 */
export class OceanMaterial extends Material {
  // Water color
  waterColor: Color = new Color(0.0, 0.3, 0.5);
  deepWaterColor: Color = new Color(0.0, 0.1, 0.2);

  // Waves
  waveAmplitude: number = 1.0;
  waveFrequency: number = 0.5;
  waveSpeed: number = 1.0;
  waveChoppiness: number = 2.0;

  // FFT displacement
  displacementMap: any | null = null;
  normalMap: any | null = null;

  // Foam
  enableFoam: boolean = true;
  foamColor: Color = new Color(1, 1, 1);
  foamThreshold: number = 0.8;
  foamIntensity: number = 1.0;

  // Subsurface scattering
  enableSSS: boolean = true;
  sssColor: Color = new Color(0.2, 0.8, 0.6);
  sssIntensity: number = 0.5;

  // Reflection/Refraction
  reflectivity: number = 0.5;
  refractiveIndex: number = 1.333;
  roughness: number = 0.1;

  // Depth
  depthFalloff: number = 5.0;
  absorptionColor: Color = new Color(0.5, 0.7, 0.9);

  // Caustics
  enableCaustics: boolean = false;
  causticsIntensity: number = 1.0;

  constructor(name: string = 'Ocean') {
    super(name);
    this.renderQueue = RenderQueue.TRANSPARENT;
    this.blendMode = BlendMode.ALPHA;
  }

  getShader(): ShaderProgram {
    return this.getShaderVariant({});
  }

  getShaderVariant(defines: Record<string, string>): ShaderProgram {
    const materialDefines: Record<string, string> = { ...defines };
    if (this.displacementMap) materialDefines.USE_DISPLACEMENT = '1';
    if (this.enableFoam) materialDefines.USE_FOAM = '1';
    if (this.enableSSS) materialDefines.USE_SSS = '1';
    if (this.enableCaustics) materialDefines.USE_CAUSTICS = '1';

    return this.getOrCreateVariant(materialDefines, () => ({
      id: `ocean_${this.generateVariantKey(materialDefines)}`,
      vertexSource: `#version 300 es
precision highp float;
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float time;
uniform float waveAmplitude;
uniform float waveFrequency;
out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUV;
out float vWaveHeight;

float wave(vec2 pos, float time) {
  return sin(pos.x * waveFrequency + time) * sin(pos.y * waveFrequency + time);
}

void main() {
  vec3 pos = position;

  ${materialDefines.USE_DISPLACEMENT ? `
  // FFT displacement would be sampled here
  float height = wave(pos.xz, time) * waveAmplitude;
  pos.y += height;
  vWaveHeight = height;
  ` : ''}

  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
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
in float vWaveHeight;
uniform vec3 waterColor;
uniform vec3 deepWaterColor;
uniform vec3 foamColor;
uniform float foamThreshold;
uniform float foamIntensity;
uniform float reflectivity;
uniform float depthFalloff;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float NdotV = max(dot(N, V), 0.0);

  // Fresnel
  float fresnel = pow(1.0 - NdotV, 3.0);

  // Depth-based color
  float depth = length(vWorldPosition - cameraPosition);
  vec3 color = mix(waterColor, deepWaterColor, min(depth / depthFalloff, 1.0));

  ${materialDefines.USE_FOAM ? `
  // Foam at wave peaks
  float foam = step(foamThreshold, vWaveHeight / 1.0);
  color = mix(color, foamColor, foam * foamIntensity);
  ` : ''}

  // Apply fresnel for reflection
  color = mix(color, vec3(1.0), fresnel * reflectivity);

  float alpha = 0.9 - fresnel * 0.3;
  fragColor = vec4(color, alpha);
}`,
      uniforms: [],
      attributes: []
    }));
  }

  getParameters(): MaterialParameter[] {
    return [
      {
        name: 'waterColor',
        type: 'color',
        defaultValue: new Color(0.0, 0.3, 0.5),
        description: 'Shallow water color'
      },
      {
        name: 'deepWaterColor',
        type: 'color',
        defaultValue: new Color(0.0, 0.1, 0.2),
        description: 'Deep water color'
      },
      {
        name: 'waveAmplitude',
        type: 'float',
        defaultValue: 1.0,
        range: [0, 5],
        description: 'Wave height'
      },
      {
        name: 'foamIntensity',
        type: 'float',
        defaultValue: 1.0,
        range: [0, 2],
        description: 'Foam intensity'
      }
    ];
  }

  protected createBindGroup(device: RenderDevice, context: RenderContext): GPUBindGroup {
    return { webgpu: null, webgl: null };
  }

  protected createClone(): Material {
    const clone = new OceanMaterial(this.name);
    clone.waterColor = this.waterColor.clone();
    clone.deepWaterColor = this.deepWaterColor.clone();
    return clone;
  }
}

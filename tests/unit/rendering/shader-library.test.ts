import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSTANCED_PBR_SHADER_NAME,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
  DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME,
  DEFAULT_PBR_SHADER_NAME,
  DEFAULT_SKINNED_LIT_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
  DEFAULT_UNLIT_SHADER_MARKER,
  DEFAULT_UNLIT_SHADER_NAME,
  ShaderModule,
  ShaderLibrary,
  ShaderPreprocessor,
  createDefaultShaderLibrary,
  texturedPbrShaderActiveTextureSlots
} from "../../../packages/rendering/src";

describe("ShaderLibrary", () => {
  it("preserves source markers when compiling default unlit shader", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileSource(DEFAULT_UNLIT_SHADER_NAME);

    expect(compiled.vertex).toContain(DEFAULT_UNLIT_SHADER_MARKER);
    expect(compiled.fragment).toContain(DEFAULT_UNLIT_SHADER_MARKER);
  });

  it("compiles PBR shaders with GGX, Schlick Fresnel, Smith visibility, and Burley diffuse terms", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileSource(DEFAULT_PBR_SHADER_NAME);

    expect(compiled.fragment).toContain("g3dDistributionGGX");
    expect(compiled.fragment).toContain("g3dFresnelSchlick");
    expect(compiled.fragment).toContain("g3dGeometrySmithGGXCorrelated");
    expect(compiled.fragment).toContain("g3dDiffuseBurley");
    expect(compiled.fragment).toContain("g3dPbrDirectLight");
    expect(compiled.fragment).toContain("vec3 specular = D * G * F;");
    expect(compiled.fragment).toContain("clamp(specularColorFactor, vec3(0.0), vec3(1.0))");
    expect(compiled.fragment).not.toContain("D * G * F * 0.25");
    expect(compiled.fragment).toContain("u_shadowMapSlopeBias");
    expect(compiled.fragment).toContain("slopeReceiverBias");
    expect(compiled.fragment).toContain("u_shadowPcfSamples[32]");
    expect(compiled.fragment).toContain("u_shadowPcfSampleCount");
    expect(compiled.fragment).toContain("uniform vec3 u_cameraPosition;");
    expect(compiled.fragment).toContain("normalize(u_cameraPosition - v_worldPosition)");
    expect(compiled.fragment).toContain("g3dPbrDecodeEnvironmentSrgb");
    expect(compiled.fragment).toContain("vec3 g3dPbrDecodeEnvironmentSample(vec4 encodedSample)");
    expect(compiled.fragment).toContain("uniform samplerCube u_environmentCubeMapTexture;");
    expect(compiled.fragment).toContain("g3dPbrEnvironmentSampleRaw");
    expect(compiled.fragment).toContain("textureLod(u_environmentCubeMapTexture");
    expect(compiled.fragment).toContain("roughEnvironmentFloor");
    expect(compiled.fragment).toContain("proceduralSpecularResponse");
    expect(compiled.fragment).toContain("pow(distanceToLight / range, 4.0)");
    expect(compiled.fragment).toContain("attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);");
    expect(compiled.fragment).not.toContain("attenuation = clamp(1.0 - distanceToLight / range");
    expect(compiled.fragment).not.toContain("normalize(-v_worldPosition)");
  });

  it("samples cubemap PMREM resources across PBR shader variants instead of only the textured GLTF path", () => {
    const library = createDefaultShaderLibrary();
    const pbrShaders = [
      library.compileSource(DEFAULT_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_INSTANCED_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_SKINNED_LIT_SHADER_NAME),
      library.compileSource(DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME)
    ];

    for (const compiled of pbrShaders) {
      expect(compiled.fragment).toContain("uniform samplerCube u_environmentCubeMapTexture;");
      expect(compiled.fragment).toContain("uniform float u_environmentCubeMapTextureEnabled;");
      expect(compiled.fragment).toContain("textureLod(u_environmentCubeMapTexture");
      expect(compiled.fragment).toContain("u_environmentMapTextureRotation");
      expect(compiled.fragment).not.toContain("g3dPbrDecodeEnvironmentSample(textureLod(u_environmentMapTexture");
    }
  });

  it("applies renderer-level environment fog in every active PBR shader path", () => {
    const library = createDefaultShaderLibrary();
    const pbrShaders = [
      library.compileSource(DEFAULT_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_INSTANCED_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_SKINNED_LIT_SHADER_NAME),
      library.compileSource(DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME)
    ];

    for (const compiled of pbrShaders) {
      expect(compiled.fragment).toContain("uniform float u_environmentFogEnabled;");
      expect(compiled.fragment).toContain("uniform float u_environmentFogMode;");
      expect(compiled.fragment).toContain("uniform vec3 u_environmentFogColor;");
      expect(compiled.fragment).toContain("float g3dEnvironmentFogFactor(vec3 worldPosition)");
      expect(compiled.fragment).toContain("vec3 g3dApplyEnvironmentFog(vec3 linearColor, vec3 worldPosition)");
      expect(compiled.fragment).toContain("length(u_cameraPosition - worldPosition)");
      expect(compiled.fragment).toContain("1.0 - exp(-max(u_environmentFogDensity, 0.0) * distanceToCamera)");
      expect(compiled.fragment).toContain("vec3 fogged = g3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);");
      expect(compiled.fragment).not.toContain("outColor = vec4(g3dPbrEncodeOutput(max(shaded, vec3(0.0))),");
    }
  });

  it("includes a first-class environment background shader for equirect and cubemap rendering", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileSource(DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME);

    expect(compiled.vertex).toContain("v_backgroundNdc = a_position.xy;");
    expect(compiled.fragment).toContain("uniform sampler2D u_environmentBackgroundTexture;");
    expect(compiled.fragment).toContain("uniform samplerCube u_environmentBackgroundCubeTexture;");
    expect(compiled.fragment).toContain("uniform float u_environmentBackgroundProjection;");
    expect(compiled.fragment).toContain("uniform mat4 u_environmentBackgroundInverseViewProjection;");
    expect(compiled.fragment).toContain("vec2 g3dBackgroundEquirectUv(vec3 direction)");
    expect(compiled.fragment).toContain("vec3 g3dBackgroundDirectionFromNdc(vec2 ndc)");
    expect(compiled.fragment).toContain("texture(u_environmentBackgroundCubeTexture, direction)");
    expect(compiled.fragment).toContain("texture(u_environmentBackgroundTexture, g3dBackgroundEquirectUv(direction))");
    expect(compiled.fragment).toContain("g3dBackgroundEncodeOutput(color)");
    expect(compiled.fragment).not.toContain("normalize(vec3(v_backgroundNdc.x, v_backgroundNdc.y, -1.0))");
  });

  it("uses the same configurable linear/display output encode across PBR shader paths", () => {
    const library = createDefaultShaderLibrary();
    const pbrShaders = [
      library.compileSource(DEFAULT_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_INSTANCED_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME)
    ];

    for (const compiled of pbrShaders) {
      expect(compiled.fragment).toContain("EncodeOutput");
      expect(compiled.fragment).toContain("vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));");
      expect(compiled.fragment).toContain("vec3(1.0 / 2.2)");
      expect(compiled.fragment).toContain("uniform float u_outputColorSpace;");
      expect(compiled.fragment).toContain("mix(color, srgb");
      expect(compiled.fragment).not.toContain("linearColor * 5.5");
      expect(compiled.fragment).not.toContain("exposed / (exposed + vec3(1.0))");
      expect(compiled.fragment).not.toMatch(/outColor = vec4\((?:base \* max\(shaded|max\(shaded)/);
    }
  });

  it("does not double-decode sRGB texture samples after backend sRGB uploads", () => {
    const library = createDefaultShaderLibrary();
    const pbrShaders = [
      library.compileSource(DEFAULT_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_INSTANCED_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_SKINNED_LIT_SHADER_NAME),
      library.compileSource(DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME)
    ];

    for (const compiled of pbrShaders) {
      expect(compiled.fragment).not.toContain("return pow(srgb, vec3(2.2));");
      expect(compiled.fragment).not.toContain("vec3 srgb = clamp(encodedColor, vec3(0.0), vec3(1.0));");
    }
    expect(library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME).fragment).toContain("vec4 texturedBase = mix(u_baseColor, u_baseColor * decodedBaseColor, step(0.5, u_baseColorTextureEnabled)) * v_vertexColor;");
    expect(library.compileSource(DEFAULT_SKINNED_LIT_SHADER_NAME).fragment).toContain("vec4 decodedBaseColor = vec4(g3dPbrDecodeEnvironmentSrgb(sampledBaseColor.rgb), sampledBaseColor.a);");
  });

  it("uses camera-aware PBR direct lighting for instanced, normal-mapped, and textured PBR shader paths", () => {
    const library = createDefaultShaderLibrary();
    const instanced = library.compileSource(DEFAULT_INSTANCED_PBR_SHADER_NAME);
    const normalMapped = library.compileSource(DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME);
    const textured = library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME);

    expect(instanced.vertex).toContain("transpose(inverse(mat3(instanceMatrix))) * a_normal");
    expect(instanced.vertex).not.toContain("mat3(instanceMatrix) * a_normal");
    expect(instanced.fragment).toContain("uniform float u_alphaCutoff;");
    expect(instanced.fragment).toContain("float alpha = u_baseColor.a * v_instanceColor.a;");
    expect(instanced.fragment).toContain("if (alpha < u_alphaCutoff) discard;");

    for (const compiled of [instanced, normalMapped, textured]) {
      expect(compiled.fragment).toContain("uniform vec3 u_cameraPosition;");
      expect(compiled.fragment).toContain("normalize(u_cameraPosition - v_worldPosition)");
      expect(compiled.fragment).toContain("g3dPbrDirectLight");
      expect(compiled.fragment).toContain("g3dPbrEnvironmentLight");
      expect(compiled.fragment).toContain("uniform vec3 u_environmentColor;");
      expect(compiled.fragment).toContain("uniform float u_environmentIntensity;");
      expect(compiled.fragment).toContain("u_shadowMapTexture");
      expect(compiled.fragment).toContain("u_shadowPcfSamples[32]");
      expect(compiled.fragment).toContain("attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);");
      expect(compiled.fragment).not.toContain("attenuation = clamp(1.0 - distanceToLight / range");
      expect(compiled.fragment).not.toContain("g3dLambert(mappedNormal");
      expect(compiled.fragment).not.toContain("g3dLambert(normal");
      expect(compiled.fragment).not.toContain("base * max(shaded");
      expect([...compiled.fragment.matchAll(/g3dApplyMetalRough\(/g)]).toHaveLength(1);
    }
  });

  it("flips PBR normals on backfaces so double-sided surfaces stay lit", () => {
    const library = createDefaultShaderLibrary();
    const shaders = [
      library.compileSource(DEFAULT_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_INSTANCED_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME),
      library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME)
    ];

    for (const shader of shaders) {
      expect(shader.fragment).toContain("gl_FrontFacing");
      expect(shader.fragment).toMatch(/if \(!gl_FrontFacing\) [a-zA-Z]+Normal = -[a-zA-Z]+Normal;|if \(!gl_FrontFacing\) normal = -normal;/);
    }
  });

  it("uses the renderer PBR, environment, and shadow contracts for skinned lit shader paths", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileSource(DEFAULT_SKINNED_LIT_SHADER_NAME);

    expect(compiled.vertex).toContain("uniform mat4 u_modelMatrix;");
    expect(compiled.vertex).toContain("uniform mat4 u_normalMatrix;");
    expect(compiled.vertex).toContain("layout(location = 2) in vec2 a_uv;");
    expect(compiled.vertex).toContain("v_worldPosition = (u_modelMatrix * skinnedPosition).xyz");
    expect(compiled.fragment).toContain("uniform sampler2D u_baseColorTexture;");
    expect(compiled.fragment).toContain("u_baseColor * decodedBaseColor");
    expect(compiled.fragment).toContain("g3dPbrDirectLight");
    expect(compiled.fragment).toContain("g3dPbrEnvironmentLight");
    expect(compiled.fragment).toContain("uniform vec3 u_cameraPosition;");
    expect(compiled.fragment).toContain("normalize(u_cameraPosition - v_worldPosition)");
    expect(compiled.fragment).toContain("uniform vec3 u_environmentSkyColor;");
    expect(compiled.fragment).toContain("uniform vec3 u_environmentSpecularColor;");
    expect(compiled.fragment).toContain("proceduralSpecular + sampledSpecular");
    expect(compiled.fragment).toContain("u_environmentMapTexture");
    expect(compiled.fragment).toContain("u_environmentBrdfLutTexture");
    expect(compiled.fragment).toContain("u_shadowMapTexture");
    expect(compiled.fragment).toContain("u_shadowPcfSamples[32]");
    expect(compiled.fragment).not.toContain("u_keyLightDirection");
    expect(compiled.fragment).not.toContain("u_fillLightColor");
    expect(compiled.fragment).not.toContain("g3dLambert(normal");
  });

  it("keeps the packaged direct-PBR shader files synchronized with the default shader library", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileSource(DEFAULT_PBR_SHADER_NAME);
    const vertexSource = readFileSync(join(process.cwd(), "packages/rendering/src/shaders/pbr-direct.vert.glsl"), "utf8");
    const fragmentSource = readFileSync(join(process.cwd(), "packages/rendering/src/shaders/pbr-direct.frag.glsl"), "utf8");

    expect(vertexSource).toBe(compiled.vertex);
    expect(fragmentSource.trimEnd()).toBe(compiled.fragment.trimEnd());
    expect(vertexSource).toContain("uniform mat4 u_modelMatrix;");
    expect(vertexSource).toContain("v_worldPosition = (u_modelMatrix * vec4(a_position, 1.0)).xyz");
    expect(fragmentSource).toContain("uniform vec3 u_cameraPosition;");
    expect(fragmentSource).toContain("normalize(u_cameraPosition - v_worldPosition)");
    expect(fragmentSource).toContain("uniform float u_environmentFogEnabled;");
    expect(fragmentSource).toContain("vec3 fogged = g3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);");
    expect(fragmentSource).toContain("g3dPbrDirectLight");
    expect(fragmentSource).toContain("g3dDistributionGGX");
    expect(fragmentSource).toContain("g3dGeometrySmithGGXCorrelated");
    expect(fragmentSource).toContain("clamp(specularColorFactor, vec3(0.0), vec3(1.0))");
    expect(fragmentSource).toContain("mix(1.0, fallbackEnergy, transmission)");
    expect(fragmentSource).not.toContain("max(fallbackEnergy, 0.76)");
    expect(fragmentSource).toContain("max(fallbackEnergy < 0.079 ? clamp(fallbackEnergy * 8.0, 0.0, 1.0) : fallbackEnergy, 0.18)");
    expect(fragmentSource).toContain("float iorF0 = pow((max(ior, 1.0) - 1.0) / (max(ior, 1.0) + 1.0), 2.0);");
    expect(fragmentSource).toContain("* fallbackSpecularEnergy");
    expect(fragmentSource).toContain("* transmission");
    expect(fragmentSource).toContain("clearcoatGloss");
    expect(fragmentSource).toContain("anisotropyDirection");
    expect(fragmentSource).toContain("float layerEnergy = clamp(clearcoat * 0.08 + sheenEnergy * 0.26 + anisotropy * 0.035 + iridescence * 0.03, 0.0, 0.28);");
    expect(fragmentSource).toContain("vec3 specularLobe = clamp(specularColorFactor, vec3(0.0), vec3(1.0))");
    expect(fragmentSource).not.toContain("specular * 0.06");
    expect(fragmentSource).toContain("vec3 layeredBase = transmitted * dispersionTint * (1.0 - layerEnergy);");
    expect(fragmentSource).not.toContain("return max(vec3(0.0), transmitted * dispersionTint + specularLobe + sheenLobe + clearcoatLobe + anisotropyLobe + iridescenceLobe);");
    expect(fragmentSource).toContain("uniform float u_transmissionParallaxStrength;");
    expect(fragmentSource).toContain("vec3 g3dPbrBoxProjectedDirection(");
    expect(fragmentSource).toContain("u_transmissionParallaxBoxMin");
    expect(fragmentSource).toContain("u_transmissionParallaxBoxMax");
    expect(fragmentSource).toContain("u_transmissionBounceCount");
    expect(fragmentSource).toContain("u_transmissionCausticStrength");
    expect(fragmentSource).toContain("float fallbackEnvironmentTransmissionEnergy = mix(1.0, clamp(u_transmissionFallbackEnergy, 0.0, 1.0), transmissionAmount);");
    expect(fragmentSource).toContain("transmissionAmount * fallbackEnvironmentTransmissionEnergy * mix(0.9, 0.55, roughness)");
    expect(fragmentSource).toContain("transmissionAmount * mix(0.08, 0.58, fallbackEnvironmentTransmissionEnergy)");
    expect(fragmentSource).not.toContain("transmissionAmount * 0.58);");
    expect(fragmentSource).toContain("float transmissionCoverage = mix(0.34, 0.08, clamp(u_transmissionFallbackEnergy, 0.0, 1.0));");
    expect(fragmentSource).toContain("sampledSpecular *= u_environmentMapTextureSpecularIntensity * sampledEnvironmentWeight * mix(1.1, 0.85, roughness);");
    expect(fragmentSource).toContain("vec3 parallaxDirection = g3dPbrBoxProjectedDirection");
    expect(fragmentSource).toContain("float causticEnergy = u_transmissionCausticStrength");
    expect(fragmentSource).toContain("u_environmentMapTexture");
    expect(fragmentSource).toContain("u_environmentBrdfLutTexture");
    expect(fragmentSource).toContain("u_shadowMapTexture");
    expect(fragmentSource).toContain("shaded += g3dPbrDirectLight(");
    expect(fragmentSource).toContain("vec3 g3dPbrExtensionDirectLight(");
    expect(fragmentSource).toContain("vec3 g3dPbrExtensionEnvironmentLight(");
    expect(fragmentSource).toContain("shaded += g3dPbrExtensionEnvironmentLight(");
    expect(fragmentSource).toContain("shaded += g3dPbrExtensionDirectLight(");
    expect(fragmentSource).toContain("pow(distanceToLight / range, 4.0)");
    expect(fragmentSource).toContain("attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);");
    expect(fragmentSource).not.toContain("shaded += g3dLambert(");
    expect(fragmentSource).not.toContain("attenuation = clamp(1.0 - distanceToLight / range");
    expect(fragmentSource).not.toContain("mix(1.0, 0.9, clamp(u_metallic");
    expect(fragmentSource).not.toContain("base * 0.035");
    expect(fragmentSource).not.toContain("base * max(shaded");
  });

  it("keeps the default textured PBR shader inside common WebGL2 fragment sampler limits", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME);
    const fragmentSamplerCount = [...compiled.fragment.matchAll(/\buniform\s+sampler2D\s+/g)].length;

    expect(fragmentSamplerCount).toBeLessThanOrEqual(16);
    expect(compiled.fragment).toContain("u_baseColorTexture");
    expect(compiled.fragment).toContain("u_normalTexture");
    expect(compiled.fragment).toContain("u_metallicRoughnessTexture");
    expect(compiled.fragment).toContain("u_occlusionTexture");
    expect(compiled.fragment).toContain("u_emissiveTexture");
    expect(compiled.fragment).toContain("uniform float u_transmissionParallaxStrength;");
    expect(compiled.fragment).toContain("uniform sampler2D u_transmissionBackdropTexture;");
    expect(compiled.fragment).toContain("uniform float u_transmissionBackdropMipCount;");
    expect(compiled.fragment).toContain("float texturedBackdropWeight = clamp(u_transmissionBackdropEnabled * u_transmissionBackdropStrength");
    expect(compiled.fragment).toContain("vec3 g3dTexturedPbrBoxProjectedDirection(");
    expect(compiled.fragment).toContain("vec3 texturedParallaxDirection = g3dTexturedPbrBoxProjectedDirection");
    expect(compiled.fragment).toContain("float texturedCausticEnergy = u_transmissionCausticStrength");
    expect(compiled.fragment).toContain("float backdropLod = clamp((roughness + volumeThickness * 0.08)");
    expect(compiled.fragment).toContain("vec3 backdropRadiance = g3dTexturedPbrDecodeSrgb(textureLod(u_transmissionBackdropTexture");
  });

  it("applies sampler wrap modes to every core textured PBR material slot", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME);

    expect(compiled.fragment).toContain("uniform vec2 u_baseColorTextureWrap;");
    expect(compiled.fragment).toContain("uniform vec2 u_normalTextureWrap;");
    expect(compiled.fragment).toContain("uniform vec2 u_metallicRoughnessTextureWrap;");
    expect(compiled.fragment).toContain("uniform vec2 u_occlusionTextureWrap;");
    expect(compiled.fragment).toContain("uniform vec2 u_emissiveTextureWrap;");
    expect(compiled.fragment).toContain("uniform float u_baseColorTextureEnabled;");
    expect(compiled.fragment).toContain("uniform float u_metallicRoughnessTextureEnabled;");
    expect(compiled.fragment).toContain("uniform float u_occlusionTextureEnabled;");
    expect(compiled.fragment).toContain("uniform float u_emissiveTextureEnabled;");
    expect(compiled.fragment).toContain("texture(u_baseColorTexture, g3dTexturedPbrWrapUv(baseColorUv, u_baseColorTextureWrap))");
    expect(compiled.fragment).toContain("texture(u_metallicRoughnessTexture, g3dTexturedPbrWrapUv(metallicRoughnessUv, u_metallicRoughnessTextureWrap))");
    expect(compiled.fragment).toContain("texture(u_occlusionTexture, g3dTexturedPbrWrapUv(occlusionUv, u_occlusionTextureWrap))");
    expect(compiled.fragment).toContain("g3dTexturedPbrNormal(geometryNormal, v_tangent, g3dTexturedPbrWrapUv(normalUv, u_normalTextureWrap))");
    expect(compiled.fragment).toContain("texture(u_emissiveTexture, g3dTexturedPbrWrapUv(emissiveUv, u_emissiveTextureWrap))");
    expect(compiled.fragment).toContain("vec4 texturedBase = mix(u_baseColor, u_baseColor * decodedBaseColor, step(0.5, u_baseColorTextureEnabled)) * v_vertexColor;");
    expect(compiled.fragment).toContain("float roughness = mix(u_roughness, clamp(u_roughness * metallicRoughnessSample.g, 0.0, 1.0), step(0.5, u_metallicRoughnessTextureEnabled));");
    expect(compiled.fragment).toContain("float occlusion = mix(1.0, mix(1.0, texture(u_occlusionTexture, g3dTexturedPbrWrapUv(occlusionUv, u_occlusionTextureWrap)).r, clamp(u_occlusionStrength, 0.0, 1.0)), step(0.5, u_occlusionTextureEnabled));");
    expect(compiled.fragment).not.toContain("texture(u_metallicRoughnessTexture, metallicRoughnessUv)");
    expect(compiled.fragment).not.toContain("texture(u_occlusionTexture, occlusionUv)");
    expect(compiled.fragment).not.toContain("texture(u_emissiveTexture, emissiveUv)");
  });

  it("keeps ambient occlusion on textured PBR indirect light instead of muting direct lights", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME);

    expect(compiled.fragment).toContain("g3dTexturedPbrEnvironmentDiffuseInput(mappedNormal) * occlusion");
    expect(compiled.fragment).toContain("shaded += g3dPbrDirectLight(mappedNormal");
    expect(compiled.fragment).not.toContain("g3dPbrDirectLight(mappedNormal, viewDirection, lightDirection, colorIntensity.rgb, colorIntensity.a * attenuation * shadowFactor, base, metallic, roughness, specular, specularColor) * mix(1.0, occlusion");
  });

  it("applies sampler wrap modes to textured PBR extension slots", () => {
    const library = createDefaultShaderLibrary();
    const clearcoatTransmission = library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT);
    const specularIridescence = library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT);

    expect(clearcoatTransmission.fragment).toContain("uniform vec2 u_clearcoatTextureWrap;");
    expect(clearcoatTransmission.fragment).toContain("uniform vec2 u_clearcoatRoughnessTextureWrap;");
    expect(clearcoatTransmission.fragment).toContain("uniform vec2 u_clearcoatNormalTextureWrap;");
    expect(clearcoatTransmission.fragment).toContain("uniform vec2 u_transmissionTextureWrap;");
    expect(clearcoatTransmission.fragment).toContain("uniform vec2 u_diffuseTransmissionTextureWrap;");
    expect(clearcoatTransmission.fragment).toContain("uniform vec2 u_diffuseTransmissionColorTextureWrap;");
    expect(clearcoatTransmission.fragment).toContain("uniform vec2 u_volumeThicknessTextureWrap;");
    expect(clearcoatTransmission.fragment).toContain("texture(u_clearcoatTexture, g3dTexturedPbrWrapUv(clearcoatUv, u_clearcoatTextureWrap))");
    expect(clearcoatTransmission.fragment).toContain("texture(u_clearcoatRoughnessTexture, g3dTexturedPbrWrapUv(clearcoatRoughnessUv, u_clearcoatRoughnessTextureWrap))");
    expect(clearcoatTransmission.fragment).toContain("texture(u_clearcoatNormalTexture, g3dTexturedPbrWrapUv(clearcoatNormalUv, u_clearcoatNormalTextureWrap))");
    expect(clearcoatTransmission.fragment).toContain("vec3 clearcoatNormalDirection = geometryNormal;");
    expect(clearcoatTransmission.fragment).toContain("vec3 sampledClearcoatNormal = g3dTexturedPbrApplyNormalSample(geometryNormal, v_tangent, clearcoatNormalSample, u_clearcoatNormalScale);");
    expect(clearcoatTransmission.fragment).toContain("clearcoatNormalDirection = normalize(mix(geometryNormal, sampledClearcoatNormal, 0.42));");
    expect(clearcoatTransmission.fragment).toContain("float clearcoatRoughness = max(clamp(u_clearcoatRoughnessFactor, 0.0, 1.0), 0.18);");
    expect(clearcoatTransmission.fragment).toContain("clearcoatRoughness = max(clearcoatRoughness, 0.16 + (1.0 - clearcoatNormalBoost) * 0.12);");
    expect(clearcoatTransmission.fragment).toContain("g3dTexturedPbrEnvironmentSpecularInput(clearcoatNormalDirection, viewDirection, clamp(clearcoatRoughness, 0.18, 1.0))");
    expect(clearcoatTransmission.fragment).toContain("texture(u_transmissionTexture, g3dTexturedPbrWrapUv(transmissionUv, u_transmissionTextureWrap))");
    expect(clearcoatTransmission.fragment).toContain("texture(u_diffuseTransmissionTexture, g3dTexturedPbrWrapUv(diffuseTransmissionUv, u_diffuseTransmissionTextureWrap))");
    expect(clearcoatTransmission.fragment).toContain("texture(u_diffuseTransmissionColorTexture, g3dTexturedPbrWrapUv(diffuseTransmissionColorUv, u_diffuseTransmissionColorTextureWrap))");
    expect(clearcoatTransmission.fragment).toContain("texture(u_volumeThicknessTexture, g3dTexturedPbrWrapUv(volumeThicknessUv, u_volumeThicknessTextureWrap))");

    expect(specularIridescence.fragment).toContain("uniform vec2 u_specularTextureWrap;");
    expect(specularIridescence.fragment).toContain("uniform vec2 u_specularColorTextureWrap;");
    expect(specularIridescence.fragment).toContain("uniform vec2 u_sheenColorTextureWrap;");
    expect(specularIridescence.fragment).toContain("uniform vec2 u_sheenRoughnessTextureWrap;");
    expect(specularIridescence.fragment).toContain("uniform vec2 u_anisotropyTextureWrap;");
    expect(specularIridescence.fragment).toContain("uniform vec2 u_iridescenceTextureWrap;");
    expect(specularIridescence.fragment).toContain("uniform vec2 u_iridescenceThicknessTextureWrap;");
    expect(specularIridescence.fragment).toContain("texture(u_specularTexture, g3dTexturedPbrWrapUv(specularUv, u_specularTextureWrap))");
    expect(specularIridescence.fragment).toContain("texture(u_specularColorTexture, g3dTexturedPbrWrapUv(specularColorUv, u_specularColorTextureWrap))");
    expect(specularIridescence.fragment).toContain("texture(u_sheenColorTexture, g3dTexturedPbrWrapUv(sheenColorUv, u_sheenColorTextureWrap))");
    expect(specularIridescence.fragment).toContain("texture(u_sheenRoughnessTexture, g3dTexturedPbrWrapUv(sheenRoughnessUv, u_sheenRoughnessTextureWrap))");
    expect(specularIridescence.fragment).toContain("texture(u_anisotropyTexture, g3dTexturedPbrWrapUv(anisotropyUv, u_anisotropyTextureWrap))");
    expect(specularIridescence.fragment).toContain("texture(u_iridescenceTexture, g3dTexturedPbrWrapUv(iridescenceUv, u_iridescenceTextureWrap))");
    expect(specularIridescence.fragment).toContain("texture(u_iridescenceThicknessTexture, g3dTexturedPbrWrapUv(iridescenceThicknessUv, u_iridescenceThicknessTextureWrap))");
  });

  it("lights textured PBR material extensions as separate direct and environment lobes", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT);

    expect(compiled.fragment).toContain("vec3 g3dTexturedPbrExtensionDirectLight(");
    expect(compiled.fragment).toContain("vec3 g3dTexturedPbrExtensionEnvironmentLight(");
    expect(compiled.fragment).toContain("vec3 clearcoatLobe = clearcoatF * clearcoatD * clearcoatG * clamp(clearcoat, 0.0, 1.0) * 0.12;");
    expect(compiled.fragment).toContain("vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0)) * sheenStrength * 0.18;");
    expect(compiled.fragment).toContain("vec3 anisotropyLobe = vec3(clamp(anisotropy, 0.0, 1.0) * anisotropyBand * 0.055);");
    expect(compiled.fragment).toContain("vec3 iridescenceLobe = iridescenceColor * clamp(iridescence, 0.0, 1.0) * clearcoatF * pow(g3dSaturate(1.0 - nDotV), 2.0) * 0.22;");
    expect(compiled.fragment).toContain("vec3 extensionEnvironmentSpecular = g3dTexturedPbrEnvironmentSpecularInput(clearcoatNormalDirection, viewDirection, clamp(clearcoatRoughness, 0.18, 1.0));");
    expect(compiled.fragment).toContain("sampledSpecular *= u_environmentMapTextureSpecularIntensity * sampledEnvironmentWeight * mix(0.84, 0.58, clampedRoughness);");
    expect(compiled.fragment).toContain("float texturedFallbackEnvironmentTransmissionEnergy = mix(1.0, clamp(u_transmissionFallbackEnergy, 0.0, 1.0), texturedTransmissionAmount);");
    expect(compiled.fragment).toContain("texturedTransmissionAmount * texturedFallbackEnvironmentTransmissionEnergy * mix(0.9, 0.55, roughness)");
    expect(compiled.fragment).toContain("texturedTransmissionAmount * mix(0.08, 0.58, texturedFallbackEnvironmentTransmissionEnergy)");
    expect(compiled.fragment).toContain("float texturedTransmissionCoverage = mix(0.34, 0.08, clamp(u_transmissionFallbackEnergy, 0.0, 1.0));");
    expect(compiled.fragment).not.toContain("texturedTransmissionAmount * 0.58);");
    expect(compiled.fragment).toContain(") + g3dTexturedPbrExtensionEnvironmentLight(");
    expect(compiled.fragment).toContain("shaded += g3dTexturedPbrExtensionDirectLight(");
  });

  it("keeps textured PBR extension texture variants inside common WebGL2 fragment sampler limits", () => {
    const library = createDefaultShaderLibrary();
    const variants = [
      {
        name: DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
        samplers: ["u_clearcoatTexture", "u_clearcoatRoughnessTexture", "u_clearcoatNormalTexture"]
      },
      {
        name: DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
        samplers: ["u_transmissionTexture", "u_diffuseTransmissionTexture", "u_diffuseTransmissionColorTexture", "u_volumeThicknessTexture"]
      },
      {
        name: DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT,
        samplers: ["u_specularTexture", "u_specularColorTexture", "u_sheenColorTexture", "u_sheenRoughnessTexture", "u_anisotropyTexture"]
      },
      {
        name: DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT,
        samplers: ["u_iridescenceTexture", "u_iridescenceThicknessTexture"]
      },
      {
        name: DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
        samplers: ["u_clearcoatTexture", "u_clearcoatRoughnessTexture", "u_clearcoatNormalTexture", "u_transmissionTexture", "u_diffuseTransmissionTexture", "u_diffuseTransmissionColorTexture", "u_volumeThicknessTexture"]
      },
      {
        name: DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT,
        samplers: ["u_clearcoatTexture", "u_clearcoatRoughnessTexture", "u_clearcoatNormalTexture", "u_specularTexture", "u_specularColorTexture"]
      },
      {
        name: DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT,
        samplers: ["u_specularTexture", "u_specularColorTexture", "u_sheenColorTexture", "u_sheenRoughnessTexture", "u_anisotropyTexture", "u_iridescenceTexture", "u_iridescenceThicknessTexture"]
      }
    ];

    for (const variant of variants) {
      const compiled = library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, variant.name);
      const fragmentSamplerCount = [...compiled.fragment.matchAll(/\buniform\s+sampler2D\s+/g)].length;

      expect(compiled.label).toBe(`${DEFAULT_TEXTURED_PBR_SHADER_NAME}:${variant.name}`);
      expect(fragmentSamplerCount).toBeLessThanOrEqual(16);
      for (const sampler of variant.samplers) {
        expect(compiled.fragment).toContain(sampler);
      }
    }
  });

  it("exposes active textured PBR texture slots for diagnostics", () => {
    expect(texturedPbrShaderActiveTextureSlots()).toEqual([
      "baseColor",
      "normal",
      "metallicRoughness",
      "occlusion",
      "emissive"
    ]);
    expect(texturedPbrShaderActiveTextureSlots(DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT)).toEqual([
      "baseColor",
      "normal",
      "metallicRoughness",
      "occlusion",
      "emissive",
      "clearcoat",
      "clearcoatRoughness",
      "clearcoatNormal"
    ]);
    expect(texturedPbrShaderActiveTextureSlots(DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT)).toEqual([
      "baseColor",
      "normal",
      "metallicRoughness",
      "occlusion",
      "emissive",
      "specular",
      "specularColor",
      "sheenColor",
      "sheenRoughness",
      "anisotropy",
      "iridescence",
      "iridescenceThickness"
    ]);
    expect(texturedPbrShaderActiveTextureSlots(DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT)).toEqual([
      "baseColor",
      "normal",
      "metallicRoughness",
      "occlusion",
      "emissive",
      "clearcoat",
      "clearcoatRoughness",
      "clearcoatNormal",
      "specular",
      "specularColor"
    ]);
  });

  it("decodes sRGB material extension color textures before linear PBR shading", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT);

    expect(compiled.fragment).toContain("specularColor *= g3dTexturedPbrDecodeSrgb(texture(u_specularColorTexture, g3dTexturedPbrWrapUv(specularColorUv, u_specularColorTextureWrap)).rgb);");
    expect(compiled.fragment).toContain("sheenColor *= g3dTexturedPbrDecodeSrgb(texture(u_sheenColorTexture, g3dTexturedPbrWrapUv(sheenColorUv, u_sheenColorTextureWrap)).rgb);");
  });

  it("rejects duplicate shader registration", () => {
    const library = new ShaderLibrary();
    const shader = {
      name: "test",
      marker: "@marker",
      vertex: "// @marker\nvoid main() {}",
      fragment: "// @marker\nvoid main() {}"
    };

    library.register(shader);

    expect(() => library.register(shader)).toThrow(/already registered/);
  });

  it("compiles named shader variants, caches them by defines, and rejects missing variants", () => {
    const library = new ShaderLibrary();
    library.register({
      name: "variant-test",
      marker: "@variant-test",
      vertex: [
        "// @variant-test",
        "#if USE_COLOR",
        "in vec4 a_color;",
        "#else",
        "in vec3 a_position;",
        "#endif",
        "void main() {}"
      ].join("\n"),
      fragment: "// @variant-test\nvoid main() {}",
      variants: [
        { name: "base", defines: { USE_COLOR: false } },
        { name: "vertex-color", defines: { USE_COLOR: true } }
      ]
    });

    const base = library.compileVariant("variant-test", "base");
    const color = library.compileVariant("variant-test", "vertex-color");
    const colorAgain = library.compileVariant("variant-test", "vertex-color");
    const colorDisabledByOverride = library.compileVariant("variant-test", "vertex-color", { defines: { USE_COLOR: false } });

    expect(base.label).toBe("variant-test:base");
    expect(base.vertex).toContain("in vec3 a_position;");
    expect(base.vertex).not.toContain("in vec4 a_color;");
    expect(color.label).toBe("variant-test:vertex-color");
    expect(color.vertex).toContain("in vec4 a_color;");
    expect(color.vertex).not.toContain("in vec3 a_position;");
    expect(colorAgain).toBe(color);
    expect(colorDisabledByOverride).not.toBe(color);
    expect(colorDisabledByOverride.vertex).toContain("in vec3 a_position;");
    expect(() => library.compileVariant("variant-test", "missing")).toThrow(/variant is not registered/);
  });

  it("keeps GLSL #version before generated variant defines", () => {
    const preprocessor = new ShaderPreprocessor();
    const result = preprocessor.preprocess("#version 300 es\n#if USE_COLOR\nout vec4 color;\n#endif", {
      defines: { USE_COLOR: true }
    });
    const lines = result.source.split("\n");

    expect(lines[0]).toBe("#version 300 es");
    expect(lines[1]).toBe("#define USE_COLOR 1");
    expect(lines[2]).toBe("out vec4 color;");
  });

  it("rejects duplicate shader variant names", () => {
    const library = new ShaderLibrary();

    expect(() =>
      library.register({
        name: "duplicate-variant-test",
        marker: "@duplicate-variant-test",
        vertex: "// @duplicate-variant-test\nvoid main() {}",
        fragment: "// @duplicate-variant-test\nvoid main() {}",
        variants: [{ name: "base" }, { name: "base" }]
      })
    ).toThrow(/variant is already registered/);
  });

  it("rejects include cycles", () => {
    const preprocessor = new ShaderPreprocessor();
    const includes = new Map([
      ["a", "#include <b>"],
      ["b", "#include <a>"]
    ]);

    expect(() => preprocessor.preprocess("#include <a>", { includes })).toThrow(/Circular shader include/);
  });

  it("expands shader variants with source maps for root and included lines", () => {
    const preprocessor = new ShaderPreprocessor();
    const includes = new Map([
      ["lighting", "vec3 lit = vec3(1.0);\n#ifdef USE_SHADOWS\nlit *= 0.5;\n#endif"]
    ]);

    const result = preprocessor.preprocess(
      [
        "// marker",
        "#include <lighting>",
        "#if USE_FOG",
        "vec3 fog = lit;",
        "#else",
        "vec3 fog = vec3(0.0);",
        "#endif"
      ].join("\n"),
      {
        includes,
        defines: {
          USE_SHADOWS: true,
          USE_FOG: 1
        }
      }
    );

    expect(result.included).toEqual(["lighting"]);
    expect(result.source).toContain("#define USE_SHADOWS 1");
    expect(result.source).toContain("lit *= 0.5;");
    expect(result.source).toContain("vec3 fog = lit;");
    expect(result.source).not.toContain("vec3 fog = vec3(0.0);");
    expect(result.sourceMap).toContainEqual({ generatedLine: 1, sourceName: "<defines>", sourceLine: 1 });
    expect(result.sourceMap).toContainEqual(expect.objectContaining({ sourceName: "lighting", sourceLine: 1 }));
    expect(result.sourceMap).toContainEqual(expect.objectContaining({ sourceName: "root", sourceLine: 4 }));
  });

  it("rejects undefined and malformed shader variant conditionals", () => {
    const preprocessor = new ShaderPreprocessor();

    expect(() => preprocessor.preprocess("#if USE_FOG\nvec3 fog;\n#endif")).toThrow(/undefined define USE_FOG/);
    expect(() => preprocessor.preprocess("#if USE_FOG > 0\nvec3 fog;\n#endif", { defines: { USE_FOG: 1 } })).toThrow(/Unsupported shader conditional expression/);
    expect(() => preprocessor.preprocess("#else\nvec3 color;\n")).toThrow(/#else without matching #if/);
    expect(() => preprocessor.preprocess("#if 1\nvec3 color;\n")).toThrow(/missing #endif/);
  });

  it("reflects shader module attributes and uniforms with types, locations, arrays, and source lines", () => {
    const module = new ShaderModule({
      label: "reflection-unit",
      marker: "@galileo3d-shader:reflection-unit",
      vertex: [
        "#version 300 es",
        "// @galileo3d-shader:reflection-unit",
        "layout(location = 4) in vec4 a_color;",
        "/* in vec3 a_commented; */",
        "in vec3 a_position;",
        "uniform mat4 u_modelViewProjection;",
        "uniform vec4 u_jointMatrices[64];"
      ].join("\n"),
      fragment: [
        "#version 300 es",
        "// @galileo3d-shader:reflection-unit",
        "precision highp float;",
        "in vec4 v_color;",
        "uniform vec4 u_baseColor;",
        "uniform sampler2D u_albedo;",
        "out vec4 outColor;"
      ].join("\n")
    });

    expect([...module.reflection.attributes.entries()]).toEqual([
      ["a_color", 4],
      ["a_position", 0]
    ]);
    expect(module.reflection.attributes.has("v_color")).toBe(false);
    expect(module.reflection.attributes.has("a_commented")).toBe(false);
    expect(module.reflection.attributeDetails.get("a_color")).toEqual({
      name: "a_color",
      type: "vec4",
      location: 4,
      source: "vertex",
      line: 3
    });
    expect(module.reflection.attributeDetails.get("a_position")).toMatchObject({ type: "vec3", location: 0, line: 5 });
    expect(module.reflection.uniformDetails.get("u_jointMatrices")).toEqual({
      name: "u_jointMatrices",
      type: "vec4",
      arraySize: 64,
      source: "vertex",
      line: 7
    });
    expect(module.reflection.uniformDetails.get("u_baseColor")).toMatchObject({ type: "vec4", arraySize: null, source: "fragment", line: 5 });
    expect(module.reflection.uniformDetails.get("u_albedo")).toMatchObject({ type: "sampler2D", source: "fragment" });
  });
});

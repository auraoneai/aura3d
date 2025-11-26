/**
 * Comprehensive unit tests for the Material class.
 * Tests property setting, texture binding, shader assignment, render queue, property blocks, and instanced properties.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Material, AlphaMode, CullMode, DepthTest } from '../../../rendering/material/Material';
import { Texture, TextureFormat } from '../../../rendering/texture/Texture';
import { Color } from '../../../math/Color';

describe('Material', () => {
  let material: Material;

  beforeEach(() => {
    material = new Material({ name: 'TestMaterial' });
  });

  describe('property setting', () => {
    it('sets and gets albedo color', () => {
      const color = new Color(1, 0, 0, 1);
      material.setProperty('albedo', color);

      const retrieved = material.getProperty('albedo');
      expect(retrieved.equals(color)).toBe(true);
    });

    it('sets and gets metallic value', () => {
      material.setProperty('metallic', 1.0);

      expect(material.getProperty('metallic')).toBe(1.0);
    });

    it('sets and gets roughness value', () => {
      material.setProperty('roughness', 0.3);

      expect(material.getProperty('roughness')).toBe(0.3);
    });

    it('sets and gets ambient occlusion', () => {
      material.setProperty('ao', 0.8);

      expect(material.getProperty('ao')).toBe(0.8);
    });

    it('sets and gets emission properties', () => {
      const emissionColor = new Color(1, 0.5, 0, 1);
      material.setProperty('emission', emissionColor);
      material.setProperty('emissionIntensity', 2.0);

      expect(material.getProperty('emission').equals(emissionColor)).toBe(true);
      expect(material.getProperty('emissionIntensity')).toBe(2.0);
    });

    it('sets and gets normal scale', () => {
      material.setProperty('normalScale', 1.5);

      expect(material.getProperty('normalScale')).toBe(1.5);
    });

    it('sets and gets height scale', () => {
      material.setProperty('heightScale', 0.05);

      expect(material.getProperty('heightScale')).toBe(0.05);
    });

    it('gets all properties at once', () => {
      const props = material.getProperties();

      expect(props.albedo).toBeDefined();
      expect(props.metallic).toBeDefined();
      expect(props.roughness).toBeDefined();
      expect(props.ao).toBeDefined();
      expect(props.emission).toBeDefined();
    });

    it('marks uniforms dirty when property changes', () => {
      const buffer1 = material.getUniformBuffer();

      material.setProperty('metallic', 0.5);

      const buffer2 = material.getUniformBuffer();

      // Buffer should be updated
      expect(buffer2).toBeDefined();
    });
  });

  describe('texture binding', () => {
    let albedoTexture: Texture;
    let normalTexture: Texture;

    beforeEach(() => {
      albedoTexture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
        label: 'AlbedoMap',
      });

      normalTexture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
        label: 'NormalMap',
      });
    });

    it('sets and gets albedo map', () => {
      material.setTexture('albedoMap', albedoTexture);

      const retrieved = material.getTexture('albedoMap');
      expect(retrieved).toBe(albedoTexture);
    });

    it('sets and gets normal map', () => {
      material.setTexture('normalMap', normalTexture);

      const retrieved = material.getTexture('normalMap');
      expect(retrieved).toBe(normalTexture);
    });

    it('sets and gets metallic-roughness map', () => {
      const mrTexture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      material.setTexture('metallicRoughnessMap', mrTexture);

      expect(material.getTexture('metallicRoughnessMap')).toBe(mrTexture);
    });

    it('clears texture by setting null', () => {
      material.setTexture('albedoMap', albedoTexture);
      material.setTexture('albedoMap', null);

      expect(material.getTexture('albedoMap')).toBeNull();
    });

    it('gets all textures at once', () => {
      material.setTexture('albedoMap', albedoTexture);
      material.setTexture('normalMap', normalTexture);

      const textures = material.getTextures();

      expect(textures.albedoMap).toBe(albedoTexture);
      expect(textures.normalMap).toBe(normalTexture);
    });

    it('marks shader features dirty when texture changes', () => {
      const features1 = material.getShaderFeatures();

      material.setTexture('albedoMap', albedoTexture);

      const features2 = material.getShaderFeatures();

      // Features should reflect texture assignment
      expect(features2.USE_ALBEDO_MAP).toBe(true);
    });
  });

  describe('shader assignment', () => {
    it('gets shader features based on textures', () => {
      const albedoTex = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      material.setTexture('albedoMap', albedoTex);

      const features = material.getShaderFeatures();

      expect(features.USE_ALBEDO_MAP).toBe(true);
      expect(features.USE_NORMAL_MAP).toBe(false);
    });

    it('updates features for multiple textures', () => {
      const albedoTex = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      const normalTex = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      material.setTexture('albedoMap', albedoTex);
      material.setTexture('normalMap', normalTex);

      const features = material.getShaderFeatures();

      expect(features.USE_ALBEDO_MAP).toBe(true);
      expect(features.USE_NORMAL_MAP).toBe(true);
    });

    it('sets alpha blend feature', () => {
      material.setAlphaMode(AlphaMode.Blend);

      const features = material.getShaderFeatures();

      expect(features.ALPHA_BLEND).toBe(true);
      expect(features.ALPHA_MASK).toBe(false);
    });

    it('sets alpha mask feature', () => {
      material.setAlphaMode(AlphaMode.Mask);

      const features = material.getShaderFeatures();

      expect(features.ALPHA_BLEND).toBe(false);
      expect(features.ALPHA_MASK).toBe(true);
    });

    it('sets and gets custom shader variant', () => {
      material.setShaderVariant('custom_pbr');

      expect(material.getShaderVariant()).toBe('custom_pbr');
    });

    it('clears shader variant with null', () => {
      material.setShaderVariant('custom');
      material.setShaderVariant(null);

      expect(material.getShaderVariant()).toBeNull();
    });

    it('caches shader features', () => {
      const features1 = material.getShaderFeatures();
      const features2 = material.getShaderFeatures();

      // Should return same object when not dirty
      expect(features1).toBe(features2);
    });
  });

  describe('render queue assignment', () => {
    it('defaults to opaque rendering', () => {
      expect(material.getAlphaMode()).toBe(AlphaMode.Opaque);
    });

    it('switches to transparent queue with blend mode', () => {
      material.setAlphaMode(AlphaMode.Blend);

      expect(material.getAlphaMode()).toBe(AlphaMode.Blend);
    });

    it('uses mask mode for cutout materials', () => {
      material.setAlphaMode(AlphaMode.Mask);
      material.setAlphaCutoff(0.5);

      expect(material.getAlphaMode()).toBe(AlphaMode.Mask);
      expect(material.getAlphaCutoff()).toBe(0.5);
    });

    it('clamps alpha cutoff to valid range', () => {
      material.setAlphaCutoff(-0.5);
      expect(material.getAlphaCutoff()).toBeGreaterThanOrEqual(0);

      material.setAlphaCutoff(1.5);
      expect(material.getAlphaCutoff()).toBeLessThanOrEqual(1);
    });
  });

  describe('property blocks', () => {
    it('packs properties into uniform buffer', () => {
      material.setProperty('albedo', new Color(1, 0, 0, 1));
      material.setProperty('metallic', 1.0);
      material.setProperty('roughness', 0.5);

      const buffer = material.getUniformBuffer();

      expect(buffer).toBeInstanceOf(Float32Array);
      expect(buffer.length).toBe(16);

      // Check albedo values (first 4 floats)
      expect(buffer[0]).toBe(1); // R
      expect(buffer[1]).toBe(0); // G
      expect(buffer[2]).toBe(0); // B
      expect(buffer[3]).toBe(1); // A
    });

    it('updates uniform buffer when properties change', () => {
      const buffer1 = material.getUniformBuffer();
      const metallic1 = buffer1[4];

      material.setProperty('metallic', 0.8);

      const buffer2 = material.getUniformBuffer();
      const metallic2 = buffer2[4];

      expect(metallic2).toBe(0.8);
      expect(metallic2).not.toBe(metallic1);
    });

    it('includes all PBR properties in buffer', () => {
      material.setProperty('albedo', new Color(1, 1, 1, 1));
      material.setProperty('metallic', 0.5);
      material.setProperty('roughness', 0.6);
      material.setProperty('ao', 0.9);
      material.setProperty('normalScale', 1.2);
      material.setProperty('emission', new Color(0.5, 0, 0, 1));
      material.setProperty('emissionIntensity', 2.0);
      material.setProperty('heightScale', 0.03);
      material.setAlphaCutoff(0.4);

      const buffer = material.getUniformBuffer();

      expect(buffer[4]).toBe(0.5); // metallic
      expect(buffer[5]).toBe(0.6); // roughness
      expect(buffer[6]).toBe(0.9); // ao
      expect(buffer[7]).toBe(1.2); // normalScale
    });
  });

  describe('instanced properties', () => {
    it('creates material with default properties', () => {
      const defaultMat = Material.createDefault();

      expect(defaultMat.name).toBe('DefaultPBR');
      expect(defaultMat.getProperty('metallic')).toBe(0.0);
      expect(defaultMat.getProperty('roughness')).toBe(0.5);
    });

    it('creates unlit material', () => {
      const unlitMat = Material.createUnlit(new Color(1, 0, 0, 1));

      expect(unlitMat.name).toBe('Unlit');
      expect(unlitMat.getShaderVariant()).toBe('unlit');
      expect(unlitMat.getProperty('emissionIntensity')).toBe(1.0);
    });

    it('creates wireframe material', () => {
      const wireframeMat = Material.createWireframe(Color.white());

      expect(wireframeMat.name).toBe('Wireframe');
      expect(wireframeMat.isWireframe()).toBe(true);
    });
  });

  describe('default material handling', () => {
    it('initializes with default PBR values', () => {
      const mat = new Material();

      const albedo = mat.getProperty('albedo');
      expect(albedo.r).toBeCloseTo(0.8);
      expect(albedo.g).toBeCloseTo(0.8);
      expect(albedo.b).toBeCloseTo(0.8);

      expect(mat.getProperty('metallic')).toBe(0.0);
      expect(mat.getProperty('roughness')).toBe(0.5);
      expect(mat.getProperty('ao')).toBe(1.0);
    });

    it('has default render state', () => {
      const state = material.getState();

      expect(state.alphaMode).toBe(AlphaMode.Opaque);
      expect(state.alphaCutoff).toBe(0.5);
      expect(state.cullMode).toBe(CullMode.Back);
      expect(state.depthTest).toBe(DepthTest.Less);
      expect(state.depthWrite).toBe(true);
      expect(state.doubleSided).toBe(false);
      expect(state.wireframe).toBe(false);
    });

    it('has null textures by default', () => {
      const textures = material.getTextures();

      expect(textures.albedoMap).toBeNull();
      expect(textures.metallicMap).toBeNull();
      expect(textures.roughnessMap).toBeNull();
      expect(textures.normalMap).toBeNull();
    });
  });

  describe('render state', () => {
    it('sets and gets cull mode', () => {
      material.setCullMode(CullMode.Front);

      expect(material.getCullMode()).toBe(CullMode.Front);
    });

    it('sets double-sided rendering', () => {
      material.setDoubleSided(true);

      expect(material.isDoubleSided()).toBe(true);
      expect(material.getCullMode()).toBe(CullMode.None);
    });

    it('sets and gets depth test mode', () => {
      material.setDepthTest(DepthTest.Always);

      expect(material.getDepthTest()).toBe(DepthTest.Always);
    });

    it('sets and gets depth write', () => {
      material.setDepthWrite(false);

      expect(material.isDepthWriteEnabled()).toBe(false);
    });

    it('sets and gets wireframe mode', () => {
      material.setWireframe(true);

      expect(material.isWireframe()).toBe(true);
    });
  });

  describe('cloning', () => {
    it('clones material with independent properties', () => {
      material.setProperty('metallic', 0.8);
      material.setProperty('roughness', 0.3);

      const cloned = material.clone();

      expect(cloned.getProperty('metallic')).toBe(0.8);
      expect(cloned.getProperty('roughness')).toBe(0.3);

      // Modify original
      material.setProperty('metallic', 0.5);

      // Clone should not be affected
      expect(cloned.getProperty('metallic')).toBe(0.8);
    });

    it('clones with independent color values', () => {
      const color = new Color(1, 0, 0, 1);
      material.setProperty('albedo', color);

      const cloned = material.clone();

      // Modify original color
      color.r = 0;
      material.setProperty('albedo', color);

      // Clone should still have original value
      expect(cloned.getProperty('albedo').r).toBe(1);
    });

    it('clones textures as shallow copy', () => {
      const texture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      material.setTexture('albedoMap', texture);

      const cloned = material.clone();

      // Texture should be shared (shallow copy)
      expect(cloned.getTexture('albedoMap')).toBe(texture);
    });

    it('clones render state', () => {
      material.setAlphaMode(AlphaMode.Blend);
      material.setDoubleSided(true);
      material.setWireframe(true);

      const cloned = material.clone();

      expect(cloned.getAlphaMode()).toBe(AlphaMode.Blend);
      expect(cloned.isDoubleSided()).toBe(true);
      expect(cloned.isWireframe()).toBe(true);
    });

    it('clones shader variant', () => {
      material.setShaderVariant('custom');

      const cloned = material.clone();

      expect(cloned.getShaderVariant()).toBe('custom');
    });

    it('assigns unique name to clone', () => {
      material.name = 'Original';

      const cloned = material.clone();

      expect(cloned.name).toContain('Clone');
      expect(cloned.name).not.toBe(material.name);
    });
  });

  describe('serialization', () => {
    it('converts to JSON', () => {
      material.name = 'MyMaterial';
      material.setProperty('metallic', 0.7);
      material.setProperty('roughness', 0.4);
      material.setAlphaMode(AlphaMode.Blend);

      const json = material.toJSON();

      expect(json.name).toBe('MyMaterial');
      expect(json.properties.metallic).toBe(0.7);
      expect(json.properties.roughness).toBe(0.4);
      expect(json.state.alphaMode).toBe(AlphaMode.Blend);
    });

    it('includes texture IDs in JSON', () => {
      const texture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      material.setTexture('albedoMap', texture);

      const json = material.toJSON();

      expect(json.textures.albedoMap).toBe(texture.id);
    });

    it('includes null textures in JSON', () => {
      const json = material.toJSON();

      expect(json.textures.albedoMap).toBeNull();
      expect(json.textures.normalMap).toBeNull();
    });

    it('includes all state in JSON', () => {
      material.setAlphaMode(AlphaMode.Mask);
      material.setAlphaCutoff(0.3);
      material.setCullMode(CullMode.None);

      const json = material.toJSON();

      expect(json.state.alphaMode).toBe(AlphaMode.Mask);
      expect(json.state.alphaCutoff).toBe(0.3);
      expect(json.state.cullMode).toBe(CullMode.None);
    });
  });

  describe('unique identification', () => {
    it('assigns unique ID to each material', () => {
      const mat1 = new Material();
      const mat2 = new Material();

      expect(mat1.id).not.toBe(mat2.id);
    });

    it('preserves ID through clone', () => {
      const cloned = material.clone();

      // Clone should have different ID
      expect(cloned.id).not.toBe(material.id);
    });
  });

  describe('edge cases', () => {
    it('handles extreme property values', () => {
      material.setProperty('metallic', -1);
      material.setProperty('roughness', 2);

      // Values should be stored as-is (clamping at shader level)
      expect(material.getProperty('metallic')).toBe(-1);
      expect(material.getProperty('roughness')).toBe(2);
    });

    it('handles rapid property updates', () => {
      for (let i = 0; i < 100; i++) {
        material.setProperty('metallic', i / 100);
      }

      expect(material.getProperty('metallic')).toBeCloseTo(0.99);
    });

    it('handles texture slot reuse', () => {
      const tex1 = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      const tex2 = new Texture({
        width: 1024,
        height: 1024,
        format: TextureFormat.RGBA8,
      });

      material.setTexture('albedoMap', tex1);
      material.setTexture('albedoMap', tex2);

      expect(material.getTexture('albedoMap')).toBe(tex2);
    });
  });
});

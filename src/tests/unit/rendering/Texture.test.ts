/**
 * Comprehensive unit tests for the Texture class.
 * Tests 2D textures, cube maps, texture arrays, mipmap generation, format conversion, sampler config, and async loading.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Texture, TextureType, TextureFormat, TextureFilter, TextureWrap, CubeFace } from '../../../rendering/texture/Texture';

describe('Texture', () => {
  describe('2D texture creation', () => {
    it('creates a 2D texture with basic parameters', () => {
      const texture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      expect(texture.type).toBe(TextureType.Texture2D);
      expect(texture.width).toBe(512);
      expect(texture.height).toBe(512);
      expect(texture.format).toBe(TextureFormat.RGBA8);
    });

    it('creates texture with custom label', () => {
      const texture = new Texture({
        width: 256,
        height: 256,
        format: TextureFormat.RGBA8,
        label: 'MyTexture',
      });

      expect(texture.label).toBe('MyTexture');
    });

    it('assigns unique ID to each texture', () => {
      const tex1 = new Texture({
        width: 256,
        height: 256,
        format: TextureFormat.RGBA8,
      });

      const tex2 = new Texture({
        width: 256,
        height: 256,
        format: TextureFormat.RGBA8,
      });

      expect(tex1.id).not.toBe(tex2.id);
    });

    it('supports various texture formats', () => {
      const formats = [
        TextureFormat.R8,
        TextureFormat.RG8,
        TextureFormat.RGB8,
        TextureFormat.RGBA8,
        TextureFormat.RGBA16F,
        TextureFormat.RGBA32F,
      ];

      formats.forEach(format => {
        const texture = new Texture({
          width: 256,
          height: 256,
          format,
        });

        expect(texture.format).toBe(format);
      });
    });

    it('calculates max mip levels automatically', () => {
      const texture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      expect(texture.mipLevels).toBeGreaterThan(1);
    });

    it('accepts custom mip level count', () => {
      const texture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
        mipLevels: 5,
      });

      expect(texture.mipLevels).toBe(5);
    });
  });

  describe('cube map creation', () => {
    it('creates cube texture', () => {
      const cubemap = Texture.createCube({
        width: 1024,
        height: 1024,
        format: TextureFormat.RGBA16F,
      });

      expect(cubemap.type).toBe(TextureType.TextureCube);
      expect(cubemap.width).toBe(1024);
      expect(cubemap.height).toBe(1024);
    });

    it('has 6 cube faces', () => {
      const cubemap = Texture.createCube({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      expect(Object.keys(CubeFace).length / 2).toBe(6); // Enum has both keys and values
    });

    it('supports uploading data to specific faces', () => {
      const cubemap = Texture.createCube({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      for (let face = 0; face < 6; face++) {
        expect(() => {
          cubemap.setData({
            data: new Uint8Array(512 * 512 * 4),
            face,
          });
        }).not.toThrow();
      }
    });
  });

  describe('texture arrays', () => {
    it('creates 2D texture array', () => {
      const arrayTexture = new Texture({
        width: 256,
        height: 256,
        arrayLayers: 16,
        format: TextureFormat.RGBA8,
      });

      expect(arrayTexture.arrayLayers).toBe(16);
    });

    it('supports layer-specific uploads', () => {
      const arrayTexture = new Texture({
        width: 256,
        height: 256,
        arrayLayers: 4,
        format: TextureFormat.RGBA8,
      });

      expect(() => {
        arrayTexture.setData({
          data: new Uint8Array(256 * 256 * 4),
          layer: 0,
        });
      }).not.toThrow();
    });
  });

  describe('mipmap generation', () => {
    let texture: Texture;

    beforeEach(() => {
      texture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
        minFilter: TextureFilter.LinearMipmapLinear,
      });
    });

    it('generates mipmaps', () => {
      expect(() => {
        texture.generateMipmaps();
      }).not.toThrow();
    });

    it('tracks mipmap generation state', () => {
      expect(texture.hasMipmaps()).toBe(false);

      texture.generateMipmaps();

      expect(texture.hasMipmaps()).toBe(true);
    });

    it('supports manual mip level uploads', () => {
      const level0Data = new Uint8Array(512 * 512 * 4);
      const level1Data = new Uint8Array(256 * 256 * 4);

      expect(() => {
        texture.setData({ data: level0Data, level: 0 });
        texture.setData({ data: level1Data, level: 1 });
      }).not.toThrow();
    });

    it('calculates mip dimensions correctly', () => {
      const mipWidth = texture.getMipWidth(1);
      const mipHeight = texture.getMipHeight(1);

      expect(mipWidth).toBe(256);
      expect(mipHeight).toBe(256);
    });
  });

  describe('format conversion', () => {
    it('supports compressed formats', () => {
      const compressed = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.BC1,
      });

      expect(compressed.format).toBe(TextureFormat.BC1);
    });

    it('supports HDR formats', () => {
      const hdr = new Texture({
        width: 1024,
        height: 512,
        format: TextureFormat.RGBA16F,
      });

      expect(hdr.format).toBe(TextureFormat.RGBA16F);
    });

    it('supports depth formats', () => {
      const depth = new Texture({
        width: 1024,
        height: 768,
        format: TextureFormat.Depth24Stencil8,
      });

      expect(depth.format).toBe(TextureFormat.Depth24Stencil8);
    });

    it('calculates memory usage for different formats', () => {
      const rgba8 = new Texture({
        width: 256,
        height: 256,
        format: TextureFormat.RGBA8,
      });

      const rgba16f = new Texture({
        width: 256,
        height: 256,
        format: TextureFormat.RGBA16F,
      });

      const memoryRGBA8 = rgba8.getMemoryUsage();
      const memoryRGBA16F = rgba16f.getMemoryUsage();

      expect(memoryRGBA16F).toBeGreaterThan(memoryRGBA8);
    });
  });

  describe('sampler configuration', () => {
    let texture: Texture;

    beforeEach(() => {
      texture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });
    });

    it('sets minification filter', () => {
      texture.minFilter = TextureFilter.Nearest;
      expect(texture.minFilter).toBe(TextureFilter.Nearest);
    });

    it('sets magnification filter', () => {
      texture.magFilter = TextureFilter.Linear;
      expect(texture.magFilter).toBe(TextureFilter.Linear);
    });

    it('sets wrap modes', () => {
      texture.wrapU = TextureWrap.Repeat;
      texture.wrapV = TextureWrap.ClampToEdge;
      texture.wrapW = TextureWrap.MirroredRepeat;

      expect(texture.wrapU).toBe(TextureWrap.Repeat);
      expect(texture.wrapV).toBe(TextureWrap.ClampToEdge);
      expect(texture.wrapW).toBe(TextureWrap.MirroredRepeat);
    });

    it('sets anisotropic filtering level', () => {
      texture.anisotropy = 16;
      expect(texture.anisotropy).toBe(16);
    });

    it('clamps anisotropy to valid range', () => {
      texture.anisotropy = 32; // Above max
      expect(texture.anisotropy).toBeLessThanOrEqual(16);

      texture.anisotropy = 0.5; // Below min
      expect(texture.anisotropy).toBeGreaterThanOrEqual(1);
    });
  });

  describe('async loading', () => {
    it('loads from ImageData', async () => {
      const texture = new Texture({
        width: 256,
        height: 256,
        format: TextureFormat.RGBA8,
      });

      const imageData = new ImageData(256, 256);

      expect(() => {
        texture.setData({ data: imageData });
      }).not.toThrow();
    });

    it('loads from typed array', () => {
      const texture = new Texture({
        width: 256,
        height: 256,
        format: TextureFormat.RGBA8,
      });

      const data = new Uint8Array(256 * 256 * 4);

      expect(() => {
        texture.setData({ data });
      }).not.toThrow();
    });

    it('tracks upload state', () => {
      const texture = new Texture({
        width: 256,
        height: 256,
        format: TextureFormat.RGBA8,
      });

      expect(texture.isUploaded()).toBe(false);

      texture.setData({ data: new Uint8Array(256 * 256 * 4) });

      expect(texture.isUploaded()).toBe(true);
    });

    it('supports partial updates', () => {
      const texture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      const partialData = new Uint8Array(128 * 128 * 4);

      expect(() => {
        texture.setData({
          data: partialData,
          xOffset: 0,
          yOffset: 0,
        });
      }).not.toThrow();
    });
  });

  describe('memory management', () => {
    it('calculates memory usage', () => {
      const texture = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      const memory = texture.getMemoryUsage();

      expect(memory).toBeGreaterThan(0);
    });

    it('includes mipmap memory in total', () => {
      const textureWithMips = new Texture({
        width: 512,
        height: 512,
        format: TextureFormat.RGBA8,
        minFilter: TextureFilter.LinearMipmapLinear,
      });

      const memory = textureWithMips.getMemoryUsage();

      // With mipmaps should use ~33% more memory
      const expected = 512 * 512 * 4;
      expect(memory).toBeGreaterThan(expected);
    });

    it('disposes texture resources', () => {
      const texture = new Texture({
        width: 256,
        height: 256,
        format: TextureFormat.RGBA8,
      });

      expect(() => {
        texture.dispose();
      }).not.toThrow();
    });
  });

  describe('3D textures', () => {
    it('creates 3D volume texture', () => {
      const volume = new Texture({
        width: 128,
        height: 128,
        depth: 128,
        format: TextureFormat.RGBA8,
      });

      expect(volume.depth).toBe(128);
    });

    it('calculates 3D texture memory correctly', () => {
      const volume = new Texture({
        width: 64,
        height: 64,
        depth: 64,
        format: TextureFormat.R8,
      });

      const memory = volume.getMemoryUsage();
      const expected = 64 * 64 * 64;

      expect(memory).toBeGreaterThanOrEqual(expected);
    });
  });

  describe('edge cases', () => {
    it('handles non-power-of-two dimensions', () => {
      const npot = new Texture({
        width: 300,
        height: 200,
        format: TextureFormat.RGBA8,
      });

      expect(npot.width).toBe(300);
      expect(npot.height).toBe(200);
    });

    it('handles very small textures', () => {
      const tiny = new Texture({
        width: 1,
        height: 1,
        format: TextureFormat.RGBA8,
      });

      expect(tiny.width).toBe(1);
      expect(tiny.height).toBe(1);
    });

    it('handles very large textures', () => {
      const large = new Texture({
        width: 8192,
        height: 8192,
        format: TextureFormat.RGBA8,
      });

      expect(large.width).toBe(8192);
      expect(large.height).toBe(8192);
    });

    it('handles rectangular textures', () => {
      const rect = new Texture({
        width: 1024,
        height: 512,
        format: TextureFormat.RGBA8,
      });

      expect(rect.width).toBe(1024);
      expect(rect.height).toBe(512);
    });
  });
});

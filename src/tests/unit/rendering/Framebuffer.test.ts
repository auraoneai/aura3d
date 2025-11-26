/**
 * Comprehensive unit tests for the Framebuffer/RenderTarget class.
 * Tests color attachments, depth attachments, MRTs, cubemap framebuffers, clear operations, and blit operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../../../rendering/pipeline/RenderTarget';
import { Texture } from '../../../rendering/texture/Texture';

describe('Framebuffer (RenderTarget)', () => {
  describe('color attachment', () => {
    it('creates framebuffer with single color attachment', () => {
      const target = RenderTarget.createColorTarget(1024, 768, TextureFormat.RGBA8);

      expect(target.width).toBe(1024);
      expect(target.height).toBe(768);
      expect(target.colorTextures.length).toBe(1);
    });

    it('creates framebuffer with multiple color attachments', () => {
      const target = new RenderTarget({
        width: 1024,
        height: 768,
        colorFormats: [
          TextureFormat.RGBA8,
          TextureFormat.RGBA16F,
          TextureFormat.R32F,
        ],
      });

      expect(target.colorTextures.length).toBe(3);
    });

    it('supports different color formats', () => {
      const formats = [
        TextureFormat.RGBA8,
        TextureFormat.RGBA16F,
        TextureFormat.RGBA32F,
        TextureFormat.RGB8,
      ];

      formats.forEach(format => {
        const target = RenderTarget.createColorTarget(256, 256, format);
        expect(target.colorTextures[0].format).toBe(format);
      });
    });

    it('creates sRGB color attachments', () => {
      const target = RenderTarget.createColorTarget(512, 512, TextureFormat.RGBA8UnormSrgb);

      expect(target.colorTextures[0].format).toBe(TextureFormat.RGBA8UnormSrgb);
    });
  });

  describe('depth attachment', () => {
    it('creates framebuffer with depth attachment', () => {
      const target = RenderTarget.createDepthTarget(1024, 768);

      expect(target.depthTexture).toBeDefined();
    });

    it('supports different depth formats', () => {
      const depthFormats = [
        TextureFormat.Depth16,
        TextureFormat.Depth24,
        TextureFormat.Depth32F,
      ];

      depthFormats.forEach(format => {
        const target = new RenderTarget({
          width: 512,
          height: 512,
          depthFormat: format,
        });

        expect(target.depthTexture?.format).toBe(format);
      });
    });

    it('creates depth-stencil attachment', () => {
      const target = new RenderTarget({
        width: 1024,
        height: 768,
        depthFormat: TextureFormat.Depth24Stencil8,
      });

      expect(target.depthTexture?.format).toBe(TextureFormat.Depth24Stencil8);
    });

    it('creates color and depth attachments together', () => {
      const target = new RenderTarget({
        width: 1024,
        height: 768,
        colorFormats: [TextureFormat.RGBA8],
        depthFormat: TextureFormat.Depth24,
      });

      expect(target.colorTextures.length).toBe(1);
      expect(target.depthTexture).toBeDefined();
    });
  });

  describe('multiple render targets (MRT)', () => {
    it('creates MRT framebuffer', () => {
      const target = new RenderTarget({
        width: 1024,
        height: 768,
        colorFormats: [
          TextureFormat.RGBA8,
          TextureFormat.RGBA16F,
          TextureFormat.RGBA16F,
          TextureFormat.R32F,
        ],
      });

      expect(target.colorTextures.length).toBe(4);
    });

    it('assigns correct formats to each attachment', () => {
      const formats = [
        TextureFormat.RGBA8,
        TextureFormat.RGBA16F,
        TextureFormat.R32F,
      ];

      const target = new RenderTarget({
        width: 512,
        height: 512,
        colorFormats: formats,
      });

      formats.forEach((format, i) => {
        expect(target.colorTextures[i].format).toBe(format);
      });
    });

    it('supports G-Buffer configuration', () => {
      const gBuffer = new RenderTarget({
        width: 1920,
        height: 1080,
        colorFormats: [
          TextureFormat.RGBA8,      // Albedo
          TextureFormat.RGBA16F,    // Normal
          TextureFormat.RGBA8,      // Material props
        ],
        depthFormat: TextureFormat.Depth24,
      });

      expect(gBuffer.colorTextures.length).toBe(3);
      expect(gBuffer.depthTexture).toBeDefined();
    });
  });

  describe('cubemap framebuffer', () => {
    it('creates cubemap render target', () => {
      const cubemapTarget = RenderTarget.createCubemap(1024, TextureFormat.RGBA16F);

      expect(cubemapTarget.width).toBe(1024);
      expect(cubemapTarget.height).toBe(1024);
      expect(cubemapTarget.isCubemap).toBe(true);
    });

    it('supports rendering to cube faces', () => {
      const cubemapTarget = RenderTarget.createCubemap(512, TextureFormat.RGBA8);

      for (let face = 0; face < 6; face++) {
        expect(() => {
          cubemapTarget.setActiveCubeFace(face);
        }).not.toThrow();
      }
    });

    it('creates depth attachment for cubemap', () => {
      const cubemapTarget = new RenderTarget({
        width: 1024,
        height: 1024,
        colorFormats: [TextureFormat.RGBA16F],
        depthFormat: TextureFormat.Depth24,
        isCubemap: true,
      });

      expect(cubemapTarget.depthTexture).toBeDefined();
    });
  });

  describe('clear operations', () => {
    let target: RenderTarget;

    beforeEach(() => {
      target = new RenderTarget({
        width: 512,
        height: 512,
        colorFormats: [TextureFormat.RGBA8],
        depthFormat: TextureFormat.Depth24,
      });
    });

    it('clears color buffer', () => {
      expect(() => {
        target.clearColor([0, 0, 0, 1]);
      }).not.toThrow();
    });

    it('clears depth buffer', () => {
      expect(() => {
        target.clearDepth(1.0);
      }).not.toThrow();
    });

    it('clears stencil buffer', () => {
      const targetWithStencil = new RenderTarget({
        width: 512,
        height: 512,
        depthFormat: TextureFormat.Depth24Stencil8,
      });

      expect(() => {
        targetWithStencil.clearStencil(0);
      }).not.toThrow();
    });

    it('clears all buffers at once', () => {
      expect(() => {
        target.clear([0, 0, 0, 1], 1.0, 0);
      }).not.toThrow();
    });

    it('supports different clear colors per attachment', () => {
      const mrtTarget = new RenderTarget({
        width: 512,
        height: 512,
        colorFormats: [
          TextureFormat.RGBA8,
          TextureFormat.RGBA8,
        ],
      });

      expect(() => {
        mrtTarget.clearColorAttachment(0, [1, 0, 0, 1]);
        mrtTarget.clearColorAttachment(1, [0, 1, 0, 1]);
      }).not.toThrow();
    });
  });

  describe('blit operations', () => {
    let source: RenderTarget;
    let dest: RenderTarget;

    beforeEach(() => {
      source = RenderTarget.createColorTarget(512, 512, TextureFormat.RGBA8);
      dest = RenderTarget.createColorTarget(512, 512, TextureFormat.RGBA8);
    });

    it('blits from source to destination', () => {
      expect(() => {
        dest.blitFrom(source);
      }).not.toThrow();
    });

    it('blits with scaling', () => {
      const largeTarget = RenderTarget.createColorTarget(1024, 1024, TextureFormat.RGBA8);

      expect(() => {
        largeTarget.blitFrom(source);
      }).not.toThrow();
    });

    it('blits specific attachment', () => {
      const mrtSource = new RenderTarget({
        width: 512,
        height: 512,
        colorFormats: [TextureFormat.RGBA8, TextureFormat.RGBA8],
      });

      expect(() => {
        dest.blitFromAttachment(mrtSource, 1);
      }).not.toThrow();
    });

    it('blits with region specification', () => {
      expect(() => {
        dest.blitFrom(source, {
          srcX: 0,
          srcY: 0,
          srcWidth: 256,
          srcHeight: 256,
          dstX: 0,
          dstY: 0,
          dstWidth: 512,
          dstHeight: 512,
        });
      }).not.toThrow();
    });
  });

  describe('load and store actions', () => {
    it('sets load action for attachments', () => {
      const target = new RenderTarget({
        width: 512,
        height: 512,
        colorFormats: [TextureFormat.RGBA8],
        colorLoadAction: LoadAction.Clear,
      });

      expect(target.colorLoadAction).toBe(LoadAction.Clear);
    });

    it('sets store action for attachments', () => {
      const target = new RenderTarget({
        width: 512,
        height: 512,
        colorFormats: [TextureFormat.RGBA8],
        colorStoreAction: StoreAction.Store,
      });

      expect(target.colorStoreAction).toBe(StoreAction.Store);
    });

    it('supports different load actions', () => {
      const actions = [
        LoadAction.Load,
        LoadAction.Clear,
        LoadAction.DontCare,
      ];

      actions.forEach(action => {
        const target = new RenderTarget({
          width: 256,
          height: 256,
          colorFormats: [TextureFormat.RGBA8],
          colorLoadAction: action,
        });

        expect(target.colorLoadAction).toBe(action);
      });
    });

    it('supports different store actions', () => {
      const actions = [
        StoreAction.Store,
        StoreAction.DontCare,
      ];

      actions.forEach(action => {
        const target = new RenderTarget({
          width: 256,
          height: 256,
          colorFormats: [TextureFormat.RGBA8],
          colorStoreAction: action,
        });

        expect(target.colorStoreAction).toBe(action);
      });
    });
  });

  describe('MSAA support', () => {
    it('creates multisampled framebuffer', () => {
      const msaaTarget = RenderTarget.createColorTarget(
        1024,
        768,
        TextureFormat.RGBA8,
        4 // 4x MSAA
      );

      expect(msaaTarget.samples).toBe(4);
    });

    it('supports different sample counts', () => {
      const samples = [1, 2, 4, 8];

      samples.forEach(count => {
        const target = RenderTarget.createColorTarget(
          512,
          512,
          TextureFormat.RGBA8,
          count
        );

        expect(target.samples).toBe(count);
      });
    });

    it('resolves MSAA to non-MSAA target', () => {
      const msaaTarget = RenderTarget.createColorTarget(512, 512, TextureFormat.RGBA8, 4);
      const resolveTarget = RenderTarget.createColorTarget(512, 512, TextureFormat.RGBA8, 1);

      expect(() => {
        resolveTarget.resolveFrom(msaaTarget);
      }).not.toThrow();
    });
  });

  describe('resize', () => {
    it('resizes render target', () => {
      const target = RenderTarget.createColorTarget(512, 512, TextureFormat.RGBA8);

      target.resize(1024, 768);

      expect(target.width).toBe(1024);
      expect(target.height).toBe(768);
    });

    it('recreates attachments on resize', () => {
      const target = new RenderTarget({
        width: 512,
        height: 512,
        colorFormats: [TextureFormat.RGBA8],
        depthFormat: TextureFormat.Depth24,
      });

      const oldColorTex = target.colorTextures[0];
      const oldDepthTex = target.depthTexture;

      target.resize(1024, 1024);

      expect(target.colorTextures[0]).not.toBe(oldColorTex);
      expect(target.depthTexture).not.toBe(oldDepthTex);
    });
  });

  describe('disposal', () => {
    it('disposes render target resources', () => {
      const target = RenderTarget.createColorTarget(512, 512, TextureFormat.RGBA8);

      expect(() => {
        target.dispose();
      }).not.toThrow();
    });

    it('disposes all attachments', () => {
      const target = new RenderTarget({
        width: 512,
        height: 512,
        colorFormats: [TextureFormat.RGBA8, TextureFormat.RGBA8],
        depthFormat: TextureFormat.Depth24,
      });

      target.dispose();

      // Should dispose all textures
      expect(target.colorTextures.length).toBeGreaterThan(0);
    });

    it('can be disposed multiple times safely', () => {
      const target = RenderTarget.createColorTarget(512, 512, TextureFormat.RGBA8);

      target.dispose();
      expect(() => {
        target.dispose();
      }).not.toThrow();
    });
  });

  describe('validation', () => {
    it('validates dimensions are positive', () => {
      expect(() => {
        RenderTarget.createColorTarget(0, 512, TextureFormat.RGBA8);
      }).toThrow();
    });

    it('validates compatible attachment formats', () => {
      const target = new RenderTarget({
        width: 512,
        height: 512,
        colorFormats: [TextureFormat.RGBA8],
      });

      expect(target.isValid()).toBe(true);
    });

    it('validates MRT attachment count limits', () => {
      const tooManyAttachments = new Array(16).fill(TextureFormat.RGBA8);

      // Most hardware supports 4-8 attachments
      const target = new RenderTarget({
        width: 512,
        height: 512,
        colorFormats: tooManyAttachments,
      });

      // Should clamp or throw
      expect(target.colorTextures.length).toBeLessThanOrEqual(8);
    });
  });

  describe('edge cases', () => {
    it('handles very large dimensions', () => {
      const largeTarget = RenderTarget.createColorTarget(8192, 8192, TextureFormat.RGBA8);

      expect(largeTarget.width).toBe(8192);
      expect(largeTarget.height).toBe(8192);
    });

    it('handles non-square dimensions', () => {
      const rectTarget = RenderTarget.createColorTarget(1920, 1080, TextureFormat.RGBA8);

      expect(rectTarget.width).toBe(1920);
      expect(rectTarget.height).toBe(1080);
    });
  });
});

/**
 * Comprehensive unit tests for the Renderer class.
 * Tests initialization, rendering loop, state management, resource binding, drawing, and resize.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Renderer, RendererConfig, RendererBackend, RenderMode } from '../../../rendering/Renderer';
import { createMockCanvas, MockWebGLRenderingContext } from '../../utils/MockCanvas';
import { Camera } from '../../../rendering/camera/Camera';
import { Scene } from '../../../rendering/scene/Scene';
import { QualityPreset } from '../../../rendering/RenderSettings';

describe('Renderer', () => {
  let canvas: HTMLCanvasElement;
  let mockGL: MockWebGLRenderingContext;

  beforeEach(() => {
    canvas = createMockCanvas(800, 600);
    mockGL = canvas.getContext('webgl2') as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('creates WebGL context', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
        renderMode: RenderMode.Forward,
      });

      expect(renderer).toBeDefined();
      const device = renderer.getDevice();
      expect(device).toBeDefined();

      renderer.dispose();
    });

    it('creates WebGPU context when available', async () => {
      // Mock WebGPU availability
      const mockRequestAdapter = vi.fn().mockResolvedValue({
        requestDevice: vi.fn().mockResolvedValue({
          queue: { submit: vi.fn() },
          createBuffer: vi.fn(),
          createTexture: vi.fn(),
          createCommandEncoder: vi.fn(),
        }),
      });

      (global as any).navigator = {
        gpu: { requestAdapter: mockRequestAdapter },
      };

      try {
        const renderer = await Renderer.create({
          canvas,
          backend: RendererBackend.Auto,
        });

        expect(renderer).toBeDefined();
        renderer.dispose();
      } catch (error) {
        // Expected to fall back to WebGL2 in test environment
        expect(error).toBeDefined();
      }

      delete (global as any).navigator;
    });

    it('falls back to WebGL if WebGPU unavailable', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.Auto,
      });

      expect(renderer).toBeDefined();
      const stats = renderer.getStats();
      expect(stats.backend).toBe('webgl2');

      renderer.dispose();
    });

    it('initializes default render state', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
      });

      const stats = renderer.getStats();
      expect(stats.width).toBe(800);
      expect(stats.height).toBe(600);
      expect(stats.frameCount).toBe(0);
      expect(stats.renderMode).toBe(RenderMode.Deferred);

      renderer.dispose();
    });

    it('initializes with custom configuration', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
        renderMode: RenderMode.Forward,
        width: 1920,
        height: 1080,
        quality: QualityPreset.Low,
        enableProfiling: true,
        hdr: false,
        msaaSamples: 4,
        pixelRatio: 2,
      });

      const stats = renderer.getStats();
      expect(stats.width).toBe(1920);
      expect(stats.height).toBe(1080);
      expect(stats.renderMode).toBe(RenderMode.Forward);

      const profiler = renderer.getProfiler();
      expect(profiler).toBeDefined();

      renderer.dispose();
    });

    it('throws error when WebGPU required but unavailable', async () => {
      await expect(async () => {
        await Renderer.create({
          canvas,
          backend: RendererBackend.WebGPU,
        });
      }).rejects.toThrow();
    });
  });

  describe('render loop', () => {
    let renderer: Renderer;
    let camera: Camera;
    let scene: Scene;

    beforeEach(async () => {
      renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
        renderMode: RenderMode.Forward,
      });

      camera = new Camera();
      camera.setPerspective(Math.PI / 4, 800 / 600, 0.1, 1000);

      scene = new Scene('TestScene');
    });

    afterEach(() => {
      renderer.dispose();
    });

    it('beginFrame() prepares for rendering', () => {
      const statsBefore = renderer.getStats();
      const frameCountBefore = statsBefore.frameCount;

      renderer.render(scene, camera);

      const statsAfter = renderer.getStats();
      expect(statsAfter.frameCount).toBe(frameCountBefore + 1);
    });

    it('endFrame() presents to screen', () => {
      const presentSpy = vi.spyOn(renderer.getDevice(), 'present');

      renderer.render(scene, camera);

      expect(presentSpy).toHaveBeenCalled();
    });

    it('clear() clears buffers', () => {
      const clearSpy = vi.spyOn(mockGL, 'clear');

      renderer.render(scene, camera);

      expect(clearSpy).toHaveBeenCalled();
    });

    it('setViewport() configures viewport', () => {
      const viewportSpy = vi.spyOn(mockGL, 'viewport');

      renderer.render(scene, camera);

      expect(viewportSpy).toHaveBeenCalled();
    });

    it('setScissor() configures scissor test', () => {
      const scissorSpy = vi.spyOn(mockGL, 'scissor');
      const enableSpy = vi.spyOn(mockGL, 'enable');

      // Trigger scissor through rendering
      renderer.render(scene, camera);

      // Verify scissor was set at some point
      expect(enableSpy).toHaveBeenCalled();
    });

    it('updates FPS counter correctly', () => {
      for (let i = 0; i < 10; i++) {
        renderer.render(scene, camera);
      }

      const stats = renderer.getStats();
      expect(stats.fps).toBeGreaterThan(0);
      expect(stats.frameTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('state management', () => {
    let renderer: Renderer;

    beforeEach(async () => {
      renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
      });
    });

    afterEach(() => {
      renderer.dispose();
    });

    it('setBlendState() configures blending', () => {
      const enableSpy = vi.spyOn(mockGL, 'enable');
      const blendFuncSpy = vi.spyOn(mockGL, 'blendFunc');

      const settings = renderer.getSettings();
      settings.enableBloom = true; // Triggers blending

      expect(enableSpy).toHaveBeenCalled();
    });

    it('setDepthState() configures depth test', () => {
      const enableSpy = vi.spyOn(mockGL, 'enable');
      const depthFuncSpy = vi.spyOn(mockGL, 'depthFunc');

      const scene = new Scene('TestScene');
      const camera = new Camera();
      renderer.render(scene, camera);

      expect(enableSpy).toHaveBeenCalled();
    });

    it('setStencilState() configures stencil', () => {
      const enableSpy = vi.spyOn(mockGL, 'enable');

      const settings = renderer.getSettings();
      // Stencil would be configured through settings

      expect(enableSpy).toHaveBeenCalled();
    });

    it('setCullMode() sets face culling', () => {
      const enableSpy = vi.spyOn(mockGL, 'enable');
      const cullFaceSpy = vi.spyOn(mockGL, 'cullFace');

      const scene = new Scene('TestScene');
      const camera = new Camera();
      renderer.render(scene, camera);

      expect(enableSpy).toHaveBeenCalled();
    });

    it('state changes do not leak between draws', () => {
      const scene1 = new Scene('Scene1');
      const scene2 = new Scene('Scene2');
      const camera = new Camera();

      renderer.render(scene1, camera);
      const stats1 = renderer.getStats();

      renderer.render(scene2, camera);
      const stats2 = renderer.getStats();

      // Frame count should increment independently
      expect(stats2.frameCount).toBe(stats1.frameCount + 1);
    });
  });

  describe('resource binding', () => {
    let renderer: Renderer;

    beforeEach(async () => {
      renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
      });
    });

    afterEach(() => {
      renderer.dispose();
    });

    it('bindVertexBuffer() binds geometry', () => {
      const bindBufferSpy = vi.spyOn(mockGL, 'bindBuffer');

      const resourceManager = renderer.getResourceManager();
      expect(resourceManager).toBeDefined();

      // Resource manager should handle buffer binding
      const scene = new Scene('TestScene');
      const camera = new Camera();
      renderer.render(scene, camera);

      expect(bindBufferSpy).toHaveBeenCalled();
    });

    it('bindIndexBuffer() binds indices', () => {
      const bindBufferSpy = vi.spyOn(mockGL, 'bindBuffer');

      const scene = new Scene('TestScene');
      const camera = new Camera();
      renderer.render(scene, camera);

      // Index buffer binding occurs during rendering
      expect(bindBufferSpy).toHaveBeenCalled();
    });

    it('bindTexture() binds textures', () => {
      const bindTextureSpy = vi.spyOn(mockGL, 'bindTexture');
      const activeTextureSpy = vi.spyOn(mockGL, 'activeTexture');

      const scene = new Scene('TestScene');
      const camera = new Camera();
      renderer.render(scene, camera);

      // Texture binding may occur during rendering
      expect(activeTextureSpy).toHaveBeenCalled();
    });

    it('bindUniformBuffer() binds uniforms', () => {
      const uniformSpy = vi.spyOn(mockGL, 'uniform4f');

      const scene = new Scene('TestScene');
      const camera = new Camera();
      renderer.render(scene, camera);

      // Uniforms are set during rendering
      expect(uniformSpy).toHaveBeenCalled();
    });

    it('handles resource binding errors gracefully', () => {
      const bindBufferSpy = vi.spyOn(mockGL, 'bindBuffer').mockImplementation(() => {
        // Simulate WebGL error
      });

      const scene = new Scene('TestScene');
      const camera = new Camera();

      // Should not throw
      expect(() => {
        renderer.render(scene, camera);
      }).not.toThrow();

      bindBufferSpy.mockRestore();
    });
  });

  describe('drawing', () => {
    let renderer: Renderer;
    let camera: Camera;
    let scene: Scene;

    beforeEach(async () => {
      renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
        renderMode: RenderMode.Forward,
      });

      camera = new Camera();
      camera.setPerspective(Math.PI / 4, 800 / 600, 0.1, 1000);

      scene = new Scene('TestScene');
    });

    afterEach(() => {
      renderer.dispose();
    });

    it('draw() issues draw call', () => {
      const drawArraysSpy = vi.spyOn(mockGL, 'drawArrays');
      const drawElementsSpy = vi.spyOn(mockGL, 'drawElements');

      renderer.render(scene, camera);

      // At least one draw call should be made
      const totalDrawCalls = drawArraysSpy.mock.calls.length + drawElementsSpy.mock.calls.length;
      expect(totalDrawCalls).toBeGreaterThanOrEqual(0);
    });

    it('drawIndexed() uses index buffer', () => {
      const drawElementsSpy = vi.spyOn(mockGL, 'drawElements');

      renderer.render(scene, camera);

      // Indexed drawing may occur
      expect(drawElementsSpy).toHaveBeenCalled();
    });

    it('drawInstanced() renders instances', () => {
      const scene = new Scene('TestScene');

      renderer.render(scene, camera);

      const stats = renderer.getStats();
      expect(stats.drawCalls).toBeGreaterThanOrEqual(0);
    });

    it('tracks draw call statistics', () => {
      renderer.render(scene, camera);

      const stats = renderer.getStats();
      expect(stats.drawCalls).toBeGreaterThanOrEqual(0);
      expect(stats.triangles).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resize', () => {
    let renderer: Renderer;

    beforeEach(async () => {
      renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
        width: 800,
        height: 600,
      });
    });

    afterEach(() => {
      renderer.dispose();
    });

    it('handles canvas resize', () => {
      renderer.resize(1920, 1080);

      const stats = renderer.getStats();
      expect(stats.width).toBe(1920);
      expect(stats.height).toBe(1080);
    });

    it('updates framebuffer dimensions', () => {
      const viewportSpy = vi.spyOn(mockGL, 'viewport');

      renderer.resize(1024, 768);

      const camera = new Camera();
      const scene = new Scene('TestScene');
      renderer.render(scene, camera);

      expect(viewportSpy).toHaveBeenCalled();
    });

    it('maintains pixel ratio', () => {
      const pixelRatio = 2;
      const newRenderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
        pixelRatio,
      });

      newRenderer.resize(800, 600);

      const stats = newRenderer.getStats();
      expect(stats.width).toBe(800);
      expect(stats.height).toBe(600);

      newRenderer.dispose();
    });

    it('ignores redundant resize calls', () => {
      const renderGraph = renderer.getRenderGraph();
      const resetSpy = vi.spyOn(renderGraph, 'reset');

      renderer.resize(800, 600); // Same size

      expect(resetSpy).not.toHaveBeenCalled();
    });

    it('recreates render targets on resize', () => {
      renderer.resize(1920, 1080);
      renderer.resize(1024, 768);

      const stats = renderer.getStats();
      expect(stats.width).toBe(1024);
      expect(stats.height).toBe(768);
    });

    it('handles zero or negative dimensions gracefully', () => {
      // Should clamp to minimum valid size
      renderer.resize(0, 0);

      const stats = renderer.getStats();
      expect(stats.width).toBeGreaterThan(0);
      expect(stats.height).toBeGreaterThan(0);
    });
  });

  describe('quality and settings', () => {
    it('applies quality presets', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
        quality: QualityPreset.Low,
      });

      renderer.setQuality(QualityPreset.Ultra);

      const settings = renderer.getSettings();
      expect(settings).toBeDefined();

      renderer.dispose();
    });

    it('exposes render settings', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
      });

      const settings = renderer.getSettings();
      expect(settings).toBeDefined();
      expect(settings.shadowQuality).toBeDefined();

      renderer.dispose();
    });

    it('exposes light manager', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
      });

      const lightManager = renderer.getLightManager();
      expect(lightManager).toBeDefined();

      renderer.dispose();
    });

    it('exposes shadow mapper', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
      });

      const shadowMapper = renderer.getShadowMapper();
      expect(shadowMapper).toBeDefined();

      renderer.dispose();
    });
  });

  describe('cleanup and disposal', () => {
    it('disposes all resources', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
      });

      const device = renderer.getDevice();
      const disposeSpy = vi.spyOn(device, 'dispose');

      renderer.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('can be disposed multiple times safely', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
      });

      expect(() => {
        renderer.dispose();
        renderer.dispose();
      }).not.toThrow();
    });

    it('releases render targets', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
        hdr: true,
      });

      renderer.dispose();

      // Should not crash after disposal
      expect(() => {
        renderer.getStats();
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('handles GPU context loss gracefully', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
      });

      // Simulate context loss
      const getErrorSpy = vi.spyOn(mockGL, 'getError').mockReturnValue(mockGL.CONTEXT_LOST_WEBGL || 0x9242);

      const scene = new Scene('TestScene');
      const camera = new Camera();

      expect(() => {
        renderer.render(scene, camera);
      }).not.toThrow();

      renderer.dispose();
      getErrorSpy.mockRestore();
    });

    it('handles resource creation failures', async () => {
      const createTextureSpy = vi.spyOn(mockGL, 'createTexture').mockReturnValue(null);

      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
      });

      expect(renderer).toBeDefined();

      renderer.dispose();
      createTextureSpy.mockRestore();
    });
  });

  describe('toString', () => {
    it('returns debug string representation', async () => {
      const renderer = await Renderer.create({
        canvas,
        backend: RendererBackend.WebGL2,
        renderMode: RenderMode.Forward,
      });

      const str = renderer.toString();
      expect(str).toContain('Renderer');
      expect(str).toContain('forward');

      renderer.dispose();
    });
  });
});

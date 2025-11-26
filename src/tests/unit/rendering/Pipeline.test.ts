/**
 * Comprehensive unit tests for the Pipeline/PipelineState class.
 * Tests pipeline state objects, render pass config, blend state, depth stencil state, rasterizer state, and vertex layout.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineState, BlendState, DepthStencilState, RasterizerState } from '../../../rendering/pipeline/PipelineState';
import { VertexFormat } from '../../../rendering/geometry/VertexFormat';
import { Shader } from '../../../rendering/shader/Shader';
import { createMockCanvas } from '../../utils/MockCanvas';

describe('Pipeline (PipelineState)', () => {
  let gl: WebGL2RenderingContext;
  let shader: Shader;

  beforeEach(() => {
    const canvas = createMockCanvas();
    gl = canvas.getContext('webgl2') as any;

    shader = new Shader({
      name: 'TestShader',
      source: {
        vertex: 'void main() { gl_Position = vec4(0.0); }',
        fragment: 'void main() { gl_FragColor = vec4(1.0); }',
      },
      gl,
    });
  });

  describe('pipeline state objects', () => {
    it('creates pipeline state', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3N3T2(),
      });

      expect(pipeline).toBeDefined();
    });

    it('assigns unique ID to each pipeline', () => {
      const pipeline1 = new PipelineState({ shader, vertexFormat: VertexFormat.P3() });
      const pipeline2 = new PipelineState({ shader, vertexFormat: VertexFormat.P3() });

      expect(pipeline1.id).not.toBe(pipeline2.id);
    });

    it('caches pipeline states', () => {
      const format = VertexFormat.P3N3T2();

      const pipeline1 = PipelineState.getOrCreate({
        shader,
        vertexFormat: format,
      });

      const pipeline2 = PipelineState.getOrCreate({
        shader,
        vertexFormat: format,
      });

      expect(pipeline1).toBe(pipeline2);
    });

    it('invalidates cache when state changes', () => {
      const format = VertexFormat.P3();

      const pipeline1 = PipelineState.getOrCreate({
        shader,
        vertexFormat: format,
        blendState: { enabled: false },
      });

      const pipeline2 = PipelineState.getOrCreate({
        shader,
        vertexFormat: format,
        blendState: { enabled: true },
      });

      expect(pipeline1).not.toBe(pipeline2);
    });
  });

  describe('render pass configuration', () => {
    it('configures render pass attachments', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        colorAttachmentCount: 1,
      });

      expect(pipeline.colorAttachmentCount).toBe(1);
    });

    it('supports multiple render targets', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        colorAttachmentCount: 4,
      });

      expect(pipeline.colorAttachmentCount).toBe(4);
    });

    it('configures depth attachment', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        hasDepthAttachment: true,
      });

      expect(pipeline.hasDepthAttachment).toBe(true);
    });

    it('configures stencil attachment', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        hasStencilAttachment: true,
      });

      expect(pipeline.hasStencilAttachment).toBe(true);
    });
  });

  describe('blend state', () => {
    it('disables blending by default', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      expect(pipeline.blendState.enabled).toBe(false);
    });

    it('enables alpha blending', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        blendState: {
          enabled: true,
          srcFactor: 'SrcAlpha',
          dstFactor: 'OneMinusSrcAlpha',
        },
      });

      expect(pipeline.blendState.enabled).toBe(true);
      expect(pipeline.blendState.srcFactor).toBe('SrcAlpha');
      expect(pipeline.blendState.dstFactor).toBe('OneMinusSrcAlpha');
    });

    it('supports additive blending', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        blendState: {
          enabled: true,
          srcFactor: 'One',
          dstFactor: 'One',
        },
      });

      expect(pipeline.blendState.srcFactor).toBe('One');
      expect(pipeline.blendState.dstFactor).toBe('One');
    });

    it('supports premultiplied alpha blending', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        blendState: {
          enabled: true,
          srcFactor: 'One',
          dstFactor: 'OneMinusSrcAlpha',
        },
      });

      expect(pipeline.blendState.enabled).toBe(true);
    });

    it('configures blend operations', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        blendState: {
          enabled: true,
          srcFactor: 'SrcAlpha',
          dstFactor: 'OneMinusSrcAlpha',
          operation: 'Add',
        },
      });

      expect(pipeline.blendState.operation).toBe('Add');
    });

    it('supports separate alpha blending', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        blendState: {
          enabled: true,
          srcFactor: 'SrcAlpha',
          dstFactor: 'OneMinusSrcAlpha',
          srcAlphaFactor: 'One',
          dstAlphaFactor: 'One',
        },
      });

      expect(pipeline.blendState.srcAlphaFactor).toBe('One');
      expect(pipeline.blendState.dstAlphaFactor).toBe('One');
    });
  });

  describe('depth stencil state', () => {
    it('enables depth test by default', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      expect(pipeline.depthStencilState.depthTestEnabled).toBe(true);
    });

    it('enables depth write by default', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      expect(pipeline.depthStencilState.depthWriteEnabled).toBe(true);
    });

    it('configures depth comparison function', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        depthStencilState: {
          depthTestEnabled: true,
          depthCompareFunc: 'LessEqual',
        },
      });

      expect(pipeline.depthStencilState.depthCompareFunc).toBe('LessEqual');
    });

    it('supports different depth functions', () => {
      const functions = ['Never', 'Less', 'Equal', 'LessEqual', 'Greater', 'NotEqual', 'GreaterEqual', 'Always'];

      functions.forEach(func => {
        const pipeline = new PipelineState({
          shader,
          vertexFormat: VertexFormat.P3(),
          depthStencilState: {
            depthTestEnabled: true,
            depthCompareFunc: func as any,
          },
        });

        expect(pipeline.depthStencilState.depthCompareFunc).toBe(func);
      });
    });

    it('disables depth write for transparent objects', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        depthStencilState: {
          depthTestEnabled: true,
          depthWriteEnabled: false,
        },
      });

      expect(pipeline.depthStencilState.depthWriteEnabled).toBe(false);
    });

    it('configures stencil operations', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        depthStencilState: {
          stencilTestEnabled: true,
          stencilFunc: 'Always',
          stencilRef: 1,
          stencilMask: 0xFF,
        },
      });

      expect(pipeline.depthStencilState.stencilTestEnabled).toBe(true);
      expect(pipeline.depthStencilState.stencilFunc).toBe('Always');
    });
  });

  describe('rasterizer state', () => {
    it('uses back-face culling by default', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      expect(pipeline.rasterizerState.cullMode).toBe('Back');
    });

    it('supports different cull modes', () => {
      const modes = ['None', 'Front', 'Back'];

      modes.forEach(mode => {
        const pipeline = new PipelineState({
          shader,
          vertexFormat: VertexFormat.P3(),
          rasterizerState: {
            cullMode: mode as any,
          },
        });

        expect(pipeline.rasterizerState.cullMode).toBe(mode);
      });
    });

    it('configures front face winding', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        rasterizerState: {
          frontFace: 'CW',
        },
      });

      expect(pipeline.rasterizerState.frontFace).toBe('CW');
    });

    it('supports wireframe rendering', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        rasterizerState: {
          fillMode: 'Wireframe',
        },
      });

      expect(pipeline.rasterizerState.fillMode).toBe('Wireframe');
    });

    it('configures depth bias', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        rasterizerState: {
          depthBias: 1.0,
          depthBiasSlope: 2.0,
        },
      });

      expect(pipeline.rasterizerState.depthBias).toBe(1.0);
      expect(pipeline.rasterizerState.depthBiasSlope).toBe(2.0);
    });

    it('configures scissor test', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        rasterizerState: {
          scissorTestEnabled: true,
        },
      });

      expect(pipeline.rasterizerState.scissorTestEnabled).toBe(true);
    });
  });

  describe('vertex layout', () => {
    it('uses vertex format for layout', () => {
      const format = VertexFormat.P3N3T2();

      const pipeline = new PipelineState({
        shader,
        vertexFormat: format,
      });

      expect(pipeline.vertexFormat).toBe(format);
    });

    it('supports position-only layout', () => {
      const format = VertexFormat.P3();

      const pipeline = new PipelineState({
        shader,
        vertexFormat: format,
      });

      expect(pipeline.vertexFormat.attributes.length).toBe(1);
    });

    it('supports full PBR vertex layout', () => {
      const format = VertexFormat.P3N3T4T2();

      const pipeline = new PipelineState({
        shader,
        vertexFormat: format,
      });

      expect(pipeline.vertexFormat.attributes.length).toBeGreaterThan(2);
    });

    it('validates vertex format compatibility with shader', () => {
      const format = VertexFormat.P3N3T2();

      const pipeline = new PipelineState({
        shader,
        vertexFormat: format,
      });

      expect(pipeline.isValid()).toBe(true);
    });
  });

  describe('primitive topology', () => {
    it('uses triangle list by default', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      expect(pipeline.primitiveTopology).toBe('TriangleList');
    });

    it('supports different topologies', () => {
      const topologies = ['PointList', 'LineList', 'LineStrip', 'TriangleList', 'TriangleStrip'];

      topologies.forEach(topology => {
        const pipeline = new PipelineState({
          shader,
          vertexFormat: VertexFormat.P3(),
          primitiveTopology: topology as any,
        });

        expect(pipeline.primitiveTopology).toBe(topology);
      });
    });
  });

  describe('binding and activation', () => {
    it('binds pipeline state', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      expect(() => {
        pipeline.bind(gl);
      }).not.toThrow();
    });

    it('unbinds pipeline state', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      pipeline.bind(gl);

      expect(() => {
        pipeline.unbind(gl);
      }).not.toThrow();
    });

    it('tracks bound state', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      pipeline.bind(gl);
      expect(pipeline.isBound()).toBe(true);

      pipeline.unbind(gl);
      expect(pipeline.isBound()).toBe(false);
    });
  });

  describe('state comparison', () => {
    it('compares pipeline states', () => {
      const pipeline1 = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      const pipeline2 = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      expect(pipeline1.equals(pipeline2)).toBe(true);
    });

    it('detects different blend states', () => {
      const pipeline1 = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        blendState: { enabled: false },
      });

      const pipeline2 = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        blendState: { enabled: true },
      });

      expect(pipeline1.equals(pipeline2)).toBe(false);
    });

    it('computes hash for caching', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      const hash = pipeline.getHash();
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('cloning', () => {
    it('clones pipeline state', () => {
      const original = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3N3T2(),
        blendState: { enabled: true },
      });

      const cloned = original.clone();

      expect(cloned.equals(original)).toBe(true);
      expect(cloned).not.toBe(original);
    });

    it('creates independent copy', () => {
      const original = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        rasterizerState: { cullMode: 'Back' },
      });

      const cloned = original.clone();
      cloned.rasterizerState.cullMode = 'None';

      expect(original.rasterizerState.cullMode).toBe('Back');
    });
  });

  describe('validation', () => {
    it('validates complete pipeline state', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3N3T2(),
      });

      expect(pipeline.isValid()).toBe(true);
    });

    it('validates shader is set', () => {
      expect(() => {
        new PipelineState({
          shader: null as any,
          vertexFormat: VertexFormat.P3(),
        });
      }).toThrow();
    });

    it('validates vertex format is set', () => {
      expect(() => {
        new PipelineState({
          shader,
          vertexFormat: null as any,
        });
      }).toThrow();
    });
  });

  describe('serialization', () => {
    it('converts to JSON', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3N3T2(),
        blendState: { enabled: true },
      });

      const json = pipeline.toJSON();

      expect(json).toBeDefined();
      expect(json.blendState.enabled).toBe(true);
    });

    it('includes all state in JSON', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
        blendState: { enabled: true },
        depthStencilState: { depthTestEnabled: true },
        rasterizerState: { cullMode: 'Back' },
      });

      const json = pipeline.toJSON();

      expect(json.blendState).toBeDefined();
      expect(json.depthStencilState).toBeDefined();
      expect(json.rasterizerState).toBeDefined();
    });
  });

  describe('disposal', () => {
    it('disposes pipeline resources', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      expect(() => {
        pipeline.dispose();
      }).not.toThrow();
    });

    it('can be disposed multiple times safely', () => {
      const pipeline = new PipelineState({
        shader,
        vertexFormat: VertexFormat.P3(),
      });

      pipeline.dispose();
      expect(() => {
        pipeline.dispose();
      }).not.toThrow();
    });
  });
});

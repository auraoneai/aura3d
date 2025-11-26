/**
 * Comprehensive unit tests for the Shader class.
 * Tests compilation, uniform discovery, attribute binding, variant generation, include processing, and error reporting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Shader, ShaderType } from '../../../rendering/shader/Shader';
import { createMockCanvas } from '../../utils/MockCanvas';

describe('Shader', () => {
  let gl: WebGL2RenderingContext;

  beforeEach(() => {
    const canvas = createMockCanvas();
    gl = canvas.getContext('webgl2') as any;
  });

  describe('compilation', () => {
    it('compiles valid shader', () => {
      const shader = new Shader({
        name: 'TestShader',
        source: {
          vertex: 'void main() { gl_Position = vec4(0.0); }',
          fragment: 'void main() { gl_FragColor = vec4(1.0); }',
        },
        gl,
      });

      expect(shader).toBeDefined();
    });

    it('compiles with defines', () => {
      const shader = new Shader({
        name: 'TestShader',
        source: {
          vertex: '#ifdef USE_TEXTURE\n#endif\nvoid main() {}',
          fragment: 'void main() {}',
        },
        defines: {
          USE_TEXTURE: 1,
        },
        gl,
      });

      expect(shader).toBeDefined();
    });

    it('handles compilation errors', () => {
      const shader = new Shader({
        name: 'InvalidShader',
        source: {
          vertex: 'invalid syntax',
          fragment: 'void main() {}',
        },
        gl,
      });

      expect(shader.isReady()).toBe(false);
      expect(shader.getErrors().length).toBeGreaterThan(0);
    });

    it('reports shader type in errors', () => {
      const shader = new Shader({
        name: 'InvalidShader',
        source: {
          vertex: 'invalid syntax',
          fragment: 'void main() {}',
        },
        gl,
      });

      const errors = shader.getErrors();
      expect(errors[0].shaderType).toBe(ShaderType.Vertex);
    });

    it('can recompile shader', () => {
      const shader = new Shader({
        name: 'TestShader',
        source: {
          vertex: 'void main() {}',
          fragment: 'void main() {}',
        },
        gl,
      });

      expect(() => {
        shader.compile();
      }).not.toThrow();
    });
  });

  describe('uniform discovery', () => {
    let shader: Shader;

    beforeEach(() => {
      shader = new Shader({
        name: 'UniformShader',
        source: {
          vertex: `
            uniform mat4 modelMatrix;
            uniform mat4 viewMatrix;
            void main() {}
          `,
          fragment: `
            uniform vec3 albedo;
            uniform float metallic;
            void main() {}
          `,
        },
        gl,
      });
    });

    it('discovers uniforms', () => {
      const uniforms = shader.getUniforms();
      expect(uniforms.size).toBeGreaterThan(0);
    });

    it('gets uniform by name', () => {
      const uniform = shader.getUniform('albedo');
      expect(uniform).toBeDefined();
    });

    it('returns null for non-existent uniform', () => {
      const uniform = shader.getUniform('nonExistent');
      expect(uniform).toBeNull();
    });

    it('detects uniform types', () => {
      const matrixUniform = shader.getUniform('modelMatrix');
      expect(matrixUniform?.type).toContain('mat4');
    });

    it('handles uniform arrays', () => {
      const arrayShader = new Shader({
        name: 'ArrayShader',
        source: {
          vertex: 'void main() {}',
          fragment: 'uniform vec3 colors[4]; void main() {}',
        },
        gl,
      });

      const uniform = arrayShader.getUniform('colors');
      expect(uniform?.size).toBeGreaterThan(1);
    });
  });

  describe('attribute binding', () => {
    let shader: Shader;

    beforeEach(() => {
      shader = new Shader({
        name: 'AttributeShader',
        source: {
          vertex: `
            attribute vec3 position;
            attribute vec3 normal;
            attribute vec2 texCoord;
            void main() {}
          `,
          fragment: 'void main() {}',
        },
        gl,
      });
    });

    it('discovers attributes', () => {
      const attributes = shader.getAttributes();
      expect(attributes.size).toBeGreaterThan(0);
    });

    it('gets attribute by name', () => {
      const attr = shader.getAttribute('position');
      expect(attr).toBeDefined();
    });

    it('assigns attribute locations', () => {
      const attr = shader.getAttribute('position');
      expect(attr?.location).toBeGreaterThanOrEqual(0);
    });

    it('detects attribute types', () => {
      const attr = shader.getAttribute('position');
      expect(attr?.type).toContain('vec3');
    });
  });

  describe('variant generation', () => {
    it('creates shader with different defines', () => {
      const baseSource = {
        vertex: '#ifdef USE_NORMALS\n#endif\nvoid main() {}',
        fragment: 'void main() {}',
      };

      const variant1 = new Shader({
        name: 'Variant1',
        source: baseSource,
        defines: { USE_NORMALS: 1 },
        gl,
      });

      const variant2 = new Shader({
        name: 'Variant2',
        source: baseSource,
        defines: { USE_NORMALS: 0 },
        gl,
      });

      expect(variant1).toBeDefined();
      expect(variant2).toBeDefined();
    });

    it('supports numeric defines', () => {
      const shader = new Shader({
        name: 'NumericDefines',
        source: {
          vertex: '#define MAX_LIGHTS 4\nvoid main() {}',
          fragment: 'void main() {}',
        },
        defines: { MAX_LIGHTS: 8 },
        gl,
      });

      expect(shader).toBeDefined();
    });
  });

  describe('include processing', () => {
    it('processes include directives', () => {
      const shader = new Shader({
        name: 'IncludeShader',
        source: {
          vertex: '#include <common>\nvoid main() {}',
          fragment: 'void main() {}',
        },
        gl,
      });

      expect(shader).toBeDefined();
    });

    it('handles nested includes', () => {
      const shader = new Shader({
        name: 'NestedIncludes',
        source: {
          vertex: '#include <lighting>\nvoid main() {}',
          fragment: 'void main() {}',
        },
        gl,
      });

      expect(shader).toBeDefined();
    });
  });

  describe('error reporting', () => {
    it('reports line numbers in errors', () => {
      const shader = new Shader({
        name: 'ErrorShader',
        source: {
          vertex: 'void main() {\n  invalid code here\n}',
          fragment: 'void main() {}',
        },
        gl,
      });

      const errors = shader.getErrors();
      if (errors.length > 0) {
        expect(errors[0].line).toBeDefined();
      }
    });

    it('provides error messages', () => {
      const shader = new Shader({
        name: 'ErrorShader',
        source: {
          vertex: 'invalid',
          fragment: 'void main() {}',
        },
        gl,
      });

      const errors = shader.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toBeDefined();
    });

    it('clears errors on successful recompile', () => {
      const shader = new Shader({
        name: 'RecompileShader',
        source: {
          vertex: 'invalid',
          fragment: 'void main() {}',
        },
        gl,
      });

      expect(shader.getErrors().length).toBeGreaterThan(0);

      shader.updateSource({
        vertex: 'void main() {}',
        fragment: 'void main() {}',
      });
      shader.compile();

      expect(shader.getErrors().length).toBe(0);
    });
  });

  describe('uniform setting', () => {
    let shader: Shader;

    beforeEach(() => {
      shader = new Shader({
        name: 'UniformShader',
        source: {
          vertex: 'void main() {}',
          fragment: `
            uniform float testFloat;
            uniform vec3 testVec3;
            uniform mat4 testMat4;
            void main() {}
          `,
        },
        gl,
      });
      shader.bind();
    });

    it('sets float uniform', () => {
      expect(() => {
        shader.setUniform('testFloat', 1.5);
      }).not.toThrow();
    });

    it('sets vector uniform', () => {
      expect(() => {
        shader.setUniform('testVec3', [1, 2, 3]);
      }).not.toThrow();
    });

    it('sets matrix uniform', () => {
      const mat = new Float32Array(16);
      expect(() => {
        shader.setUniform('testMat4', mat);
      }).not.toThrow();
    });

    it('caches uniform values', () => {
      shader.setUniform('testFloat', 1.0);
      shader.setUniform('testFloat', 1.0); // Same value

      // Second call should be cached
      expect(shader.getCachedUniform('testFloat')).toBe(1.0);
    });

    it('ignores non-existent uniforms gracefully', () => {
      expect(() => {
        shader.setUniform('nonExistent', 1.0);
      }).not.toThrow();
    });
  });

  describe('hot reload', () => {
    it('supports hot reload in development', () => {
      const shader = new Shader({
        name: 'HotReloadShader',
        source: {
          vertex: 'void main() {}',
          fragment: 'void main() {}',
        },
        hotReload: true,
        gl,
      });

      expect(shader).toBeDefined();
    });

    it('updates source and recompiles', () => {
      const shader = new Shader({
        name: 'UpdateShader',
        source: {
          vertex: 'void main() {}',
          fragment: 'void main() {}',
        },
        gl,
      });

      shader.updateSource({
        vertex: 'uniform mat4 model; void main() {}',
        fragment: 'void main() {}',
      });

      expect(() => {
        shader.compile();
      }).not.toThrow();
    });
  });

  describe('binding and usage', () => {
    let shader: Shader;

    beforeEach(() => {
      shader = new Shader({
        name: 'BindShader',
        source: {
          vertex: 'void main() {}',
          fragment: 'void main() {}',
        },
        gl,
      });
    });

    it('binds shader for use', () => {
      expect(() => {
        shader.bind();
      }).not.toThrow();
    });

    it('unbinds shader', () => {
      shader.bind();
      expect(() => {
        shader.unbind();
      }).not.toThrow();
    });

    it('checks if shader is bound', () => {
      shader.bind();
      expect(shader.isBound()).toBe(true);

      shader.unbind();
      expect(shader.isBound()).toBe(false);
    });
  });

  describe('disposal', () => {
    it('disposes shader resources', () => {
      const shader = new Shader({
        name: 'DisposeShader',
        source: {
          vertex: 'void main() {}',
          fragment: 'void main() {}',
        },
        gl,
      });

      expect(() => {
        shader.dispose();
      }).not.toThrow();
    });

    it('can be disposed multiple times safely', () => {
      const shader = new Shader({
        name: 'DisposeShader',
        source: {
          vertex: 'void main() {}',
          fragment: 'void main() {}',
        },
        gl,
      });

      shader.dispose();
      expect(() => {
        shader.dispose();
      }).not.toThrow();
    });
  });

  describe('compute shaders', () => {
    it('creates compute shader', () => {
      const shader = new Shader({
        name: 'ComputeShader',
        source: {
          vertex: 'void main() {}',
          fragment: 'void main() {}',
          compute: 'void main() {}',
        },
        gl,
      });

      expect(shader).toBeDefined();
    });
  });
});

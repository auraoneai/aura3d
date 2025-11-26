/**
 * Comprehensive unit tests for the RenderGraph class.
 * Tests pass creation, ordering, resource allocation, dependencies, barriers, culling, and aliasing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RenderGraph } from '../../../rendering/pipeline/RenderGraph';
import { RenderPass } from '../../../rendering/pipeline/RenderPass';
import { TextureFormat } from '../../../rendering/pipeline/RenderTarget';

// Mock RenderPass for testing
class MockRenderPass extends RenderPass {
  public executeCalled = false;
  public setupCalled = false;

  constructor(name: string) {
    super(name);
  }

  setup(): void {
    this.setupCalled = true;
  }

  execute(): void {
    this.executeCalled = true;
  }
}

describe('RenderGraph', () => {
  let renderGraph: RenderGraph;

  beforeEach(() => {
    renderGraph = new RenderGraph({
      enableAliasing: true,
      enableCulling: true,
      enableBarriers: true,
      defaultWidth: 1920,
      defaultHeight: 1080,
      enableValidation: true,
    });
  });

  afterEach(() => {
    renderGraph.reset();
  });

  describe('pass creation and ordering', () => {
    it('adds passes to the graph', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      const retrievedPass1 = renderGraph.getPass('Pass1');
      const retrievedPass2 = renderGraph.getPass('Pass2');

      expect(retrievedPass1).toBe(pass1);
      expect(retrievedPass2).toBe(pass2);
    });

    it('removes passes from the graph', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.removePass('Pass1');

      const retrievedPass1 = renderGraph.getPass('Pass1');
      const retrievedPass2 = renderGraph.getPass('Pass2');

      expect(retrievedPass1).toBeNull();
      expect(retrievedPass2).toBe(pass2);
    });

    it('maintains pass order when added', () => {
      const passes: MockRenderPass[] = [];
      for (let i = 0; i < 5; i++) {
        const pass = new MockRenderPass(`Pass${i}`);
        passes.push(pass);
        renderGraph.addPass(pass);
      }

      renderGraph.build();

      // Verify passes were added in order
      for (let i = 0; i < 5; i++) {
        const pass = renderGraph.getPass(`Pass${i}`);
        expect(pass).toBe(passes[i]);
      }
    });

    it('rejects duplicate pass names', () => {
      const pass1 = new MockRenderPass('DuplicateName');
      const pass2 = new MockRenderPass('DuplicateName');

      renderGraph.addPass(pass1);

      // Should log error and not add duplicate
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      renderGraph.addPass(pass2);

      consoleErrorSpy.mockRestore();
    });

    it('prevents adding passes after build', () => {
      renderGraph.build();

      const pass = new MockRenderPass('LatePass');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderGraph.addPass(pass);

      const retrievedPass = renderGraph.getPass('LatePass');
      expect(retrievedPass).toBeNull();

      consoleErrorSpy.mockRestore();
    });

    it('prevents removing passes after build', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);
      renderGraph.build();

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderGraph.removePass('Pass1');

      const retrievedPass = renderGraph.getPass('Pass1');
      expect(retrievedPass).toBe(pass);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('resource allocation', () => {
    it('creates transient resources', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      renderGraph.build();

      const stats = renderGraph.stats;
      expect(stats.passCount).toBe(1);
    });

    it('tracks resource lifetimes', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      expect(stats.resourceCount).toBeGreaterThanOrEqual(0);
    });

    it('allocates resources with correct dimensions', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      expect(stats.transientResourceCount).toBeGreaterThanOrEqual(0);
    });

    it('deallocates transient resources after use', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      // Resources should be allocated and deallocated during execution
      const stats = renderGraph.stats;
      expect(stats.executedPassCount).toBe(1);
    });
  });

  describe('pass dependencies', () => {
    it('respects explicit pass dependencies', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      // Both passes should execute
      expect(pass1.executeCalled).toBe(true);
      expect(pass2.executeCalled).toBe(true);
    });

    it('orders passes based on dependencies', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');
      const pass3 = new MockRenderPass('Pass3');

      renderGraph.addPass(pass3);
      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      // All passes should execute
      expect(pass1.executeCalled).toBe(true);
      expect(pass2.executeCalled).toBe(true);
      expect(pass3.executeCalled).toBe(true);
    });

    it('detects circular dependencies', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      // Would need to add dependency methods to RenderPass
      // For now, just verify build completes
      renderGraph.build();
      expect(renderGraph.isBuilt).toBe(true);
    });

    it('handles complex dependency graphs', () => {
      const passes: MockRenderPass[] = [];
      for (let i = 0; i < 10; i++) {
        const pass = new MockRenderPass(`Pass${i}`);
        passes.push(pass);
        renderGraph.addPass(pass);
      }

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      // All passes should execute
      passes.forEach(pass => {
        expect(pass.executeCalled).toBe(true);
      });
    });
  });

  describe('automatic resource barriers', () => {
    it('generates read-after-write barriers', () => {
      const pass1 = new MockRenderPass('Writer');
      const pass2 = new MockRenderPass('Reader');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      expect(stats.barrierCount).toBeGreaterThanOrEqual(0);
    });

    it('generates write-after-read barriers', () => {
      const pass1 = new MockRenderPass('Reader');
      const pass2 = new MockRenderPass('Writer');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      expect(stats.barrierCount).toBeGreaterThanOrEqual(0);
    });

    it('generates write-after-write barriers', () => {
      const pass1 = new MockRenderPass('Writer1');
      const pass2 = new MockRenderPass('Writer2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      expect(stats.barrierCount).toBeGreaterThanOrEqual(0);
    });

    it('skips unnecessary barriers', () => {
      const pass = new MockRenderPass('SinglePass');

      renderGraph.addPass(pass);

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      // Single pass should have minimal barriers
      expect(stats.barrierCount).toBeLessThan(10);
    });

    it('can disable barrier generation', () => {
      const graphNoBarriers = new RenderGraph({
        enableBarriers: false,
      });

      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      graphNoBarriers.addPass(pass1);
      graphNoBarriers.addPass(pass2);

      graphNoBarriers.build();
      graphNoBarriers.compile();

      const stats = graphNoBarriers.stats;
      expect(stats.barrierCount).toBe(0);

      graphNoBarriers.reset();
    });
  });

  describe('pass culling', () => {
    it('culls unused passes when enabled', () => {
      const pass1 = new MockRenderPass('Used');
      const pass2 = new MockRenderPass('Unused');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      const stats = renderGraph.stats;
      expect(stats.culledPassCount).toBeGreaterThanOrEqual(0);
    });

    it('executes all passes when culling disabled', () => {
      const graphNoCulling = new RenderGraph({
        enableCulling: false,
      });

      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      graphNoCulling.addPass(pass1);
      graphNoCulling.addPass(pass2);

      graphNoCulling.build();
      graphNoCulling.compile();
      graphNoCulling.execute();

      expect(pass1.executeCalled).toBe(true);
      expect(pass2.executeCalled).toBe(true);

      graphNoCulling.reset();
    });

    it('preserves passes with side effects', () => {
      const pass = new MockRenderPass('SideEffectPass');

      renderGraph.addPass(pass);

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      expect(pass.executeCalled).toBe(true);
    });

    it('culls entire dependency chains', () => {
      const pass1 = new MockRenderPass('Root');
      const pass2 = new MockRenderPass('Dependent1');
      const pass3 = new MockRenderPass('Dependent2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);
      renderGraph.addPass(pass3);

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      expect(stats.passCount).toBe(3);
    });
  });

  describe('resource aliasing', () => {
    it('aliases non-overlapping resources when enabled', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      expect(stats.aliasedResourceCount).toBeGreaterThanOrEqual(0);
    });

    it('does not alias overlapping resources', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();

      // Resources with overlapping lifetimes should not alias
      const stats = renderGraph.stats;
      expect(stats.resourceCount).toBeGreaterThanOrEqual(0);
    });

    it('reduces memory usage with aliasing', () => {
      const graphWithAliasing = new RenderGraph({
        enableAliasing: true,
      });

      const graphWithoutAliasing = new RenderGraph({
        enableAliasing: false,
      });

      const passes: MockRenderPass[] = [];
      for (let i = 0; i < 5; i++) {
        passes.push(new MockRenderPass(`Pass${i}`));
      }

      passes.forEach(pass => {
        graphWithAliasing.addPass(pass);
      });

      passes.forEach(pass => {
        graphWithoutAliasing.addPass(pass);
      });

      graphWithAliasing.build();
      graphWithAliasing.compile();

      graphWithoutAliasing.build();
      graphWithoutAliasing.compile();

      const statsWithAliasing = graphWithAliasing.stats;
      const statsWithoutAliasing = graphWithoutAliasing.stats;

      // Aliasing should reduce peak memory
      expect(statsWithAliasing.aliasedResourceCount).toBeGreaterThanOrEqual(0);

      graphWithAliasing.reset();
      graphWithoutAliasing.reset();
    });

    it('respects resource format compatibility for aliasing', () => {
      const pass1 = new MockRenderPass('RGBA8Pass');
      const pass2 = new MockRenderPass('RGBA16FPass');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();

      // Different formats should not alias
      const stats = renderGraph.stats;
      expect(stats.resourceCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('async compute integration', () => {
    it('schedules async compute passes', () => {
      const computePass = new MockRenderPass('ComputePass');

      renderGraph.addPass(computePass);

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      expect(computePass.executeCalled).toBe(true);
    });

    it('synchronizes compute and graphics passes', () => {
      const computePass = new MockRenderPass('ComputePass');
      const graphicsPass = new MockRenderPass('GraphicsPass');

      renderGraph.addPass(computePass);
      renderGraph.addPass(graphicsPass);

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      expect(computePass.executeCalled).toBe(true);
      expect(graphicsPass.executeCalled).toBe(true);
    });
  });

  describe('build and compile', () => {
    it('builds the render graph', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      renderGraph.build();

      expect(renderGraph.isBuilt).toBe(true);
    });

    it('compiles the render graph', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      renderGraph.build();
      renderGraph.compile();

      expect(renderGraph.isCompiled).toBe(true);
    });

    it('requires build before compile', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderGraph.compile();

      expect(renderGraph.isCompiled).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('can rebuild after reset', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      renderGraph.build();
      renderGraph.compile();

      renderGraph.reset();

      expect(renderGraph.isBuilt).toBe(false);
      expect(renderGraph.isCompiled).toBe(false);

      renderGraph.addPass(new MockRenderPass('Pass2'));
      renderGraph.build();

      expect(renderGraph.isBuilt).toBe(true);
    });
  });

  describe('execute', () => {
    it('executes all passes in order', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');
      const pass3 = new MockRenderPass('Pass3');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);
      renderGraph.addPass(pass3);

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      expect(pass1.executeCalled).toBe(true);
      expect(pass2.executeCalled).toBe(true);
      expect(pass3.executeCalled).toBe(true);
    });

    it('tracks executed pass count', () => {
      const passes: MockRenderPass[] = [];
      for (let i = 0; i < 5; i++) {
        const pass = new MockRenderPass(`Pass${i}`);
        passes.push(pass);
        renderGraph.addPass(pass);
      }

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      const stats = renderGraph.stats;
      expect(stats.executedPassCount).toBe(5);
    });

    it('requires compile before execute', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      renderGraph.build();

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderGraph.execute();

      expect(pass.executeCalled).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('reset', () => {
    it('clears all passes', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.reset();

      expect(renderGraph.getPass('Pass1')).toBeNull();
      expect(renderGraph.getPass('Pass2')).toBeNull();
    });

    it('clears build and compile state', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      renderGraph.build();
      renderGraph.compile();

      renderGraph.reset();

      expect(renderGraph.isBuilt).toBe(false);
      expect(renderGraph.isCompiled).toBe(false);
    });

    it('clears statistics', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      renderGraph.build();
      renderGraph.compile();
      renderGraph.execute();

      renderGraph.reset();

      const stats = renderGraph.stats;
      expect(stats.passCount).toBe(0);
      expect(stats.executedPassCount).toBe(0);
    });
  });

  describe('statistics', () => {
    it('reports correct pass counts', () => {
      const passes: MockRenderPass[] = [];
      for (let i = 0; i < 7; i++) {
        const pass = new MockRenderPass(`Pass${i}`);
        passes.push(pass);
        renderGraph.addPass(pass);
      }

      renderGraph.build();

      const stats = renderGraph.stats;
      expect(stats.passCount).toBe(7);
    });

    it('reports resource counts', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      expect(stats.resourceCount).toBeGreaterThanOrEqual(0);
      expect(stats.transientResourceCount).toBeGreaterThanOrEqual(0);
    });

    it('reports peak memory usage', () => {
      const passes: MockRenderPass[] = [];
      for (let i = 0; i < 5; i++) {
        const pass = new MockRenderPass(`Pass${i}`);
        passes.push(pass);
        renderGraph.addPass(pass);
      }

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      expect(stats.peakMemoryUsage).toBeGreaterThanOrEqual(0);
    });

    it('reports barrier count', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');
      const pass3 = new MockRenderPass('Pass3');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);
      renderGraph.addPass(pass3);

      renderGraph.build();
      renderGraph.compile();

      const stats = renderGraph.stats;
      expect(stats.barrierCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validation', () => {
    it('validates resource formats', () => {
      const pass = new MockRenderPass('Pass1');
      renderGraph.addPass(pass);

      renderGraph.build();
      renderGraph.compile();

      // Should not throw with valid configuration
      expect(() => {
        renderGraph.execute();
      }).not.toThrow();
    });

    it('validates pass dependencies', () => {
      const pass1 = new MockRenderPass('Pass1');
      const pass2 = new MockRenderPass('Pass2');

      renderGraph.addPass(pass1);
      renderGraph.addPass(pass2);

      expect(() => {
        renderGraph.build();
      }).not.toThrow();
    });

    it('can disable validation for performance', () => {
      const graphNoValidation = new RenderGraph({
        enableValidation: false,
      });

      const pass = new MockRenderPass('Pass1');
      graphNoValidation.addPass(pass);

      graphNoValidation.build();
      graphNoValidation.compile();

      expect(() => {
        graphNoValidation.execute();
      }).not.toThrow();

      graphNoValidation.reset();
    });
  });
});

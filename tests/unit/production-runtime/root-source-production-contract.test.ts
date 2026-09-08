import { afterEach, expect, it, vi } from 'vitest';
import { attachRootRenderSource, getRootRenderSource, hasRootRenderableContent, includeRootSourceMetadata } from '../../../packages/engine/src/production-runtime/RootRenderSourceBridge';
import { Renderer } from '../../../packages/rendering/src/Renderer';
import type { RenderItem } from '../../../packages/rendering/src/ForwardPass';
import { ProductionRuntimeRenderer } from '../../../packages/rendering/src/production-runtime/ProductionRuntimeRenderer';
import { ProductionWebGL2Renderer } from '../../../packages/rendering/src/production-runtime/ProductionWebGL2Renderer';
import type { ProductionRendererInput } from '../../../packages/rendering/src/production-runtime/ProductionRendererTypes';

afterEach(() => vi.restoreAllMocks());

// Unit contract only: actual GPU output remains the Aura Clash application test.
// Keep the real runtime factory, backend dispatch and imported-input validation;
// replace only the final low-level renderer to avoid creating a local browser.
it('creates and submits an attached-only production input through the actual validation wrappers, while rejecting empty input', async () => {
  const canvas = {} as HTMLCanvasElement;
  const geometry = {} as RenderItem['geometry'], material = {} as RenderItem['material'];
  const attachedItems: RenderItem[] = [{ geometry, material }, { geometry, material }];
  const detach = attachRootRenderSource(canvas, { source: { collectRenderItems: () => attachedItems } });
  const renderAsync = vi.fn().mockResolvedValue({ drawCalls: 2 });
  vi.spyOn(Renderer, 'create').mockResolvedValue({ device: { kind: 'webgl2' }, renderAsync, dispose: vi.fn() } as unknown as Renderer);
  vi.spyOn(ProductionWebGL2Renderer.prototype, 'getFeatures').mockReturnValue([]);
  const runtime = await ProductionRuntimeRenderer.create({ canvas, width: 16, height: 16, backend: 'webgl2' });
  try {
    expect(hasRootRenderableContent(canvas, false)).toBe(true);
    const items = [...getRootRenderSource(canvas)!.source.collectRenderItems!()];
    const metadata = includeRootSourceMetadata({ assetId: 'aura-primitives', assetUri: 'aura3d://scene/primitives', meshCount: 0, primitiveCount: 0, materialCount: 0 }, items);
    expect(metadata).toEqual({ assetId: 'production-runtime-attached-source', assetUri: 'aura3d://production-runtime/attached-source', meshCount: 1, primitiveCount: 2, materialCount: 1 });
    const source = { collectRenderItems: () => items };
    await expect(runtime.renderInteractiveFrameAsync({ source, metadata } as unknown as ProductionRendererInput)).resolves.toMatchObject({ diagnostics: { drawCalls: 2 } });
    expect(renderAsync).toHaveBeenCalledExactlyOnceWith(source, undefined);
    const empty = includeRootSourceMetadata({ meshCount: 0, primitiveCount: 0, materialCount: 0 }, []);
    await expect(runtime.renderInteractiveFrameAsync({ source: { collectRenderItems: () => [] }, metadata: empty } as unknown as ProductionRendererInput)).rejects.toThrow('at least one real mesh primitive');
    expect(renderAsync).toHaveBeenCalledTimes(1);
    detach();
    expect(hasRootRenderableContent(canvas, false)).toBe(false);
  } finally { detach(); runtime.dispose(); }
});

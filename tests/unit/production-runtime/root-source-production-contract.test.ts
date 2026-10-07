import { afterEach, expect, it, vi } from 'vitest';
import { attachRootRenderSource, getRootRenderSource, hasRootRenderableContent, includeRootSourceMetadata } from '../../../packages/engine/src/production-runtime/RootRenderSourceBridge';
import { Renderer } from '../../../packages/rendering/src/Renderer';
import type { RenderItem } from '../../../packages/rendering/src/ForwardPass';
import { validateProductionRendererInput } from '../../../packages/rendering/src/production-runtime';
import type { ProductionRendererInput } from '../../../packages/rendering/src/production-runtime/ProductionRendererTypes';

afterEach(() => vi.restoreAllMocks());

// Unit contract only: actual GPU output remains the Aura Clash application test.
// Keep the real runtime factory, backend dispatch and imported-input validation;
// replace only the final low-level renderer to avoid creating a local browser.
// T2.6/T2.9: the ProductionRuntimeRenderer/ProductionWebGL2Renderer wrappers were
// deleted — the bridge validates via `validateProductionRendererInput` and submits
// through `Renderer.render`/`Renderer.renderAsync` directly (see compiler/renderer.ts).
it('creates and submits an attached-only production input through the actual validation wrappers, while rejecting empty input', async () => {
  const canvas = {} as HTMLCanvasElement;
  const geometry = {} as RenderItem['geometry'], material = {} as RenderItem['material'];
  const attachedItems: RenderItem[] = [{ geometry, material }, { geometry, material }];
  const detach = attachRootRenderSource(canvas, { source: { collectRenderItems: () => attachedItems } });
  const renderAsync = vi.fn().mockResolvedValue({ drawCalls: 2 });
  const getFeatures = vi.fn(() => []);
  vi.spyOn(Renderer, 'create').mockResolvedValue({ device: { kind: 'webgl2' }, renderAsync, getFeatures, dispose: vi.fn() } as unknown as Renderer);
  const runtime = await Renderer.create({ canvas, width: 16, height: 16, backend: 'webgl2' });
  const submit = async (input: ProductionRendererInput) => {
    validateProductionRendererInput(input);
    return runtime.renderAsync(input.source, input.camera);
  };
  try {
    expect(hasRootRenderableContent(canvas, false)).toBe(true);
    const items = [...getRootRenderSource(canvas)!.source.collectRenderItems!()];
    const metadata = includeRootSourceMetadata({ assetId: 'aura-primitives', assetUri: 'aura3d://scene/primitives', meshCount: 0, primitiveCount: 0, materialCount: 0 }, items);
    expect(metadata).toEqual({ assetId: 'production-runtime-attached-source', assetUri: 'aura3d://production-runtime/attached-source', meshCount: 1, primitiveCount: 2, materialCount: 1 });
    const source = { collectRenderItems: () => items };
    await expect(submit({ source, metadata } as unknown as ProductionRendererInput)).resolves.toMatchObject({ drawCalls: 2 });
    expect(renderAsync).toHaveBeenCalledExactlyOnceWith(source, undefined);
    const empty = includeRootSourceMetadata({ meshCount: 0, primitiveCount: 0, materialCount: 0 }, []);
    await expect(submit({ source: { collectRenderItems: () => [] }, metadata: empty } as unknown as ProductionRendererInput)).rejects.toThrow('at least one real mesh primitive');
    expect(renderAsync).toHaveBeenCalledTimes(1);
    detach();
    expect(hasRootRenderableContent(canvas, false)).toBe(false);
  } finally { detach(); runtime.dispose(); }
});

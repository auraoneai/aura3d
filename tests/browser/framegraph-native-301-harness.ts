import { DirectionalLight } from '@aura3d/scene';
import { createRenderDevice, Geometry, UnlitMaterial, Texture, TextureBinding, ShadowMap } from '@aura3d/rendering';
import { FrameGraph } from '../../packages/rendering/src/production-runtime/framegraph/FrameGraph';
import { createNativeFrameGraphBindings } from '../../packages/rendering/src/production-runtime/framegraph/NativeFrameGraphBindings';
import { DepthPrepass } from '../../packages/rendering/src/production-runtime/passes/DepthPrepass';
import { ShadowPass } from '../../packages/rendering/src/production-runtime/passes/ShadowPass';
import { SkyboxPass } from '../../packages/rendering/src/production-runtime/passes/SkyboxPass';
import { OpaquePass } from '../../packages/rendering/src/production-runtime/passes/OpaquePass';
import { TransparentPass } from '../../packages/rendering/src/production-runtime/passes/TransparentPass';
import { ToneMappingPass } from '../../packages/rendering/src/production-runtime/passes/ToneMappingPass';

export async function runNativeFrameGraphProof() {
  const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 48;
  document.body.replaceChildren(canvas);
  const device = await createRenderDevice({ backend: 'webgl2', canvas, preserveDrawingBuffer: true });
  const geometry = Geometry.triangle();
  const opaqueMaterial = new UnlitMaterial({ color: [1, 0, 0, 1], renderState: { cullMode: 'none' } });
  const transparentMaterial = new UnlitMaterial({ color: [0, 1, 0, 0.5], renderState: {
    blend: true, depthWrite: false, cullMode: 'none'
  } });
  const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([0, 0, 80, 255]) });
  const shadowMap = new ShadowMap({ size: 48 });
  const light = new DirectionalLight(); light.castsShadow = true;
  const color = device.createRenderTarget({ width: 48, height: 48, depth: true });
  const output = device.createRenderTarget({ width: 48, height: 48 });
  const shadowTarget = device.createRenderTarget({ width: 48, height: 48, depth: true });
  const item = { geometry, material: opaqueMaterial, label: 'r06-opaque' };
  const constructors = [DepthPrepass, ShadowPass, SkyboxPass, OpaquePass, TransparentPass, ToneMappingPass];
  let frameIndex = 0;
  const run = (disabled?: string) => {
    const bindings = createNativeFrameGraphBindings({ frameIndex, colorTarget: color, outputTarget: output,
      geometry: [item], shadow: { light, casters: [item], renderTarget: shadowTarget, shadowMap },
      sky: { projection: 'equirect', texture: new TextureBinding({ name: 'sky', texture }), outputColorSpace: 'linear' },
      opaque: { items: [item], outputColorSpace: 'linear' },
      transparent: { items: [{ geometry, material: transparentMaterial, label: 'r06-transparent' }], outputColorSpace: 'linear' },
      tone: { operator: 'reinhard', gamma: 1 }
    });
    const passes = constructors.map(Type => new Type({ enabled: Type.name !== disabled }));
    const graph = new FrameGraph(); for (const pass of [...passes].reverse()) graph.addPass(pass);
    device.beginFrame(48, 48);
    device.setRenderTarget(output); device.clear([0, 0, 0, 1]);
    let error: string | null = null;
    try { graph.execute({ frameIndex, width: 48, height: 48, device, ...bindings }); }
    catch (caught) { error = String(caught); }
    device.setRenderTarget(output);
    const pixels = Array.from(device.readPixels(0, 0, 48, 48));
    const published = bindings.resources.has('ldr.output');
    const counts = Object.fromEntries(passes.map(pass => [pass.id, pass.executionCount]));
    device.endFrame(); frameIndex++;
    return { disabled: disabled ?? null, error, pixels, published, counts };
  };
  try {
    const enabled = run();
    const controls = constructors.map(Type => run(Type.name));
    const repeat = run();
    const owner = device.kind;
    // Borrowed targets remain alive after successful and failed graphs.
    const borrowedAlive = [color, output, shadowTarget].every(target => !target.disposed);
    return { enabled, controls, repeat, owner, borrowedAlive };
  } finally {
    color.dispose(); output.dispose(); shadowTarget.dispose(); shadowMap.dispose(); texture.dispose();
    opaqueMaterial.dispose(); transparentMaterial.dispose(); geometry.dispose(); device.dispose();
  }
}

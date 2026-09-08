import { DepthPass, type DepthPassOptions } from '../../DepthPass';
import { EnvironmentBackgroundPass, type EnvironmentBackgroundOptions } from '../../EnvironmentBackgroundPass';
import { ForwardPass, type ForwardPassOptions, type RenderItem } from '../../ForwardPass';
import { ToneMappingPass, type ToneMappingPassOptions } from '../../PostProcessPass';
import type { RenderTarget } from '../../RenderDevice';
import type { RenderPass as NativePass, RenderPassContext } from '../../RenderPass';
import { ShadowPass, type ShadowPassOptions } from '../../ShadowPass';
import { toNativeFramegraphToneOperator, type FramegraphToneOperator } from '../passes/ToneMappingPass';
import type { FrameGraphNativeCommand, FrameGraphResource } from './RenderPass';

export interface NativeFrameGraphBindingsOptions {
  readonly frameIndex: number;
  /** Shared color/depth attachment: depth is retained through sky and both forward stages. */
  readonly colorTarget: RenderTarget;
  readonly outputTarget: RenderTarget;
  readonly geometry: readonly RenderItem[];
  readonly shadow: ShadowPassOptions & { readonly renderTarget: RenderTarget };
  readonly sky: EnvironmentBackgroundOptions;
  readonly opaque: ForwardPassOptions;
  readonly transparent: ForwardPassOptions;
  readonly tone?: Omit<ToneMappingPassOptions, 'source' | 'target' | 'operator'> & {
    readonly operator?: FramegraphToneOperator | ToneMappingPassOptions['operator'];
  };
}

interface NativeGeometryInput {
  readonly depth: DepthPassOptions;
  readonly transparent: ForwardPassOptions;
}

interface NativeShadowOutput {
  readonly pass: ShadowPass;
  readonly lightMatrix: Float32Array | readonly number[];
}

function assertBorrowedShadowTarget(shadow: NativeFrameGraphBindingsOptions['shadow']): void {
  if (shadow.renderTarget.disposed || shadow.shadowMap?.texture.disposed) {
    throw new Error('Native framegraph shadow resources are disposed; caller must replace them.');
  }
  if (!shadow.shadowMap || shadow.renderTarget.width !== shadow.shadowMap.size ||
      shadow.renderTarget.height !== shadow.shadowMap.size) {
    throw new Error('Native framegraph shadow target must match the borrowed shadow map size.');
  }
}

/** Bind compatibility stages to existing native passes. Owns no device or target.
 * The caller begins/ends the frame and allocates/resizes/disposes all targets.
 * Recreate these inexpensive bindings for each frame; shaders remain in native caches.
 */
export function createNativeFrameGraphBindings(options: NativeFrameGraphBindingsOptions): {
  resources: Map<string, FrameGraphResource>;
  commands: ReadonlyMap<string, FrameGraphNativeCommand>;
} {
  const { frameIndex, colorTarget, outputTarget } = options;
  if (colorTarget === outputTarget) throw new Error('Tone mapping requires separate source and output targets.');
  assertBorrowedShadowTarget(options.shadow);
  const resource = <T>(value: T): FrameGraphResource<T> => ({ value, frameIndex });
  const targetResource = (value: RenderTarget): FrameGraphResource<RenderTarget> => ({
    value, frameIndex, width: value.width, height: value.height
  });
  const native = (name: string, execute: (context: RenderPassContext) => void): NativePass => ({
    name, reads: [], writes: [], execute
  });
  const resources = new Map<string, FrameGraphResource>([
    ['scene.geometry', resource<NativeGeometryInput>({ depth: { casters: options.geometry,
      viewProjectionMatrix: options.opaque.cameraViewProjectionMatrix, shaderLibrary: options.opaque.shaderLibrary },
      transparent: options.transparent })],
    ['scene.casters', resource(options.shadow.casters)],
    ['shadow.maps', resource(options.shadow)],
    ['environment.sky', resource(options.sky)],
    ['environment.lighting', resource(options.opaque)]
  ]);
  const commands = new Map<string, FrameGraphNativeCommand>();
  commands.set('DepthPrepass', bindings => {
    const depth = bindings.read<NativeGeometryInput>('scene.geometry').depth;
    const target = bindings.write('linear-depth', targetResource(colorTarget));
    const pass = new DepthPass(depth);
    return native('native-framegraph-depth', context => {
      context.device.setRenderTarget(target);
      (context.device.clearRenderTarget ?? context.device.clear).call(context.device, [0, 0, 0, 1]);
      pass.execute(context);
    });
  });
  commands.set('ShadowPass', bindings => {
    const casters = bindings.read<readonly RenderItem[]>('scene.casters');
    const shadow = bindings.read<NativeFrameGraphBindingsOptions['shadow']>('shadow.maps');
    assertBorrowedShadowTarget(shadow);
    const pass = new ShadowPass({ ...shadow, casters });
    // The native pass exposes its sampled shadow texture only after successful drawing.
    bindings.write('shadow.mask', resource<NativeShadowOutput>({ pass, lightMatrix: shadow.viewProjectionMatrix ??
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }));
    return native('native-framegraph-shadow', context => {
      assertBorrowedShadowTarget(shadow);
      const result = pass.execute(context);
      if (!result.rendered) throw new Error(`Native framegraph shadow stage did not render: ${result.reason}.`);
    });
  });
  commands.set('SkyboxPass', bindings => {
    const sky = bindings.read<EnvironmentBackgroundOptions>('environment.sky');
    const target = bindings.write('hdr.color', targetResource(colorTarget));
    return native('native-framegraph-sky', context => {
      context.device.setRenderTarget(target);
      new EnvironmentBackgroundPass(sky).execute(context);
    });
  });
  commands.set('OpaquePass', bindings => {
    const depth = bindings.read<RenderTarget>('linear-depth');
    const shadow = bindings.read<NativeShadowOutput>('shadow.mask');
    const forward = bindings.read<ForwardPassOptions>('environment.lighting');
    const color = bindings.read<RenderTarget>('hdr.color');
    if (depth !== color) throw new Error('Native framegraph opaque color must retain the prepass depth attachment.');
    bindings.write('hdr.color', targetResource(color));
    return native('native-framegraph-opaque', context => {
      const shadowMap = shadow.pass.getForwardShadowMap({ lightMatrix: shadow.lightMatrix });
      if (!shadowMap) throw new Error('Native framegraph opaque stage requires rendered shadow texture.');
      context.device.setRenderTarget(color);
      new ForwardPass({ ...forward, shadowMap }).execute(context);
    });
  });
  commands.set('TransparentPass', bindings => {
    const geometry = bindings.read<NativeGeometryInput>('scene.geometry');
    const color = bindings.read<RenderTarget>('hdr.color');
    const depth = bindings.read<RenderTarget>('linear-depth');
    if (color !== depth) throw new Error('Native framegraph transparent color must retain the prepass depth attachment.');
    bindings.write('hdr.color', targetResource(color));
    return native('native-framegraph-transparent', context => {
      context.device.setRenderTarget(color);
      new ForwardPass(geometry.transparent).execute(context);
    });
  });
  commands.set('ToneMappingPass', bindings => new ToneMappingPass({
    ...options.tone,
    operator: toNativeFramegraphToneOperator(options.tone?.operator ?? 'aces-filmic'),
    source: bindings.read<RenderTarget>('hdr.color'),
    target: bindings.write('ldr.output', targetResource(outputTarget))
  }));
  return { resources, commands };
}

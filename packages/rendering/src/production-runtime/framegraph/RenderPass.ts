import type { RenderDevice } from '../../RenderDevice';
import type { RenderPass as NativeRenderPass } from '../../RenderPass';

export type RenderPassKind = 'depth' | 'shadow' | 'opaque' | 'transparent' | 'skybox' | 'postprocess';

/** Borrowed resources: the canonical renderer owns allocation, resize and disposal. */
export interface FrameGraphResource<T = unknown> {
  readonly value: T;
  readonly frameIndex: number;
  readonly width?: number;
  readonly height?: number;
}

export interface FrameGraphPassResources {
  read<T = unknown>(name: string): T;
  write<T>(name: string, resource: FrameGraphResource<T>): T;
}

/** Create an existing native pass with the exact resolved source/target handles. */
export type FrameGraphNativeCommand = (resources: FrameGraphPassResources) => NativeRenderPass;

export interface RenderPassExecutionContext {
  readonly frameIndex: number;
  readonly width: number;
  readonly height: number;
  /** Required when executing an enabled compatibility pass. Never creates another device. */
  readonly device?: RenderDevice;
  readonly resources?: Map<string, FrameGraphResource>;
  readonly commands?: ReadonlyMap<string, FrameGraphNativeCommand>;
}

export interface RenderPass {
  readonly id: string;
  readonly kind: RenderPassKind;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly enabled?: boolean;
  execute?(context: RenderPassExecutionContext): void;
}

export function assertValidPassContext(passId: string, context: RenderPassExecutionContext): void {
  if (!Number.isInteger(context.frameIndex) || context.frameIndex < 0) {
    throw new RangeError(`${passId} requires a non-negative integer frameIndex.`);
  }
  for (const dimension of ['width', 'height'] as const) {
    if (!Number.isInteger(context[dimension]) || context[dimension] <= 0) {
      throw new RangeError(`${passId} requires a positive integer ${dimension}.`);
    }
  }
}

/** Dispatch only after all declared handles have been resolved and validated. */
export function executeNativePass(pass: RenderPass, context: RenderPassExecutionContext): void {
  try {
    executeNativePassImpl(pass, context);
  } catch (error) {
    // Binding failures are failures too; never expose earlier/partially-written output.
    for (const name of pass.writes) context.resources?.delete(name);
    throw error;
  }
}

function executeNativePassImpl(pass: RenderPass, context: RenderPassExecutionContext): void {
  const { device, resources, commands } = context;
  const createCommand = commands?.get(pass.id);
  if (!device || !resources || !createCommand) {
    throw new Error(`${pass.id} requires a native device, resources and command binding.`);
  }
  if (device.disposed) throw new Error(`${pass.id} cannot execute on a disposed device.`);
  const readNames = new Set<string>();
  const outputs = new Map<string, FrameGraphResource>();
  const validate = (name: string, resource: FrameGraphResource | undefined): FrameGraphResource => {
    if (!resource) throw new Error(`${pass.id} missing resource: ${name}.`);
    if (resource.frameIndex !== context.frameIndex) throw new Error(`${pass.id} stale resource: ${name}.`);
    if ((resource.width !== undefined && resource.width !== context.width) ||
        (resource.height !== undefined && resource.height !== context.height)) {
      throw new Error(`${pass.id} resource size mismatch: ${name}.`);
    }
    const value = resource.value;
    if (value && typeof value === 'object' && 'disposed' in value && value.disposed) {
      throw new Error(`${pass.id} disposed resource: ${name}.`);
    }
    return resource;
  };
  for (const name of pass.reads) validate(name, resources.get(name));
  const command = createCommand({
    read<T>(name: string): T {
      if (!pass.reads.includes(name)) throw new Error(`${pass.id} undeclared read: ${name}.`);
      readNames.add(name);
      return validate(name, resources.get(name)).value as T;
    },
    write<T>(name: string, resource: FrameGraphResource<T>): T {
      if (!pass.writes.includes(name)) throw new Error(`${pass.id} undeclared write: ${name}.`);
      if (outputs.has(name)) throw new Error(`${pass.id} duplicate output binding: ${name}.`);
      outputs.set(name, validate(name, resource));
      return resource.value;
    }
  });
  for (const name of pass.reads) {
    if (!readNames.has(name)) throw new Error(`${pass.id} did not consume declared resource: ${name}.`);
  }
  for (const name of pass.writes) {
    if (!outputs.has(name)) throw new Error(`${pass.id} did not bind declared output: ${name}.`);
  }
  if (!command || typeof command.execute !== 'function') throw new Error(`${pass.id} requires an executable native pass.`);
  try {
    command.execute({ device, width: context.width, height: context.height });
    // Publish only after successful execution. A failed command must not expose partial output.
    for (const [name, resource] of outputs) resources.set(name, resource);
  } catch (error) {
    for (const name of pass.writes) resources.delete(name);
    throw error;
  }
}

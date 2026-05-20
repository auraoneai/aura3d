import type { RenderablePrimitive } from './RenderablePrimitive';
export interface RenderableMesh { readonly id: string; readonly name: string; readonly primitives: readonly RenderablePrimitive[]; readonly worldMatrix?: readonly number[]; }

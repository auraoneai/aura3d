// PR 0b-2 seam (CONTRACTS.md §3.3) — velocity-MRT uniform binding hook (C-14),
// owned by PRD 03. No-op until PRD 03 registers a binder; the ForwardPass calls
// `bindVelocityUniforms?.(item, uniforms)` once per draw.

import type { RenderItem } from "../contracts/renderItem.js";
import type { UniformValue } from "../RenderDevice.js";

export type VelocityUniformBinder = (item: RenderItem, uniforms: Map<string, UniformValue>) => void;

export let bindVelocityUniforms: VelocityUniformBinder | undefined;

/** Called once from the PRD 03 lane barrel when the real binder exists. */
export function setVelocityUniformBinder(binder: VelocityUniformBinder | undefined): void {
  bindVelocityUniforms = binder;
}

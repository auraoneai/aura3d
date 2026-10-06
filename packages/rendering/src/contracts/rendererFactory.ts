/**
 * C-29 — renderer factory, backends, frame API, device lifecycle (CONTRACTS.md).
 * Provider: PRD 11. Flag: A3D_QR_WEBGPU for backend selection; lifecycle itself is flag-free.
 */

import type { RenderDevice, RenderDeviceDiagnostics } from "../RenderDevice";
import { defineContractSlot, type ContractSlot } from "./core";

export interface RendererCreateOptions { readonly canvas: HTMLCanvasElement | OffscreenCanvas; readonly width?: number; readonly height?: number; readonly backend?: "webgl2" | "webgpu" | "auto"; readonly antialias?: boolean; readonly powerPreference?: "default" | "high-performance" | "low-power"; readonly errorCheckMode?: "off" | "frame" | "draw"; }
export interface RendererFrameResult { readonly backend: "webgl2" | "webgpu"; readonly diagnostics: RenderDeviceDiagnostics; readonly timing: { readonly cpuMs: number; readonly gpuMs: number | null }; }
export interface RendererLifecycle { onDeviceLost(l: () => void): () => void; onDeviceRestored(l: () => void): () => void; isDeviceLost(): boolean; }
// Renderer additions (PR 0b delegating stubs): static create(options: RendererCreateOptions): Promise<Renderer>; readonly backend: "webgl2" | "webgpu";
//   renderFrame(frame: RendererInput): RendererFrameResult; renderFrameAsync(frame: RendererInput): Promise<RendererFrameResult>; + RendererLifecycle
export interface ResourceRegistryLike { register<T extends object>(handle: T, descriptor: { readonly kind: string; readonly rebuild: () => Promise<void> | void }): T; unregister(handle: object): void; rebuild(device: RenderDevice): Promise<{ readonly rebuilt: number; readonly refetched: number; readonly failed: readonly string[] }>; }

/** PR 0a stub: records registrations; rebuild invokes each registered rebuild. */
class StubResourceRegistry implements ResourceRegistryLike {
  private readonly entries = new Map<object, { readonly kind: string; readonly rebuild: () => Promise<void> | void }>();

  register<T extends object>(handle: T, descriptor: { readonly kind: string; readonly rebuild: () => Promise<void> | void }): T {
    this.entries.set(handle, descriptor);
    return handle;
  }

  unregister(handle: object): void {
    this.entries.delete(handle);
  }

  async rebuild(_device: RenderDevice): Promise<{ readonly rebuilt: number; readonly refetched: number; readonly failed: readonly string[] }> {
    let rebuilt = 0;
    const failed: string[] = [];
    for (const descriptor of this.entries.values()) {
      try {
        await descriptor.rebuild();
        rebuilt += 1;
      } catch {
        failed.push(descriptor.kind);
      }
    }
    return { rebuilt, refetched: 0, failed };
  }
}

export const resourceRegistrySlot: ContractSlot<() => ResourceRegistryLike> =
  defineContractSlot("C-29", "prd11", "A3D_QR_WEBGPU", () => new StubResourceRegistry());

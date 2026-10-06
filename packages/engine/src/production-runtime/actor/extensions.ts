// PR 0b-3 seam (CONTRACTS.md §3.6) — TypedGLBActor extension registry. Custodian: lane 15.
// File: packages/engine/src/production-runtime/actor/extensions.ts
//
// Lanes register behaviour against createTypedGLBActor without editing the hot file:
// onLoad runs once per actor after the pipeline load, collectRenderItems transforms the
// per-frame item list in registration order, dispose runs before pipeline.dispose.
// Extensions carrying a flag are inactive while the flag is off, so a registered
// extension alone changes nothing.

import type { RenderItem } from "@aura3d/rendering";
import type { ProductionGLTFRenderPipeline } from "@aura3d/assets/gltf-runtime";
import type { TypedGLBActor } from "../TypedGLBActor";
import type { QrFlagName, QrFlags } from "@aura3d/rendering/contracts";

export interface TypedGLBActorExtension {
  /** Unique extension id, `<lane>.<slug>` (e.g. "prd05.typed-glb-actor-lod"). */
  readonly id: string;
  /** Owning lane, e.g. "prd05". */
  readonly owner: string;
  /** QrFlag name gating the extension (registry default: all flags off). Omit for always-on. */
  readonly flag?: QrFlagName;
  /** Ordering hint; lower runs earlier. Ties break on id. */
  readonly order?: number;
  onLoad?(actor: TypedGLBActor, pipeline: ProductionGLTFRenderPipeline): void;
  collectRenderItems?(actor: TypedGLBActor, items: readonly RenderItem[]): RenderItem[];
  dispose?(actor: TypedGLBActor): void;
}

const EMPTY_QR_FLAGS: QrFlags = { values: {}, on: () => false };

let currentQrFlags: QrFlags = EMPTY_QR_FLAGS;

/** Engine-side wiring: set once flags resolve (createAuraApp / createGameApp). */
export function setTypedGLBActorQrFlags(flags: QrFlags): void {
  currentQrFlags = flags;
}

export function typedGLBActorQrFlags(): QrFlags {
  return currentQrFlags;
}

const extensions: TypedGLBActorExtension[] = [];

export function registerTypedGLBActorExtension(extension: TypedGLBActorExtension): () => void {
  if (extensions.some((entry) => entry.id === extension.id)) {
    throw new Error(`TYPED_GLB_ACTOR_EXTENSION_DUPLICATE:${extension.id}`);
  }
  extensions.push(extension);
  extensions.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  return () => {
    const index = extensions.indexOf(extension);
    if (index >= 0) extensions.splice(index, 1);
  };
}

/** Flag-active extensions in deterministic order. */
export function typedGLBActorExtensions(flags: QrFlags = currentQrFlags): readonly TypedGLBActorExtension[] {
  return extensions.filter((extension) => !extension.flag || flags.on(extension.flag));
}

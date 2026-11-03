import type { RenderDevice, RenderItem, RenderSource } from "@aura3d/rendering";
import { AuraAdvancedLightingUnavailableError } from "../../contracts/lighting.js";
import { advancedLightingStateFor, type AdvancedIndirectBinding, type AdvancedLightmapBinding, type AdvancedLightingSnapshotTicket } from "../app/advancedLightingState.js";
import { ADVANCED_LIGHTING_BINDING, advancedLightingItemBinding, stampAdvancedLightingBinding,
  type AdvancedLightingFrame, type AdvancedLightingSource } from "@aura3d/rendering/lighting";
import { prd02ItemIrradianceBindings } from "@aura3d/rendering";

/** Authored node identity is kept out of userData and normal batching keys. */
export interface AdvancedLightingOrigin {
  readonly name?: string;
  readonly runtime?: { readonly id: string };
}

const origins = new WeakMap<RenderItem, AdvancedLightingOrigin>();

/** Called on the submitted, unoptimized item by the production scene compiler. */
export function withAdvancedLightingOrigin<T extends RenderItem>(item: T, node: AdvancedLightingOrigin): T {
  origins.set(item, node);
  return item;
}

/** The renderer recognizes this carrier without importing engine code. */
export const ADVANCED_LIGHTING_PREPARE_FRAME = Symbol.for("a3d.advancedLighting.prepareFrame");
export type AdvancedLightingPrepareFrame = (
  items: readonly RenderItem[], frame: AdvancedLightingFrame, stage: "before-batching" | "after-collect",
  beforeCollect?: readonly RenderItem[]
) => readonly RenderItem[];

export interface AdvancedLightingBridgeOptions {
  /** The app's node registry, which is distinct from the renderer's view scope. */
  readonly owner: object;
  readonly device: RenderDevice;
  /** Count matching declared renderable nodes, including currently invisible ones. */
  readonly targetCount: (name: string) => number;
  /** Check the active generator, flags, backend and other renderer-specific limits. */
  readonly assertSupported: (kind: AdvancedLightingSource["kind"], item?: RenderItem) => void;
}

export interface AdvancedLightingBridge {
  /** Call once per production input, before the probe capture uses the source. */
  wrapSource<T extends RenderSource>(source: T): T;
  /** Unregister this mount; attached textures remain owned by their callers. */
  dispose(): void;
}

const physicalShaderKeys = new Set([
  "aura3d/pbr-direct", "aura3d/instanced-pbr", "aura3d/pbr-textured", "aura3d/pbr-normal-map",
  "aura3d/skinned-lit", "aura3d/skinned-lit-8"
]);

function invalid(message: string): never { throw new Error(`ADVANCED_LIGHTING_UNSUPPORTED: ${message}`); }

function assertPhysicalItem(item: RenderItem, lightmap?: AdvancedLightmapBinding): void {
  const material = item.material;
  const base = material && "baseMaterial" in material ? material.baseMaterial : material;
  if (!base || base.disposed || !physicalShaderKeys.has(base.shaderKey)) {
    invalid("the draw requires a supported lit physical material");
  }
  if (item.geometry.topology !== "triangles" || !item.geometry.vertexBuffer.format.hasAttribute("normal")) {
    invalid("the draw requires triangle geometry with normals");
  }
  if (lightmap) {
    const semantic = lightmap.lightmap.uvChannel === 0 ? "uv" : "uv1";
    const format = item.geometry.vertexBuffer.format;
    if (!format.hasAttribute(semantic)) invalid(`the lightmap target has no ${semantic} coordinates`);
    const attribute = format.getAttribute(semantic);
    if (attribute.components !== 2 || attribute.integer || attribute.shaderLocation !== (semantic === "uv" ? 2 : 7)) {
      invalid(`the lightmap target has an unsupported ${semantic} attribute`);
    }
  }
}

/**
 * Connect one mounted app to the renderer's forward path. A renderer must
 * supply the real capability check; a source carrier alone is not a consumer.
 */
export function createAdvancedLightingBridge(options: AdvancedLightingBridgeOptions): AdvancedLightingBridge {
  if (!options?.owner || !options.device || typeof options.targetCount !== "function" || typeof options.assertSupported !== "function") {
    throw new TypeError("advanced lighting bridge requires an owner, device, target resolver and renderer capability check");
  }
  const { owner, device } = options;
  const state = advancedLightingStateFor(owner);
  let disposed = false;

  const assertAvailable = (kind: AdvancedLightingSource["kind"], item?: RenderItem): void => {
    if (disposed || device.disposed || device.contextLost) throw new AuraAdvancedLightingUnavailableError();
    if (device.kind !== "webgl2" && device.kind !== "webgpu" && device.kind !== "mock") invalid(`the ${device.kind} backend has no advanced lighting draw path`);
    options.assertSupported(kind, item);
  };
  const assertTarget = (binding: AdvancedLightmapBinding): void => {
    const count = options.targetCount(binding.nodeName);
    if (!Number.isSafeInteger(count) || count !== 1) invalid(`lightmap target ${JSON.stringify(binding.nodeName)} must name exactly one scene node`);
    if (binding.lightmap.provenance.hasAuthoredLights) invalid("bakes containing authored ambient or direct lights are not supported");
  };
  const consumer = {
    validateIndirect(binding: AdvancedIndirectBinding): void {
      assertAvailable(binding.kind);
      if (state.hasLightmaps()) invalid("a lightmap and global indirect source cannot be combined");
      const maxProbeAxis = device.kind === "webgpu" ? 32 : 16;
      if (binding.kind === "probe-grid" && binding.source.grid.dimensions.some((dimension) => dimension > maxProbeAxis)) {
        invalid(`probe grid exceeds the ${device.kind} axis limit`);
      }
    },
    validateLightmap(binding: AdvancedLightmapBinding): void {
      assertAvailable("lightmap");
      if (state.hasIndirect()) invalid("a lightmap and global indirect source cannot be combined");
      assertTarget(binding);
    }
  };
  const uninstall = state.installConsumer(consumer);

  const sourceForIndirect = (ticket: AdvancedLightingSnapshotTicket): AdvancedLightingSource | undefined => {
    const indirect = ticket.snapshot.indirect;
    if (!indirect) return undefined;
    return indirect.kind === "probe-grid"
      ? { kind: "probe-grid", data: indirect.data, ...indirect.options, assertCurrent: ticket.assertCurrent }
      : { kind: "voxel", data: indirect.data, ...indirect.options, assertCurrent: ticket.assertCurrent };
  };

  const prepareFrame: AdvancedLightingPrepareFrame = (items, frame, stage, beforeCollect) => {
    if (frame.device !== device) invalid("the frame belongs to a different device");
    if (stage === "before-batching") {
      const ticket = state.captureSnapshot();
      const indirect = sourceForIndirect(ticket);
      const maps = new Map(ticket.snapshot.lightmaps.map((binding) => [binding.nodeName, binding]));
      const seen = new Map<string, number>();
      return items.map((item) => {
        const name = origins.get(item)?.name;
        const lightmap = name === undefined ? undefined : maps.get(name);
        if (!indirect && !lightmap) return item;
        const source: AdvancedLightingSource = indirect ?? {
          kind: "lightmap", data: lightmap!.lightmap, intensity: lightmap!.options.intensity,
          composition: lightmap!.options.composition, assertCurrent: ticket.assertCurrent
        };
        if (lightmap) {
          const count = (seen.get(lightmap.nodeName) ?? 0) + 1;
          seen.set(lightmap.nodeName, count);
          if (count > 1) invalid(`lightmap target ${JSON.stringify(lightmap.nodeName)} emits multiple draw items`);
        }
        assertAvailable(source.kind, item);
        assertPhysicalItem(item, lightmap);
        return stampAdvancedLightingBinding(item, frame, source);
      });
    }
    if (stage !== "after-collect" || !beforeCollect) invalid("renderer did not provide the pre-contributor item list");
    const packets = (list: readonly RenderItem[]): Map<unknown, number> => {
      const counts = new Map<unknown, number>();
      for (const item of list) {
        const packet = (item as RenderItem & { readonly [ADVANCED_LIGHTING_BINDING]?: unknown })[ADVANCED_LIGHTING_BINDING];
        if (packet) counts.set(packet, (counts.get(packet) ?? 0) + 1);
      }
      return counts;
    };
    const previous = packets(beforeCollect), current = packets(items);
    if (previous.size !== current.size || [...previous].some(([packet, count]) => current.get(packet) !== count)) {
      invalid("a frame contributor removed or replaced an advanced lighting binding");
    }
    for (const item of items) {
      const binding = advancedLightingItemBinding(item, frame, { deferLightmapContentCheck: true });
      if (binding && prd02ItemIrradianceBindings(item, device)) invalid("a PRD02 irradiance volume conflicts with advanced diffuse lighting");
      if (!binding && state.hasIndirect()) invalid("a frame contributor added an item without the global indirect binding");
    }
    return items;
  };

  return {
    wrapSource<T extends RenderSource>(source: T): T {
      if (disposed) throw new AuraAdvancedLightingUnavailableError();
      return state.hasIndirect() || state.hasLightmaps() ? { ...source, [ADVANCED_LIGHTING_PREPARE_FRAME]: prepareFrame } : source;
    },
    dispose(): void { if (!disposed) { disposed = true; uninstall(); } }
  };
}

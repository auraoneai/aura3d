/**
 * threejs-parity AD-15 (P2): per-mount runtime for `lights.lensFlare` nodes.
 *
 * Chained after `paritySurfaces.prepare` in `compiler/renderer.ts`. Each frame
 * it projects every flare's light through the resolved camera, applies three's
 * `Lensflare` element placement (`nodes/lensFlare.ts`), and appends one
 * camera-facing additive sprite per element to the frame's render items. The
 * sprites ride the L6 sprite path (`UnlitMaterial` `spriteMode`,
 * `sizeAttenuation: false`), so they need `A3D_PARITY_LINES` (default-on).
 */

import type { RenderItem, RenderSource } from "@aura3d/rendering";
import { Geometry, TextureBinding, UnlitMaterial, createSpriteQuadGeometry } from "@aura3d/rendering";
import type { AuraRuntimeNodeRegistry, AuraSceneNode, AuraSceneSnapshot, AuraVec3 } from "../nodes/types.js";
import { groups } from "../nodes/groups.js";
import { colorToLinearRgba } from "../colorUtils.js";
import { resolveCameraFrame } from "./camera.js";
import { resolveCameraClipping } from "../RootRuntimeSupport.js";
import { auraTextureRefTexture, texture } from "../nodes/texture.js";
import { AuraRuntimeError } from "./errors.js";
import {
  MAX_LENS_FLARE_ELEMENTS,
  assertAuraLensFlareElements,
  assertAuraLensFlareNode,
  isAuraLensFlareNode,
  lensFlareSpriteTransform,
  lensFlareVisibility,
  placeLensFlareElements,
  projectLensFlareSource,
  type AuraLensFlareElement,
  type AuraLensFlareNode
} from "../nodes/lensFlare.js";

export interface ProductionLensFlares {
  /** Returns `source` unchanged when the scene has no lens flares. */
  prepare(
    source: RenderSource,
    snapshot: AuraSceneSnapshot,
    runtimeNodes: AuraRuntimeNodeRegistry | undefined,
    time: number,
    aspect: number,
    viewportHeightPx: number
  ): RenderSource;
  dispose(): void;
}

const GLOW_SIZE = 64;
/** Includes hidden/off-screen flares, so becoming visible cannot exceed the frame budget. */
export const MAX_LENS_FLARE_SCENE_ELEMENTS = 1024;
export const MAX_LENS_FLARE_GLOW_SIZE = 1024;

/** Soft radial glow: white RGB, alpha falling off smoothly from the centre. */
export function createLensFlareGlowPixels(size = GLOW_SIZE): Uint8Array {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_LENS_FLARE_GLOW_SIZE) {
    throw new AuraRuntimeError("invalid-lens-flare", `lights.lensFlare: glow pixel size must be an integer in [1, ${MAX_LENS_FLARE_GLOW_SIZE}]`);
  }
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = half === 0 ? 0 : Math.min(1, Math.hypot(x - half, y - half) / half);
      const falloff = (1 - r) * (1 - r) * (3 - 2 * (1 - r)); // smoothstep(1 - r)^~2
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(255 * falloff);
    }
  }
  return data;
}

interface ElementRecord {
  readonly material: UnlitMaterial;
  texture: AuraLensFlareElement["texture"];
  binding: TextureBinding;
}

interface PreparedFlare {
  readonly node: AuraLensFlareNode;
  readonly elements: readonly AuraLensFlareElement[];
}

const flareKey = (node: AuraLensFlareNode): string => node.runtime?.id ?? node.name ?? "lens flare";

function resolveSourcePosition(
  node: AuraLensFlareNode,
  flattened: readonly AuraSceneNode[],
  runtimeNodes: AuraRuntimeNodeRegistry | undefined,
  warn: (message: string) => void
): AuraVec3 | undefined {
  if (node.light !== undefined) {
    const light = flattened.find((candidate) => candidate.kind === "light" && candidate.name === node.light);
    if (!light) {
      warn(`lens flare "${flareKey(node)}": no light node named "${node.light}"; flare skipped`);
      return undefined;
    }
    const id = (light as { runtime?: { id?: string } }).runtime?.id;
    const handle = id ? runtimeNodes?.get(id) : undefined;
    return (handle?.position ?? (light as { position?: AuraVec3 }).position ?? [0, 0, 0]) as AuraVec3;
  }
  const id = node.runtime?.id;
  const handle = id ? runtimeNodes?.get(id) : undefined;
  return (handle?.position ?? node.position ?? [0, 0, 0]) as AuraVec3;
}

export function createProductionLensFlares(warn: (message: string) => void): ProductionLensFlares {
  let disposed = false;
  let disposing = false;
  let preparing = false;
  const preparationCancelled = Symbol("lens flare preparation cancelled");
  let quad: Geometry | undefined;
  let glow: { readonly binding: TextureBinding; dispose(): void } | undefined;
  // Use occurrence slots, not names: multiple flares may have the same name.
  const records = new Map<number, ElementRecord[]>();
  const userBindings = new Map<object, TextureBinding>();

  const ensureGlow = (): TextureBinding => {
    if (!glow) {
      const handle = texture.data({ width: GLOW_SIZE, height: GLOW_SIZE, data: createLensFlareGlowPixels(), format: "rgba8", colorSpace: "srgb" });
      try {
        const backing = auraTextureRefTexture(handle);
        if (!backing) throw new Error("lens flare glow texture failed to resolve");
        glow = { binding: new TextureBinding({ name: "u_baseColorMap", texture: backing }), dispose: () => handle.dispose() };
      } catch (error) {
        handle.dispose();
        throw error;
      }
    }
    return glow.binding;
  };

  const bindingFor = (ref: AuraLensFlareNode["elements"][number]["texture"]): TextureBinding => {
    if (!ref) return ensureGlow();
    const cached = userBindings.get(ref);
    if (cached && !cached.texture?.disposed) return cached;
    const backing = auraTextureRefTexture(ref);
    if (!backing) {
      userBindings.delete(ref);
      warn(`lens flare element texture "${ref.id}" has no live backing; using the default glow`);
      if (disposed) throw preparationCancelled;
      return ensureGlow();
    }
    const binding = new TextureBinding({ name: "u_baseColorMap", texture: backing });
    userBindings.set(ref, binding);
    return binding;
  };

  const ensureElements = (flare: PreparedFlare, slot: number): ElementRecord[] => {
    const list = records.get(slot) ?? [];
    const previousLength = list.length;
    try {
      for (let index = 0; index < flare.elements.length; index += 1) {
        const element = flare.elements[index]!;
        const existing = list[index];
        if (existing) {
          if (existing.texture !== element.texture || existing.binding.texture?.disposed) {
            const binding = bindingFor(element.texture);
            existing.material.setParameter("u_baseColorTexture", binding);
            existing.texture = element.texture;
            existing.binding = binding;
          }
          continue;
        }
        const material = new UnlitMaterial({
          name: `${flareKey(flare.node)} flare element ${index}`,
          color: [1, 1, 1, 1],
          spriteMode: true,
          spriteSizeAttenuation: false,
          renderState: { blend: true, blendMode: "additive", depthTest: false, depthWrite: false }
        });
        try {
          const binding = bindingFor(element.texture);
          material.setParameter("u_baseColorTexture", binding);
          list.push({ material, texture: element.texture, binding });
        } catch (error) {
          material.dispose();
          throw error;
        }
      }
      records.set(slot, list);
      return list;
    } catch (error) {
      // Keep the old records usable, but do not retain a partially built suffix.
      while (list.length > previousLength) list.pop()!.material.dispose();
      throw error;
    }
  };

  return {
    prepare(source, snapshot, runtimeNodes, time, aspect, viewportHeightPx) {
      if (disposed) return source;
      if (preparing) throw new Error("lens flare runtime cannot prepare recursively");
      preparing = true;
      try {
        const flattened = groups.flatten(snapshot.nodes);
        const flares: PreparedFlare[] = [];
        const activeTextures = new Set<object>();
        let elementCount = 0;
        // Validate all nodes, including invisible ones, before creating any flare
        // material, geometry, glow texture, or render item. Snapshot the bounded
        // elements so callbacks during preparation cannot enlarge the frame.
        for (const node of flattened) {
          if (!isAuraLensFlareNode(node)) continue;
          const authored = assertAuraLensFlareNode(node);
          const count = authored.length;
          if (!Number.isSafeInteger(count) || count < 1 || count > MAX_LENS_FLARE_ELEMENTS) {
            throw new AuraRuntimeError("invalid-lens-flare", `lights.lensFlare: \`elements\` must contain between 1 and ${MAX_LENS_FLARE_ELEMENTS} entries`);
          }
          elementCount += count;
          if (elementCount > MAX_LENS_FLARE_SCENE_ELEMENTS) {
            throw new AuraRuntimeError("invalid-lens-flare", `lights.lensFlare: scene must contain at most ${MAX_LENS_FLARE_SCENE_ELEMENTS} elements in total`);
          }
          const elements: AuraLensFlareElement[] = [];
          for (let index = 0; index < count; index += 1) {
            const element = authored[index]!;
            elements.push({ size: element.size, distance: element.distance, color: element.color, texture: element.texture });
          }
          assertAuraLensFlareElements(elements);
          for (const element of elements) if (element.texture) activeTextures.add(element.texture);
          flares.push({ node, elements });
        }
        if (disposed) return source;

        for (const ref of userBindings.keys()) if (!activeTextures.has(ref)) userBindings.delete(ref);
        // Retire removed slots and shrink even hidden ones, so records from
        // earlier scenes/frames cannot accumulate beyond the current budget.
        for (const [slot, list] of records) {
          const count = flares[slot]?.elements.length ?? 0;
          while (list.length > count) {
            list[list.length - 1]!.material.dispose();
            list.pop();
          }
          if (list.length === 0) records.delete(slot);
        }
        if (flares.length === 0) return source;

        const frame = resolveCameraFrame(snapshot, snapshot.camera, time, runtimeNodes);
        if (disposed) return source;
        const { near, far } = resolveCameraClipping(snapshot.camera);
        const planeDistance = Math.min(Math.max(near * 4, 0.5), far * 0.5);
        const items: RenderItem[] = [];

        for (let slot = 0; slot < flares.length; slot += 1) {
          const flare = flares[slot]!;
          const node = flare.node;
          const id = node.runtime?.id;
          if (id && runtimeNodes?.get(id)?.visible === false) continue;
          if (disposed) return source;
          const world = resolveSourcePosition(node, flattened, runtimeNodes, warn);
          if (disposed) return source;
          if (!world) continue;
          const projected = projectLensFlareSource(world, frame, snapshot.camera, aspect);
          if (!projected) continue;
          const visibility = lensFlareVisibility(projected.ndc, node.occlusion, node.edgeFade);
          if (visibility <= 0) continue;
          const elementRecords = ensureElements(flare, slot);
          const geometry = quad ??= createSpriteQuadGeometry();
          const placements = placeLensFlareElements(projected.ndc, flare.elements, viewportHeightPx);
          for (const placement of placements) {
            const element = flare.elements[placement.index]!;
            const record = elementRecords[placement.index]!;
            const rgba = colorToLinearRgba(element.color ?? "#ffffff");
            const gain = node.intensity * visibility;
            if (disposed) return source;
            record.material.setParameter("u_baseColor", [rgba[0] * gain, rgba[1] * gain, rgba[2] * gain, 1]);
            const { position, scale } = lensFlareSpriteTransform(placement.ndc, placement.sizePx, frame, snapshot.camera, aspect, viewportHeightPx, planeDistance);
            items.push({
              geometry,
              material: record.material,
              modelMatrix: new Float32Array([
                scale, 0, 0, 0,
                0, scale, 0, 0,
                0, 0, scale, 0,
                position[0], position[1], position[2], 1
              ]),
              includeInAutoFrame: false,
              label: `${flareKey(node)} flare element ${placement.index}`
            } as RenderItem);
          }
        }

        if (disposed || items.length === 0) return source;
        return {
          ...source,
          collectRenderItems: () => [...(source.collectRenderItems?.() ?? source.renderItems ?? []), ...items]
        };
      } catch (error) {
        if (error === preparationCancelled) return source;
        throw error;
      } finally {
        preparing = false;
      }
    },

    dispose() {
      if (disposing) return;
      disposed = true;
      disposing = true;
      const errors: unknown[] = [];
      try {
        for (const [slot, list] of records) {
          for (let index = list.length - 1; index >= 0; index -= 1) {
            const material = list[index]!.material;
            try {
              material.dispose();
              list.splice(index, 1);
            } catch (error) {
              errors.push(error);
              if (material.disposed) list.splice(index, 1);
            }
          }
          if (list.length === 0) records.delete(slot);
        }
        if (quad) {
          try {
            quad.dispose();
          } catch (error) {
            errors.push(error);
          }
          if (quad.disposed) quad = undefined;
        }
        if (glow) {
          try {
            glow.dispose();
            glow = undefined;
          } catch (error) {
            errors.push(error);
          }
        }
        userBindings.clear();
      } finally {
        disposing = false;
      }
      if (errors.length > 0) throw new AggregateError(errors, "lens flare runtime disposal failed");
    }
  };
}

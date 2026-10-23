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
import {
  isAuraLensFlareNode,
  lensFlareSpriteTransform,
  lensFlareVisibility,
  placeLensFlareElements,
  projectLensFlareSource,
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

/** Soft radial glow: white RGB, alpha falling off smoothly from the centre. */
export function createLensFlareGlowPixels(size = GLOW_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.min(1, Math.hypot(x - half, y - half) / half);
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
  let quad: Geometry | undefined;
  let glow: { readonly binding: TextureBinding; dispose(): void } | undefined;
  const records = new Map<string, ElementRecord[]>();
  const userBindings = new Map<object, TextureBinding>();

  const ensureGlow = (): TextureBinding => {
    if (!glow) {
      const handle = texture.data({ width: GLOW_SIZE, height: GLOW_SIZE, data: createLensFlareGlowPixels(), format: "rgba8", colorSpace: "srgb" });
      const backing = auraTextureRefTexture(handle as never);
      if (!backing) throw new Error("lens flare glow texture failed to resolve");
      glow = { binding: new TextureBinding({ name: "u_baseColorMap", texture: backing }), dispose: () => handle.dispose() };
    }
    return glow.binding;
  };

  const bindingFor = (ref: AuraLensFlareNode["elements"][number]["texture"]): TextureBinding => {
    if (!ref) return ensureGlow();
    let binding = userBindings.get(ref);
    if (!binding) {
      const backing = auraTextureRefTexture(ref);
      if (!backing) {
        warn(`lens flare element texture "${ref.id}" has no live backing; using the default glow`);
        return ensureGlow();
      }
      binding = new TextureBinding({ name: "u_baseColorMap", texture: backing });
      userBindings.set(ref, binding);
    }
    return binding;
  };

  const ensureElements = (node: AuraLensFlareNode): ElementRecord[] => {
    const key = flareKey(node);
    let list = records.get(key);
    if (!list || list.length !== node.elements.length) {
      for (const record of list ?? []) record.material.dispose();
      list = node.elements.map((element, index) => {
        const material = new UnlitMaterial({
          name: `${key} flare element ${index}`,
          color: [1, 1, 1, 1],
          spriteMode: true,
          spriteSizeAttenuation: false,
          renderState: { blend: true, blendMode: "additive", depthTest: false, depthWrite: false }
        });
        material.setParameter("u_baseColorTexture", bindingFor(element.texture));
        return { material };
      });
      records.set(key, list);
    }
    return list;
  };

  return {
    prepare(source, snapshot, runtimeNodes, time, aspect, viewportHeightPx) {
      if (disposed) return source;
      const flattened = groups.flatten(snapshot.nodes);
      const flares = flattened.filter((node): node is AuraLensFlareNode => isAuraLensFlareNode(node));
      if (flares.length === 0) return source;

      const frame = resolveCameraFrame(snapshot, snapshot.camera, time, runtimeNodes);
      const { near, far } = resolveCameraClipping(snapshot.camera);
      const planeDistance = Math.min(Math.max(near * 4, 0.5), far * 0.5);
      quad ??= createSpriteQuadGeometry();
      const items: RenderItem[] = [];

      for (const node of flares) {
        const id = node.runtime?.id;
        if (id && runtimeNodes?.get(id)?.visible === false) continue;
        const world = resolveSourcePosition(node, flattened, runtimeNodes, warn);
        if (!world) continue;
        const projected = projectLensFlareSource(world, frame, snapshot.camera, aspect);
        if (!projected) continue;
        const visibility = lensFlareVisibility(projected.ndc, node.occlusion, node.edgeFade);
        if (visibility <= 0) continue;
        const elementRecords = ensureElements(node);
        const placements = placeLensFlareElements(projected.ndc, node.elements, viewportHeightPx);
        for (const placement of placements) {
          const element = node.elements[placement.index]!;
          const record = elementRecords[placement.index]!;
          const rgba = colorToLinearRgba(element.color ?? "#ffffff");
          const gain = node.intensity * visibility;
          record.material.setParameter("u_baseColor", [rgba[0] * gain, rgba[1] * gain, rgba[2] * gain, 1]);
          const { position, scale } = lensFlareSpriteTransform(placement.ndc, placement.sizePx, frame, snapshot.camera, aspect, viewportHeightPx, planeDistance);
          items.push({
            geometry: quad,
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

      if (items.length === 0) return source;
      return {
        ...source,
        collectRenderItems: () => [...(source.collectRenderItems?.() ?? source.renderItems ?? []), ...items]
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const list of records.values()) for (const record of list) record.material.dispose();
      records.clear();
      quad?.dispose();
      glow?.dispose();
    }
  };
}

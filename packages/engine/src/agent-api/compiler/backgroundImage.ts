/**
 * threejs-parity L7 (SG-10 / SR-06): `scene().background({ texture | cube })`.
 *
 * The authored background image lowers to `RenderSource.environmentBackground`
 * — the renderer's EnvironmentBackgroundPass paints it — WITHOUT touching
 * `environmentLighting`, so a texture/cube background never enables IBL
 * (three's `scene.background = texture` vs `scene.environment` distinction).
 *
 * Like the C1 texture upgrade and B3 HDRI upgrade this is fire-and-forget:
 * the first frames render the authored clear colour, the image swaps in once
 * its bitmap(s) decode. Outcomes are reported through `warn`, which lands in
 * the mount's runtimeWarnings set.
 */

import { Texture } from "@aura3d/rendering";
import { TextureBinding } from "@aura3d/rendering";
import type { EnvironmentBackgroundOptions } from "@aura3d/rendering";
import type { AuraMaterialTextureInput, AuraSceneBackgroundImage, AuraSceneSnapshot } from "../nodes/types.js";
import { bitmapRgbaPixels, loadProductionPrimitiveBitmap } from "./textures.js";

export interface ProductionBackgroundImage {
  /** Current background options; `undefined` until the decode resolves. */
  current(): EnvironmentBackgroundOptions | undefined;
  dispose(): void;
}

const CUBE_FACES = ["px", "nx", "py", "ny", "pz", "nz"] as const;

/** Pull a fetchable URL out of a texture input (string or asset ref). */
export function backgroundImageUrl(input: AuraMaterialTextureInput | string): string | undefined {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && input.kind === "aura-asset-ref") {
    return input.url ?? undefined;
  }
  return undefined;
}

export function createProductionRuntimeBackgroundImage(
  snapshot: AuraSceneSnapshot,
  warn: (message: string) => void
): ProductionBackgroundImage | undefined {
  const spec = snapshot.backgroundImage;
  if (!spec) return undefined;
  let options: EnvironmentBackgroundOptions | undefined;
  let disposed = false;
  const ownedTextures: Texture[] = [];
  const ownedBitmaps: ImageBitmap[] = [];
  const own = (texture: Texture): Texture => {
    ownedTextures.push(texture);
    return texture;
  };

  const fail = (message: string): void => {
    warn(`scene background image failed (${message}); authored clear colour retained`);
  };

  if ("texture" in spec) {
    const url = backgroundImageUrl(spec.texture);
    if (!url) {
      warn("scene background({ texture }) needs a url or aura-asset-ref with a url; authored clear colour retained");
      return undefined;
    }
    void loadProductionPrimitiveBitmap(url)
      .then((bitmap) => {
        if (disposed) {
          bitmap.close();
          return;
        }
        ownedBitmaps.push(bitmap);
        const texture = own(new Texture({
          width: bitmap.width,
          height: bitmap.height,
          source: bitmap,
          colorSpace: "srgb",
          label: "scene-background-texture"
        }));
        options = {
          projection: "equirect",
          texture: new TextureBinding({ name: "u_environmentBackgroundTexture", texture, required: true }),
          encoding: "srgb",
          outputColorSpace: "srgb",
          ...(spec.intensity !== undefined ? { intensity: spec.intensity } : {}),
          ...(spec.rotation !== undefined ? { rotation: spec.rotation } : {})
        };
      })
      .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
  } else if ("cube" in spec) {
    const faces = spec.cube.faces;
    if (faces.length !== 6) {
      warn(`scene background({ cube }) requires exactly six faces, got ${faces.length}; authored clear colour retained`);
      return undefined;
    }
    const urls = faces.map(backgroundImageUrl);
    if (urls.some((url) => url === undefined)) {
      warn("scene background({ cube }) faces must be urls or aura-asset-refs with a url; authored clear colour retained");
      return undefined;
    }
    void Promise.all((urls as string[]).map((url) => loadProductionPrimitiveBitmap(url)))
      .then((bitmaps) => {
        if (disposed) {
          for (const bitmap of bitmaps) bitmap.close();
          return;
        }
        ownedBitmaps.push(...bitmaps);
        const faceSize = bitmaps[0]!.width;
        if (bitmaps.some((bitmap) => bitmap.width !== faceSize || bitmap.height !== faceSize)) {
          throw new Error("cube background faces must be square and equal-sized");
        }
        const texture = own(new Texture({
          width: faceSize,
          height: faceSize,
          dimension: "cube",
          colorSpace: "srgb",
          label: "scene-background-cube",
          cubeFaces: bitmaps.map((bitmap, index) => ({
            face: CUBE_FACES[index]!,
            mipLevels: [{ width: faceSize, height: faceSize, data: bitmapRgbaPixels(bitmap).data }]
          }))
        }));
        options = {
          projection: "cubemap",
          texture: new TextureBinding({ name: "u_environmentBackgroundCubeTexture", texture, required: true }),
          encoding: "srgb",
          outputColorSpace: "srgb",
          ...(spec.cube.intensity !== undefined ? { intensity: spec.cube.intensity } : {}),
          ...(spec.cube.rotation !== undefined ? { rotation: spec.cube.rotation } : {})
        };
      })
      .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
  }

  return {
    current: () => options,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      options = undefined;
      for (const texture of ownedTextures) texture.dispose();
      for (const bitmap of ownedBitmaps) bitmap.close();
      ownedTextures.length = 0;
      ownedBitmaps.length = 0;
    }
  };
}

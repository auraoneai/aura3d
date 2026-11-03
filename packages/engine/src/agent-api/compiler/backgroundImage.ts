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
import type { AssetRequestOptions } from "@aura3d/assets/browser";
import type { AuraAssetRef, AuraMaterialTextureInput, AuraSceneSnapshot } from "../nodes/types.js";
import { formatDiagnosticError } from "../sanitizeDiagnostics.js";
import { bitmapRgbaPixels } from "./textures.js";
import { matchesPreparedBitmapAssetLoad, prepareBitmapAssetLoad, startBitmapAssetLoad, type PreparedBitmapAssetLoad } from "./bitmapAsset.js";

export interface ProductionBackgroundImage {
  /** Current background options; `undefined` until the decode resolves. */
  current(): EnvironmentBackgroundOptions | undefined;
  /** Settles after acquisition and late transport/decode cleanup have finished. */
  readonly settled: Promise<void>;
  dispose(): void;
}

export interface ProductionBackgroundImageOptions {
  readonly request?: AssetRequestOptions;
  readonly signal?: AbortSignal;
  readonly maxDimension?: number;
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
  warn: (message: string) => void,
  config: ProductionBackgroundImageOptions = {}
): ProductionBackgroundImage | undefined {
  const spec = snapshot.backgroundImage;
  if (!spec) return undefined;
  let options: EnvironmentBackgroundOptions | undefined;
  let retired = false;
  let cleanupUncertain = false;
  const controller = new AbortController();
  const ownedTextures = new Set<Texture>();
  const ownedBitmaps = new Set<ImageBitmap>();
  const pending: Promise<unknown>[] = [];
  const own = (texture: Texture): Texture => {
    ownedTextures.add(texture);
    return texture;
  };
  const retire = (): unknown[] => {
    if (retired) return [];
    retired = true;
    options = undefined;
    config.signal?.removeEventListener("abort", abort);
    if (!controller.signal.aborted) controller.abort();
    const failures: unknown[] = [];
    for (const texture of ownedTextures) {
      try { texture.dispose(); } catch (error) { failures.push(error); }
    }
    ownedTextures.clear();
    for (const bitmap of ownedBitmaps) {
      try { bitmap.close(); } catch (error) { failures.push(error); }
    }
    ownedBitmaps.clear();
    if (failures.length) cleanupUncertain = true;
    return failures;
  };
  const unsettledCleanup = (): Promise<void> => new Promise(() => undefined);
  const abort = (): void => { retire(); };
  const fail = (error: unknown): void | Promise<void> => {
    if (retired) return cleanupUncertain ? unsettledCleanup() : undefined;
    const failures = retire();
    try { warn(`scene background image failed (${formatDiagnosticError(error)}${failures.length ? "; cleanup failed" : ""}); authored clear colour retained`); }
    catch { /* Diagnostic observers must not create an unhandled rejection. */ }
    if (cleanupUncertain) return unsettledCleanup();
  };
  const inputFor = (input: AuraMaterialTextureInput | string): string | AuraAssetRef<"texture"> | undefined => {
    const url = backgroundImageUrl(input);
    if (!url) return undefined;
    return typeof input === "string" ? input : input as AuraAssetRef<"texture">;
  };
  let inputs: (string | AuraAssetRef<"texture">)[];
  if ("texture" in spec) {
    const input = inputFor(spec.texture);
    if (!input) {
      warn("scene background({ texture }) needs a url or aura-asset-ref with a url; authored clear colour retained");
      return undefined;
    }
    inputs = [input];
  } else {
    const faces = spec.cube.faces;
    if (faces.length !== 6) {
      warn(`scene background({ cube }) requires exactly six faces, got ${faces.length}; authored clear colour retained`);
      return undefined;
    }
    const candidates = Array.from(faces, inputFor);
    if (candidates.some((input) => input === undefined)) {
      warn("scene background({ cube }) faces must be urls or aura-asset-refs with a url; authored clear colour retained");
      return undefined;
    }
    inputs = candidates as (string | AuraAssetRef<"texture">)[];
  }

  config.signal?.addEventListener("abort", abort, { once: true });
  if (config.signal?.aborted) abort();
  if (!retired) {
    try {
      // Capture every face before starting any transport. No partial cube is
      // admitted when a later face has an invalid request or asset policy.
      const plans: PreparedBitmapAssetLoad[] = inputs.map((input) => prepareBitmapAssetLoad(input, config.request, config.maxDimension));
      const sourcesCurrent = (): boolean => {
        try {
          if (snapshot.backgroundImage !== spec) return false;
          const liveInputs = "texture" in spec ? [spec.texture] : spec.cube.faces;
          return liveInputs.length === inputs.length && plans.every((plan, index) =>
            liveInputs[index] === inputs[index] && matchesPreparedBitmapAssetLoad(plan, inputs[index]!));
        }
        catch { return false; }
      };
      const bitmaps = plans.map((plan) => {
        const work = startBitmapAssetLoad(plan, controller.signal);
        pending.push(work.settled);
        const result = work.result.then((bitmap) => {
          if (retired) {
            try { bitmap.close(); }
            catch {
              // A failed close leaves physical cleanup unknown; never report
              // that this late acquisition has safely settled.
              return new Promise<undefined>(() => undefined);
            }
            return undefined;
          }
          // Take ownership of each face immediately, not after Promise.all.
          ownedBitmaps.add(bitmap);
          return bitmap;
        });
        // A later start can throw before Promise.all is constructed.
        void result.catch(() => undefined);
        pending.push(result.then(() => undefined, () => undefined));
        return result;
      });
      const publication = Promise.all(bitmaps).then((completed) => {
        if (retired) return cleanupUncertain ? unsettledCleanup() : undefined;
        if (completed.some((bitmap) => bitmap === undefined)) return;
        if (!sourcesCurrent()) { retire(); return cleanupUncertain ? unsettledCleanup() : undefined; }
        const images = completed as ImageBitmap[];
        if ("texture" in spec) {
          const bitmap = images[0]!;
          const texture = own(new Texture({
            width: bitmap.width, height: bitmap.height, source: bitmap,
            colorSpace: "srgb", label: "scene-background-texture"
          }));
          const next: EnvironmentBackgroundOptions = {
            projection: "equirect",
            texture: new TextureBinding({ name: "u_environmentBackgroundTexture", texture, required: true }),
            encoding: "srgb", outputColorSpace: "srgb",
            ...(spec.intensity !== undefined ? { intensity: spec.intensity } : {}),
            ...(spec.rotation !== undefined ? { rotation: spec.rotation } : {})
          };
          if (!sourcesCurrent()) { retire(); return cleanupUncertain ? unsettledCleanup() : undefined; }
          options = next;
          return;
        }
        const faceSize = images[0]!.width;
        if (images.some((bitmap) => bitmap.width !== faceSize || bitmap.height !== faceSize)) {
          throw new Error("cube background faces must be square and equal-sized");
        }
        const texture = own(new Texture({
          width: faceSize,
          height: faceSize,
          dimension: "cube",
          colorSpace: "srgb",
          label: "scene-background-cube",
          cubeFaces: images.map((bitmap, index) => ({
            face: CUBE_FACES[index]!,
            mipLevels: [{ width: faceSize, height: faceSize, data: bitmapRgbaPixels(bitmap).data }]
          }))
        }));
        const next: EnvironmentBackgroundOptions = {
          projection: "cubemap",
          texture: new TextureBinding({ name: "u_environmentBackgroundCubeTexture", texture, required: true }),
          encoding: "srgb", outputColorSpace: "srgb",
          ...(spec.cube.intensity !== undefined ? { intensity: spec.cube.intensity } : {}),
          ...(spec.cube.rotation !== undefined ? { rotation: spec.cube.rotation } : {})
        };
        if (!sourcesCurrent()) { retire(); return cleanupUncertain ? unsettledCleanup() : undefined; }
        options = next;
      }).catch(fail);
      pending.push(publication);
    } catch (error) {
      const failed = fail(error);
      if (failed) pending.push(failed);
    }
  }

  return {
    current: () => options,
    settled: Promise.all(pending).then(() => undefined),
    dispose: () => {
      const failures = retire();
      if (failures.length) throw new AggregateError(failures, "Background image cleanup failed");
    }
  };
}

/**
 * R-26 — texture asset refs (`assets.x`) bound to `material.custom` / `material.node`
 * texture2d uniforms. `texture.*` handles and raw `Texture` values resolve
 * synchronously in `customMaterial.ts`; an asset ref only carries a url, so its
 * image loads here after mount (the same fire-and-forget pass the PBR texture
 * upgrade uses). Asset textures sample raw bytes (`linear`): a custom shader
 * owns its own colour management, as three's ShaderMaterial does.
 *
 * Limit: primitive nodes only. A `material.custom` on a `model(...)` node keeps
 * the white fallback for asset refs (named by `CUSTOM_TEXTURE_UNBOUND`).
 */

import { PortableShaderMaterial, Texture, TextureBinding } from "@aura3d/rendering";
import type { AuraAssetRef, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource } from "../nodes/types.js";
import { customTextureUniformNames, customUniformNameFor } from "./customMaterial.js";
import { acquireSharedProductionTextureImage, type ProductionTextureImage } from "./textures.js";

const passed = new WeakSet<ProductionRuntimePrimitiveResource>();

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isAssetTextureRef = (value: unknown): value is AuraAssetRef<"texture"> =>
  isRecord(value) && value.kind === "aura-asset-ref" && value.type === "texture";

type BitmapLoader = (url: string) => Promise<ProductionTextureImage>;

/** A loaded image plus how to give it back: `close()` for an injected loader, the shared-cache release otherwise. */
type HeldImage = { readonly image: Promise<ProductionTextureImage>; readonly release: () => void };
type ImageAcquirer = (url: string) => HeldImage;

const injectedAcquirer = (loadBitmap: BitmapLoader): ImageAcquirer => (url) => {
  let loaded: ProductionTextureImage | undefined;
  let released = false;
  const image = Promise.resolve().then(() => loadBitmap(url)).then((bitmap) => { loaded = bitmap; if (released) bitmap.close(); return bitmap; });
  return { image, release: () => { if (released) return; released = true; loaded?.close(); } };
};

// GU47 e6 phase 8: by default asset textures come from the shared per-URL decode cache (see textures.ts).
const sharedAcquirer: ImageAcquirer = (url) => acquireSharedProductionTextureImage(url);

async function bindResource(resource: ProductionRuntimePrimitiveResource, warn: (message: string) => void, acquire: ImageAcquirer): Promise<void> {
  const material = resource.material;
  const spec = resource.materialSpec?.kind === "custom" ? resource.materialSpec.custom : undefined;
  if (!spec || !(material instanceof PortableShaderMaterial)) return;
  const ownedTextures: Texture[] = [];
  const releases: (() => void)[] = [];
  const disposeOwned = (): void => {
    for (const texture of ownedTextures) texture.dispose();
    for (const release of releases) release();
    ownedTextures.length = 0;
    releases.length = 0;
  };
  const uniforms: { publicName: string; url: string; held: HeldImage }[] = [];
  for (const [publicName, uniform] of Object.entries(spec.uniforms ?? {})) {
    const value = isRecord(uniform) ? uniform.value : undefined;
    if (!isAssetTextureRef(value)) continue;
    if (!value.url) {
      warn(`[CUSTOM_TEXTURE_ASSET_URL_MISSING] "${resource.name}" uniform "${publicName}": asset "${value.id}" has no url; sampling the white fallback`);
      continue;
    }
    // GU47 e6 phase 8: every asset texture of the material starts loading at once.
    const held = acquire(value.url);
    releases.push(held.release);
    uniforms.push({ publicName, url: value.url, held });
  }
  const settled = await Promise.allSettled(uniforms.map((entry) => entry.held.image));
  if (material.disposed) { disposeOwned(); return; }
  uniforms.forEach(({ publicName, url, held }, index) => {
    const result = settled[index]!;
    if (result.status === "fulfilled") {
      const bitmap = result.value;
      const texture = new Texture({ width: bitmap.width, height: bitmap.height, source: bitmap, colorSpace: "linear", label: `${resource.name}-${publicName}` });
      ownedTextures.push(texture);
      material.setParameter(customUniformNameFor(publicName), new TextureBinding({ name: publicName, texture, required: false }));
      return;
    }
    held.release();
    const error: unknown = result.reason;
    const message = `[CUSTOM_TEXTURE_ASSET_LOAD_FAILED] "${resource.name}" uniform "${publicName}" (${url}): ${error instanceof Error ? error.message : String(error)}; sampling the white fallback`;
    resource.textureWarnings.push(message);
    warn(message);
  });
  if (ownedTextures.length > 0 || releases.length > 0) {
    const previous = resource.textureDisposer;
    resource.textureDisposer = () => { previous?.(); disposeOwned(); };
  }
  // Named once per resource: any texture2d uniform still without a texture samples the white fallback.
  for (const publicName of customTextureUniformNames(material)) {
    const binding = material.getParameter(customUniformNameFor(publicName));
    if (binding instanceof TextureBinding && !binding.texture) {
      const message = `[CUSTOM_TEXTURE_UNBOUND] "${resource.name}" uniform "${publicName}" has no texture; the shader samples the white fallback`;
      resource.textureWarnings.push(message);
      warn(message);
    }
  }
}

/** Loads and binds asset-ref textures for every primitive custom material (once per resource). */
export async function upgradeCustomMaterialTextures(
  entries: readonly ProductionRuntimePrimitiveEntry[],
  warn: (message: string) => void,
  loadBitmap?: BitmapLoader
): Promise<void> {
  const acquire = loadBitmap ? injectedAcquirer(loadBitmap) : sharedAcquirer;
  // `entries` can be the compiled scene's live array: `removeSubtree` compacts it in place and `addSubtree` appends to it
  // while this pass awaits an image. A live `for...of` then skips whichever entry shifted into a visited slot, so sweep a
  // snapshot and sweep again while a sweep still found an unvisited resource (`passed` keeps each resource to one bind).
  for (let found = true; found;) {
    found = false;
    for (const entry of [...entries]) {
      for (const resource of entry.resources) {
        if (passed.has(resource)) continue;
        passed.add(resource);
        found = true;
        await bindResource(resource, warn, acquire);
      }
    }
  }
}

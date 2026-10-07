import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { KHRTextureBasisu } from "@gltf-transform/extensions";
import sharp from "sharp";
import { KTX2_ETC1S_FLAGS, KTX2_UASTC_FLAGS, type Ktx2Codec, type OptimizeStepContext } from "../types.js";
import { recordStep } from "./common.js";

/** sRGB-flagged material slots per §6.3 step 10. */
const SRGB_SLOTS = new Set(["baseColorTexture", "emissiveTexture", "sheenColorTexture", "specularColorTexture"]);
const LINEAR_SLOTS = new Set(["normalTexture", "occlusionTexture", "metallicRoughnessTexture", "clearcoatTexture", "transmissionTexture"]);

function textureSlots(doc: import("@gltf-transform/core").Document, texture: import("@gltf-transform/core").Texture): Set<string> {
  const slots = new Set<string>();
  for (const material of doc.getRoot().listMaterials()) {
    for (const slot of [...SRGB_SLOTS, ...LINEAR_SLOTS]) {
      const getter = `get${slot[0].toUpperCase()}${slot.slice(1)}` as keyof typeof material;
      const fn = material[getter];
      if (typeof fn === "function" && (fn as () => unknown).call(material) === texture) slots.add(slot);
    }
  }
  return slots;
}

function codecFor(ctx: OptimizeStepContext, slots: Set<string>): Ktx2Codec {
  if (slots.has("normalTexture")) return ctx.profile.textures.normal === "none" ? "none" : "uastc";
  if ([...SRGB_SLOTS].some((s) => slots.has(s))) return ctx.profile.textures.baseColor;
  if ([...LINEAR_SLOTS].some((s) => slots.has(s))) return ctx.profile.textures.orm === "none" ? "none" : ctx.profile.textures.orm;
  return ctx.profile.textures.baseColor;
}

/** §6.3 step 10 — KHR_texture_basisu via pinned `ktx` CLI. */
export const stepKtx2 = recordStep("ktx2", async (doc, ctx) => {
  const plan = ctx.profile.textures;
  const wants = plan.baseColor !== "none" || plan.normal !== "none" || plan.orm !== "none";
  if (!wants) return;

  const ktx = ctx.ktxBinary;
  if (!ktx) {
    if (ctx.requireKtx2) throw new Error("ktx2 step requires the pinned ktx binary (tool-versions.json); none found");
    ctx.flags.push("ktx2-skipped-no-ktx");
    ctx.log("ktx2: skipped — ktx binary unavailable (install via tool-versions.json)");
    return;
  }

  doc.createExtension(KHRTextureBasisu).setRequired(true);

  for (const texture of doc.getRoot().listTextures()) {
    const slots = textureSlots(doc, texture);
    const codec = codecFor(ctx, slots);
    if (codec === "none") continue;
    const srgb = [...slots].some((s) => SRGB_SLOTS.has(s));

    const dir = mkdtempSync(join(ctx.workDir, "ktx2-"));
    try {
      const src = join(dir, "in.png");
      const dst = join(dir, "out.ktx2");
      const image = texture.getImage();
      if (!image) continue;
      writeFileSync(src, Buffer.from(await sharp(Buffer.from(image)).png().toBuffer()));

      const args = [
        "create",
        "--format", srgb ? "R8G8B8A8_SRGB" : "R8G8B8A8_UNORM",
        "--generate-mipmap",
        ...(codec === "uastc" ? KTX2_UASTC_FLAGS : KTX2_ETC1S_FLAGS),
        src, dst
      ];
      // The ktx CLI dynamically links libktx.so.4 from its install's lib/
      // sibling; point the loader at it so a vendored copy works unpacked.
      const libDir = join(dirname(dirname(ktx)), "lib");
      const env = existsSync(libDir)
        ? { ...process.env, LD_LIBRARY_PATH: `${libDir}${path.delimiter}${process.env.LD_LIBRARY_PATH ?? ""}` }
        : process.env;
      execFileSync(ktx, args, { stdio: ["ignore", "pipe", "pipe"], env });
      texture.setImage(new Uint8Array(readFileSync(dst))).setMimeType("image/ktx2");
      ctx.ktxFlags.push({ texture: texture.getName() || texture.getURI() || "unnamed", codec, srgb, args });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

/**
 * C-16 — compressed texture formats (rendering side, CONTRACTS.md). Provider: PRD 05.
 * Flag: A3D_QR_ASSETS.
 *
 * TextureCompressedFormat (Texture.ts:1) gains "bc7-rgba-unorm" | "etc2-rgb8unorm"
 * in PR 0a; every exhaustive switch gets a throwing default for the new members.
 */

import type { TextureCompressedFormat } from "../Texture";
import { defineContractSlot, type ContractSlot } from "./core";

export interface CompressedTextureCapabilities { readonly astc: boolean; readonly bptc: boolean; readonly etc2: boolean; readonly s3tc: boolean; readonly s3tcSrgb: boolean; }

const compressedTextureFormatSlot: ContractSlot<(format: TextureCompressedFormat, colorSpace: "srgb" | "linear", gl: WebGL2RenderingContext) => number | null> =
  defineContractSlot("C-16", "prd05", "A3D_QR_ASSETS", () => null);

export function resolveCompressedTextureFormatSlot(): ContractSlot<(format: TextureCompressedFormat, colorSpace: "srgb" | "linear", gl: WebGL2RenderingContext) => number | null> {
  return compressedTextureFormatSlot;
}

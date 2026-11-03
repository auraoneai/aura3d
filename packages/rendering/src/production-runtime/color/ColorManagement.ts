import {
  convertManagedColor,
  decodeColorTransfer,
  encodeColorTransfer,
  type A3DManagedColorConversionOptions,
  type A3DManagedColorSpace
} from "../../ColorManagement";

/** `linear` remains an alias of linear-sRGB for existing production consumers. */
export type ColorSpaceProduction = "linear" | A3DManagedColorSpace;

export function srgbToLinear(value: number): number {
  return decodeColorTransfer(value, "srgb");
}

export function linearToSrgb(value: number): number {
  return encodeColorTransfer(value, "srgb");
}

/** All declared production spaces go through the shared primary/transfer path. */
export function convertProductionColorSpace(
  color: readonly [number, number, number, number],
  from: ColorSpaceProduction,
  to: ColorSpaceProduction,
  options: A3DManagedColorConversionOptions = {}
): [number, number, number, number] {
  return convertManagedColor(color, from === "linear" ? "linear-srgb" : from, to === "linear" ? "linear-srgb" : to, options);
}

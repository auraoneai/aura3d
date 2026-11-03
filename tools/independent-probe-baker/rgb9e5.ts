import { encodeRgb9e5Faces as encodeFaces } from "../../packages/assets/src/exporters/Rgb9e5ProbeKTX2.js";

export { packRgb9e5 } from "../../packages/assets/src/exporters/Rgb9e5ProbeKTX2.js";

/**
 * Encode six interleaved RGB float faces as a face-major little-endian RGB9E5
 * texel payload. Container and data-format descriptors are separate.
 */
export function encodeRgb9e5Faces(faces: readonly Float32Array[], faceSize: number): Uint8Array {
  return encodeFaces(faces, faceSize, 3);
}

/** Encode raw coefficient-major RGB SH9 values as 27 little-endian floats. */
export function encodeProbeSH9(coefficients: Float32Array): Uint8Array {
  if (!(coefficients instanceof Float32Array) || coefficients.length !== 27) {
    throw new RangeError("SH9 payload requires exactly 27 float coefficients");
  }
  if (!coefficients.every(Number.isFinite)) throw new RangeError("SH9 coefficients must be finite");
  const output = new Uint8Array(27 * 4);
  const view = new DataView(output.buffer);
  for (let index = 0; index < coefficients.length; index += 1) {
    view.setFloat32(index * 4, coefficients[index]!, true);
  }
  return output;
}

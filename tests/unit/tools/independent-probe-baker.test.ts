import { describe, expect, it } from "vitest";
import { bakeEnvironmentProbe } from "../../../tools/independent-probe-baker/index.js";

type RGB = readonly [number, number, number];

/** A constant synthetic linear-radiance image, with interleaved RGB channels. */
function uniformImage(width: number, height: number, color: RGB) {
  const data = new Float32Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data.set(color, pixel * 3);
  }
  return { width, height, data };
}

/** Opposing hemispherical lobes aligned to the equirectangular vertical axis. */
function verticalLobe(width: number, height: number, sign: 1 | -1) {
  const data = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const north = Math.cos(Math.PI * (y + 0.5) / height);
    for (let x = 0; x < width; x += 1) {
      data[(y * width + x) * 3] = Math.max(0, sign * north);
    }
  }
  return { width, height, data };
}

/** RGB independently encodes the +X, +Y, and +Z world-axis components. */
function directionImage(width: number, height: number) {
  const data = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const theta = Math.PI * (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const phi = 2 * Math.PI * ((x + 0.5) / width - 0.5);
      const index = (y * width + x) * 3;
      data[index] = 0.5 + 0.2 * Math.sin(theta) * Math.cos(phi);
      data[index + 1] = 0.5 + 0.2 * Math.cos(theta);
      data[index + 2] = 0.5 + 0.2 * Math.sin(theta) * Math.sin(phi);
    }
  }
  return { width, height, data };
}

const smallBake = { cubeSize: 4, mipCount: 3, samplesPerTexel: 8 } as const;

describe("independent environment probe baker", () => {
  it("preserves a constant linear-radiance environment on all cube faces and mips", () => {
    const color: RGB = [0.25, 1.5, 3];
    const image = uniformImage(16, 8, color);
    const result = bakeEnvironmentProbe(image, smallBake);

    expect(result.mips).toHaveLength(3);
    for (const [level, mip] of result.mips.entries()) {
      expect(mip.size).toBe(4 >> level);
      expect(mip.faces).toHaveLength(6);
      for (const face of mip.faces) {
        expect(face).toBeInstanceOf(Float32Array);
        expect(face.length).toBe(mip.size * mip.size * 3);
        for (let pixel = 0; pixel < mip.size * mip.size; pixel += 1) {
          for (let channel = 0; channel < 3; channel += 1) {
            expect(face[pixel * 3 + channel]).toBeCloseTo(color[channel]!, 5);
          }
        }
      }
    }
  });

  it("projects a constant environment with its analytic orthonormal SH energy", () => {
    const color: RGB = [0.2, 0.8, 2];
    const result = bakeEnvironmentProbe(uniformImage(128, 64, color), {
      cubeSize: 1,
      mipCount: 1,
      samplesPerTexel: 4,
    });

    expect(result.sh9).toBeInstanceOf(Float32Array);
    expect(result.sh9).toHaveLength(27);
    // For a constant function C on the sphere, the only nonzero orthonormal
    // coefficient is C*sqrt(4*pi), independent of its slot convention.
    for (let channel = 0; channel < 3; channel += 1) {
      const coefficients = Array.from({ length: 9 }, (_, index) => result.sh9[index * 3 + channel]!);
      const largest = Math.max(...coefficients.map(Math.abs));
      const energy = coefficients.reduce((sum, coefficient) => sum + coefficient * coefficient, 0);
      expect(largest).toBeCloseTo(color[channel]! * Math.sqrt(4 * Math.PI), 3);
      expect(energy).toBeCloseTo(4 * Math.PI * color[channel]! ** 2, 2);
    }
  });

  it("maps opposing vertical lobes to the documented cube faces and SH coefficient", () => {
    const north = bakeEnvironmentProbe(verticalLobe(128, 64, 1), smallBake);
    const south = bakeEnvironmentProbe(verticalLobe(128, 64, -1), smallBake);
    const faceRedMean = (data: Float32Array): number => {
      let sum = 0;
      for (let index = 0; index < data.length; index += 3) sum += data[index]!;
      return sum / (data.length / 3);
    };

    // Cube face order is +X, -X, +Y, -Y, +Z, -Z.
    expect(faceRedMean(north.mips[0]!.faces[2]!)).toBeGreaterThan(0.7);
    expect(faceRedMean(north.mips[0]!.faces[3]!)).toBeLessThan(0.01);
    expect(faceRedMean(south.mips[0]!.faces[3]!)).toBeGreaterThan(0.7);
    expect(faceRedMean(south.mips[0]!.faces[2]!)).toBeLessThan(0.01);

    // max(y,0)-max(-y,0)=y. The coefficient of the documented
    // -sqrt(3/(4*pi))*y basis is -sqrt(4*pi/3); the other eight vanish.
    for (let index = 0; index < 9; index += 1) {
      const difference = north.sh9[index * 3]! - south.sh9[index * 3]!;
      const expected = index === 1 ? -Math.sqrt(4 * Math.PI / 3) : 0;
      expect(difference).toBeCloseTo(expected, 2);
    }
  });

  it("uses the documented longitude convention and cubemap face axes", () => {
    const result = bakeEnvironmentProbe(directionImage(128, 64), {
      cubeSize: 2,
      mipCount: 1,
      samplesPerTexel: 1,
    });
    // A sample on a face points along normalize(N + u*U + v*V), with
    // row-major texels and u,v in [-1,1]. These axes are the consumer contract.
    const axes = [
      { n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
      { n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
      { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
      { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
      { n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
    ] as const;
    for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
      const face = result.mips[0]!.faces[faceIndex]!;
      const { n, u, v } = axes[faceIndex]!;
      for (let y = 0; y < 2; y += 1) {
        for (let x = 0; x < 2; x += 1) {
          const du = x - 0.5;
          const dv = y - 0.5;
          const direction = n.map((component, channel) => component + du * u[channel]! + dv * v[channel]!);
          const length = Math.hypot(...direction);
          for (let channel = 0; channel < 3; channel += 1) {
            const expected = 0.5 + 0.2 * direction[channel]! / length;
            expect(face[(y * 2 + x) * 3 + channel]).toBeCloseTo(expected, 2);
          }
        }
      }
    }

    // The first-order SH slots encode -Y, +Z, -X respectively.
    const firstOrder = 0.2 * Math.sqrt(4 * Math.PI / 3);
    expect(result.sh9[3 * 3]).toBeCloseTo(-firstOrder, 2);
    expect(result.sh9[1 * 3 + 1]).toBeCloseTo(-firstOrder, 2);
    expect(result.sh9[2 * 3 + 2]).toBeCloseTo(firstOrder, 2);
  });

  it("converges toward the analytic roughest-mip value for a directional field", () => {
    const result = bakeEnvironmentProbe(directionImage(128, 64), {
      cubeSize: 4,
      mipCount: 3,
      samplesPerTexel: 1_024,
    });
    const roughest = result.mips[2]!;
    expect(roughest.size).toBe(1);
    for (let face = 0; face < 6; face += 1) {
      const axis = Math.floor(face / 2);
      const sign = face % 2 === 0 ? 1 : -1;
      // At maximum roughness this kernel's normalized reflected-light
      // distribution is cosine-weighted over the facing hemisphere. Its
      // mean normal component is 2/3, so a field 0.5 + 0.2*axis has the
      // following analytic mean at the center of each +/- axis face.
      const expected = 0.5 + sign * 0.2 * 2 / 3;
      expect(Math.abs(roughest.faces[face]![axis]! - expected)).toBeLessThan(0.015);
      for (let channel = 0; channel < 3; channel += 1) {
        if (channel !== axis) {
          expect(Math.abs(roughest.faces[face]![channel]! - 0.5)).toBeLessThan(0.015);
        }
      }
    }
  });

  it("preserves zero radiance without producing NaN or infinity", () => {
    const result = bakeEnvironmentProbe(uniformImage(8, 4, [0, 0, 0]), smallBake);
    expect(Array.from(result.sh9).every((value) => value === 0)).toBe(true);
    for (const mip of result.mips) {
      for (const face of mip.faces) expect(Array.from(face).every((value) => value === 0)).toBe(true);
    }
  });

  it("is deterministic and leaves the caller's input untouched", () => {
    const image = uniformImage(16, 8, [0.4, 1.2, 2.7]);
    image.data[0] = 3.25;
    image.data[17] = 0.1;
    const before = image.data.slice();
    const first = bakeEnvironmentProbe(image, smallBake);
    const second = bakeEnvironmentProbe(image, smallBake);

    expect(image.data).toEqual(before);
    expect(first.sh9).toEqual(second.sh9);
    expect(first.mips).toHaveLength(second.mips.length);
    for (const [level, mip] of first.mips.entries()) {
      for (const [face, values] of mip.faces.entries()) {
        expect(values).toEqual(second.mips[level]!.faces[face]);
      }
    }
  });

  it("rejects malformed input and excessive requested work before baking", () => {
    const image = uniformImage(8, 4, [1, 1, 1]);
    expect(() => bakeEnvironmentProbe({ ...image, width: 0 }, smallBake)).toThrow();
    expect(() => bakeEnvironmentProbe({ ...image, data: image.data.subarray(0, 2) }, smallBake)).toThrow();
    const invalidPixels = image.data.slice();
    invalidPixels[5] = Number.NaN;
    expect(() => bakeEnvironmentProbe({ ...image, data: invalidPixels }, smallBake)).toThrow();
    expect(() => bakeEnvironmentProbe(image, { ...smallBake, cubeSize: 0 })).toThrow();
    expect(() => bakeEnvironmentProbe(image, { ...smallBake, mipCount: 0 })).toThrow();
    expect(() => bakeEnvironmentProbe(image, { ...smallBake, mipCount: 4 })).toThrow();
    expect(() => bakeEnvironmentProbe(image, { ...smallBake, samplesPerTexel: 0 })).toThrow();
    expect(() => bakeEnvironmentProbe(image, { ...smallBake, samplesPerTexel: 1.5 })).toThrow();
    // Even if the guard regresses, this small input remains safe to execute.
    expect(() => bakeEnvironmentProbe(image, { ...smallBake, maxWork: 100 })).toThrow();
  });
});

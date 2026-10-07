/**
 * uv-transform-matrix.test.ts — PRD-04 P3-3: `uvTransformMatrix(offset,
 * rotation, scale)` composes the glTF `T·R·S` transform (KHR_texture_transform,
 * R = [[c, s], [-s, c]] column-vector).
 *
 *  - 20 random uniform-scale inputs must equal three r185's
 *    `Matrix3.setUvTransform(ox, oy, s, s, r, 0, 0)` within 1e-6.
 *  - Non-uniform scale with r ≠ 0 must equal the KHR README formula and must
 *    differ from three (three composes S·R, the spec composes R·S).
 */
import { describe, expect, it } from "vitest";
import { Matrix3 } from "three";
import { uvTransformMatrix } from "../../../../packages/rendering/src/materials/features";

/** Deterministic PRNG so failures reproduce. */
function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

/** KHR_texture_transform README: T·R·S, column-major storage. */
function khrMatrix(offset: readonly [number, number], rotation: number, scale: readonly [number, number]): number[] {
	const c = Math.cos(rotation);
	const s = Math.sin(rotation);
	const [sx, sy] = scale;
	return [c * sx, -s * sx, 0, s * sy, c * sy, 0, offset[0], offset[1], 1];
}

describe("uvTransformMatrix (PRD-04 P3-3)", () => {
	it("uniform scale: equals three Matrix3.setUvTransform for 20 random inputs", () => {
		const rand = rng(0xa3d04);
		for (let i = 0; i < 20; i++) {
			const offset: [number, number] = [rand() * 2 - 1, rand() * 2 - 1];
			const scale = rand() * 3 + 0.1;
			const rotation = rand() * Math.PI * 4 - Math.PI * 2;
			const three = new Matrix3().setUvTransform(offset[0], offset[1], scale, scale, rotation, 0, 0).elements;
			const ours = uvTransformMatrix(offset, rotation, [scale, scale]);
			for (let k = 0; k < 9; k++) {
				expect(Math.abs(ours[k]! - three[k]!), `case ${i} element ${k}`).toBeLessThanOrEqual(1e-6);
			}
		}
	});

	it("non-uniform scale with rotation equals the KHR formula and differs from three", () => {
		const offset: [number, number] = [0.25, -0.4];
		const scale: [number, number] = [2.0, 0.5];
		const rotation = Math.PI / 3;
		const ours = uvTransformMatrix(offset, rotation, scale);
		const expected = khrMatrix(offset, rotation, scale);
		for (let k = 0; k < 9; k++) {
			// Float32Array storage: fp32 quantization is the floor.
			expect(Math.abs(ours[k]! - expected[k]!), `KHR element ${k}`).toBeLessThanOrEqual(1e-6);
		}
		const three = new Matrix3().setUvTransform(offset[0], offset[1], scale[0], scale[1], rotation, 0, 0).elements;
		let differed = false;
		for (let k = 0; k < 9; k++) {
			if (Math.abs(ours[k]! - three[k]!) > 1e-6) differed = true;
		}
		expect(differed, "non-uniform + rotated transform must diverge from three's S·R composition").toBe(true);
	});

	it("identity inputs produce the identity matrix", () => {
		// -0 produced by -sin(0)*scale is numerically identical; normalize it.
		expect(Array.from(uvTransformMatrix([0, 0], 0, [1, 1]), (v) => (v === 0 ? 0 : v))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
	});
});

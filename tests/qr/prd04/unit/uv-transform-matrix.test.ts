/**
 * Check the KHR_texture_transform T·R·S contract against independently
 * calculated UV points. The fixtures below are original arithmetic examples;
 * their expected values do not depend on another rendering implementation.
 */
import { describe, expect, it } from "vitest";
import { uvTransformMatrix } from "../../../../packages/rendering/src/materials/features";

/** Deterministic PRNG so failures reproduce. */
function rng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

/** Apply the returned column-major homogeneous matrix to a UV point. */
function applyMatrix(matrix: Float32Array, uv: readonly [number, number]): number[] {
	return [
		matrix[0]! * uv[0] + matrix[3]! * uv[1] + matrix[6]!,
		matrix[1]! * uv[0] + matrix[4]! * uv[1] + matrix[7]!,
		matrix[2]! * uv[0] + matrix[5]! * uv[1] + matrix[8]!
	];
}

/** Scale the point, rotate it in the declared UV convention, then translate. */
function applySteps(
	uv: readonly [number, number],
	offset: readonly [number, number],
	rotation: number,
	scale: readonly [number, number]
): number[] {
	const x = uv[0] * scale[0];
	const y = uv[1] * scale[1];
	const cosine = Math.cos(rotation);
	const sine = Math.sin(rotation);
	return [x * cosine + y * sine + offset[0], y * cosine - x * sine + offset[1], 1];
}

function expectPointClose(actual: number[], expected: number[], label: string): void {
	for (let i = 0; i < expected.length; i++) {
		expect(Math.abs(actual[i]! - expected[i]!), `${label} component ${i}`).toBeLessThanOrEqual(1e-6);
	}
}

describe("uvTransformMatrix (PRD-04 P3-3)", () => {
	it("preserves 20 deterministic uniform-scale transforms when applied to UV points", () => {
		const rand = rng(0xa3d04);
		for (let i = 0; i < 20; i++) {
			const offset: [number, number] = [rand() * 2 - 1, rand() * 2 - 1];
			const uniformScale = rand() * 3 + 0.1;
			const scale: [number, number] = [uniformScale, uniformScale];
			const rotation = rand() * Math.PI * 4 - Math.PI * 2;
			const matrix = uvTransformMatrix(offset, rotation, scale);
			for (const uv of [[0, 0], [1, 0], [0, 1], [0.31, -0.72]] as const) {
				expectPointClose(applyMatrix(matrix, uv), applySteps(uv, offset, rotation, scale), `case ${i}`);
			}
		}
	});

	it("applies non-uniform scaling before rotation and translation", () => {
		// (0.25, 0.75) -> (0.5, 0.375) -> (0.375, -0.5)
		// -> (0.625, -0.9). Reversing scale and rotation yields a different point.
		const matrix = uvTransformMatrix([0.25, -0.4], Math.PI / 2, [2, 0.5]);
		expectPointClose(applyMatrix(matrix, [0.25, 0.75]), [0.625, -0.9, 1], "quarter turn");
		expectPointClose(applyMatrix(matrix, [0, 0]), [0.25, -0.4, 1], "origin");
		expectPointClose(applyMatrix(matrix, [1, 0]), [0.25, -2.4, 1], "U basis");
		expectPointClose(applyMatrix(matrix, [0, 1]), [0.75, -0.4, 1], "V basis");
	});

	it("handles negative and zero scales with a negative rotation", () => {
		const offset: [number, number] = [-0.2, 0.3];
		const uv: [number, number] = [0.6, -0.8];
		for (const scale of [[-2, 0.5], [0, 3]] as const) {
			const rotation = -Math.PI / 3;
			expectPointClose(applyMatrix(uvTransformMatrix(offset, rotation, scale), uv), applySteps(uv, offset, rotation, scale), `${scale}`);
		}
	});

	it("identity inputs produce the identity matrix", () => {
		// -0 is numerically identical to 0.
		expect(Array.from(uvTransformMatrix([0, 0], 0, [1, 1]), (value) => (value === 0 ? 0 : value))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
	});
});

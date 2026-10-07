/**
 * prd04-overrides.test.ts — PRD-04 P2-1 real-impl conformance for
 * ModelMaterialOverrides: param-key round trip, override precedence
 * (last match wins), multiply preserving bound textures. Deeper coverage in
 * tests/qr/prd04/unit/model-material-overrides.test.ts.
 */
import { describe, expect, it } from "vitest";
import { Material } from "@aura3d/rendering";
import {
	applyMaterialOverrides,
	snapshotMaterials
} from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";

function material(name: string, parameters: Record<string, unknown>): Material {
	return new Material({ name, shaderKey: "test", parameters: parameters as never });
}

const authored = () => [
	material("shell", {
		u_baseColorFactor: [0.8, 0.8, 0.8, 1],
		u_baseColorTextureEnabled: 1,
		u_roughness: 0.7,
		u_metallic: 0.1
	}),
	material("trim", { u_baseColorFactor: [0.5, 0.5, 0.5, 1], u_roughness: 0.3 })
];

const shellOnly = (n: string) => n === "shell";

describe("ModelMaterialOverrides impl", () => {
	it("snapshot → apply → [] overrides restores authored keys exactly", () => {
		const mats = authored();
		const snapshot = snapshotMaterials(mats);
		applyMaterialOverrides(snapshot, mats, [{ target: shellOnly, baseColorMultiply: [2, 1, 1, 1] }]);
		expect(mats[0]!.getParameter("u_baseColorFactor")).toEqual([1.6, 0.8, 0.8, 1]);
		applyMaterialOverrides(snapshot, mats, []);
		expect(mats[0]!.getParameter("u_baseColorFactor")).toEqual([0.8, 0.8, 0.8, 1]);
		expect(mats[1]!.getParameter("u_baseColorFactor")).toEqual([0.5, 0.5, 0.5, 1]);
	});

	it("later overrides win on shared keys; non-targeted materials untouched", () => {
		const mats = authored();
		const snapshot = snapshotMaterials(mats);
		applyMaterialOverrides(snapshot, mats, [
			{ target: shellOnly, baseColorMultiply: [2, 2, 2, 1] },
			{ target: shellOnly, baseColorMultiply: [4, 4, 4, 1] }
		]);
		expect(mats[0]!.getParameter("u_baseColorFactor")).toEqual([3.2, 3.2, 3.2, 1]);
		expect(mats[1]!.getParameter("u_baseColorFactor")).toEqual([0.5, 0.5, 0.5, 1]);
	});

	it("baseColorMultiply preserves the texture-enabled flag", () => {
		const mats = authored();
		const snapshot = snapshotMaterials(mats);
		applyMaterialOverrides(snapshot, mats, [{ target: shellOnly, baseColorMultiply: [0.5, 0.5, 0.5, 1] }]);
		expect(mats[0]!.getParameter("u_baseColorTextureEnabled")).toBe(1);
	});
});

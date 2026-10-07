/**
 * prd04-lobes.test.ts — PRD-04 P3-1/P3-2 real-impl conformance:
 * `PhysicalMaterial`/`programFeatures()` produces stable program keys, each
 * lobe toggle changes the key, and the C-03 lobe registry exposes all eleven
 * `KHR_materials_*` lobes (registration is registry state only — the C-02
 * generator consumes them later). §8.10: no light/shadow/env fields are
 * expressible through `programFeatures()`.
 */
import { describe, expect, it } from "vitest";
import {
	computeProgramKey,
	materialLobes,
	QUALITY_TIERS,
	type QrFlags,
	type QrFlagName,
	type QrFlagValue,
	type MaterialFeatureContext
} from "@aura3d/rendering/contracts";
import {
	registerPrd04MaterialLobes,
	physicalFeatureSet,
	legacyPhysicalDescriptor,
	type PhysicalMaterialDescriptor
} from "@aura3d/rendering/lanes";
import { InstancedPBRMaterial, PBRMaterial, SkinnedLitMaterial } from "@aura3d/rendering";

registerPrd04MaterialLobes();

const flagsOf = (values: Partial<Record<QrFlagName, QrFlagValue>>): QrFlags => ({
	values,
	on: (name) => values[name] === true
});

const FLAGS_ON = flagsOf({ A3D_QR_MATERIALS: true });
const FLAGS_OFF = flagsOf({});

const ctx = (flags: QrFlags, tier = QUALITY_TIERS.high): MaterialFeatureContext => ({ flags, tier });

function baseDescriptor(): PhysicalMaterialDescriptor {
	return {
		baseColorFactor: [1, 1, 1, 1],
		metallicFactor: 0,
		roughnessFactor: 0.5,
		emissiveFactor: [0, 0, 0],
		emissiveStrength: 1,
		normalScale: 1,
		occlusionStrength: 1,
		ior: 1.5,
		alphaMode: "opaque",
		alphaCutoff: 0.5,
		alphaToCoverage: false,
		doubleSided: false,
		unlit: false,
		textures: {}
	};
}

const key = (d: PhysicalMaterialDescriptor, c = ctx(FLAGS_ON)) =>
	computeProgramKey(physicalFeatureSet(d, c) as never);

describe("PRD-04 P3-1 programFeatures()", () => {
	it("program key is stable for equal descriptors", () => {
		expect(key(baseDescriptor())).toBe(key(baseDescriptor()));
	});

	it("is distinct for each lobe toggle", () => {
		const base = key(baseDescriptor());
		const toggles: [string, () => PhysicalMaterialDescriptor][] = [
			["ior", () => ({ ...baseDescriptor(), ior: 1.4 })],
			["specular", () => ({ ...baseDescriptor(), specular: { factor: 0.5, colorFactor: [1, 1, 1] } })],
			["clearcoat", () => ({ ...baseDescriptor(), clearcoat: { factor: 1, roughnessFactor: 0.1, normalScale: 1 } })],
			["sheen", () => ({ ...baseDescriptor(), sheen: { colorFactor: [1, 1, 1], roughnessFactor: 0.5 } })],
			["iridescence", () => ({ ...baseDescriptor(), iridescence: { factor: 1, ior: 1.3, thicknessMin: 100, thicknessMax: 400 } })],
			["anisotropy", () => ({ ...baseDescriptor(), anisotropy: { strength: 1, rotation: 0 } })],
			["transmission", () => ({ ...baseDescriptor(), transmission: { factor: 1 } })],
			["volume", () => ({ ...baseDescriptor(), volume: { thicknessFactor: 1, attenuationDistance: 1, attenuationColor: [1, 1, 1] } })],
			["dispersion", () => ({ ...baseDescriptor(), dispersion: 0.02 })],
			["emissive-strength", () => ({ ...baseDescriptor(), emissiveStrength: 3 })],
			["unlit", () => ({ ...baseDescriptor(), unlit: true })]
		];
		for (const [name, make] of toggles) {
			expect(key(make()), `${name} changes the program key`).not.toBe(base);
		}
	});

	it("flags off yields no extension features", () => {
		const f = physicalFeatureSet(
			{ ...baseDescriptor(), clearcoat: { factor: 1, roughnessFactor: 0, normalScale: 1 } },
			ctx(FLAGS_OFF)
		);
		expect(f.extensions).toEqual([]);
	});

	it("produces no light/shadow/env fields (§8.10)", () => {
		const f = physicalFeatureSet(baseDescriptor(), ctx(FLAGS_ON)) as Record<string, unknown>;
		for (const forbidden of ["lights", "shadows", "environment", "fog", "pass", "target", "backgroundCoverage"]) {
			expect(forbidden in f, `programFeatures must not emit ${forbidden}`).toBe(false);
		}
		const featureKeys = Object.keys(f.features as Record<string, unknown>);
		expect(featureKeys.some((k) => /light|shadow|environment|fog/i.test(k))).toBe(false);
	});

	it("Low tier folds the iridescence film bit to false (Schlick)", () => {
		const d: PhysicalMaterialDescriptor = {
			...baseDescriptor(),
			iridescence: { factor: 1, ior: 1.3, thicknessMin: 100, thicknessMax: 400 }
		};
		const low = physicalFeatureSet(d, ctx(FLAGS_ON, QUALITY_TIERS.low)).extensions.find((e) => e.lobe === "iridescence");
		const high = physicalFeatureSet(d, ctx(FLAGS_ON, QUALITY_TIERS.high)).extensions.find((e) => e.lobe === "iridescence");
		expect(low?.bits.film).toBe(false);
		expect(high?.bits.film).toBe(true);
	});

	it("the five legacy classes expose programFeatures via their options", () => {
		const material = new PBRMaterial({ clearcoatFactor: 0.8, ior: 1.4, renderState: { blend: true, depthWrite: false, cullMode: "none" } });
		const f = material.programFeatures(ctx(FLAGS_ON));
		const lobes = f.extensions.map((e) => e.lobe);
		expect(lobes).toContain("clearcoat");
		expect(lobes).toContain("ior");
		expect(f.alphaMode).toBe("blend");
		expect(f.doubleSided).toBe(true);
		expect(f.lighting).toBe("lit");
	});

	it("SkinnedLitMaterial declares skinning; InstancedPBRMaterial declares instancing", () => {
		const skinned = new SkinnedLitMaterial({ extraInfluences: true });
		const sf = skinned.programFeatures(ctx(FLAGS_ON));
		expect(sf.skinning).toEqual({ influences: 8, palette: "uniform" });
		const instanced = new InstancedPBRMaterial();
		expect(instanced.programFeatures(ctx(FLAGS_ON)).instancing).toEqual({ color: false });
	});
});

describe("PRD-04 P3-2 materialLobes registry", () => {
	it("registers all eleven lobes flag-gated to A3D_QR_MATERIALS", () => {
		const active = materialLobes(FLAGS_ON);
		// Registry sorts by (order ?? 0, id) — order-independent check.
		const ids = active.filter((l) => l.owner === "prd04").map((l) => l.id).sort();
		expect(ids).toEqual([
			"anisotropy", "clearcoat", "dispersion", "emissive-strength", "ior", "iridescence",
			"sheen", "specular", "transmission", "unlit", "volume"
		]);
		for (const lobe of active) {
			expect(lobe.glTFExtension, lobe.id).toMatch(/^KHR_materials_/);
			expect(lobe.chunks.pars).toBe("a3d_prd04_bsdf_lobes_common");
			expect(lobe.chunks.fragment.startsWith("a3d_prd04_")).toBe(true);
		}
		expect(materialLobes(FLAGS_OFF)).toEqual([]);
	});

	it("clearcoat bind() writes the GLTFRenderResources u_* names", () => {
		const lobe = materialLobes(FLAGS_ON).find((l) => l.id === "clearcoat")!;
		const writes: Record<string, unknown> = {};
		lobe.bind(
			{ parameters: { clearcoatFactor: 0.7, clearcoatRoughnessFactor: 0.2, clearcoatNormalScale: 0.6 }, textures: {} },
			(u, v) => { writes[u] = v; }
		);
		expect(writes.u_clearcoatFactor).toBe(0.7);
		expect(writes.u_clearcoatRoughnessFactor).toBe(0.2);
		expect(writes.u_clearcoatNormalScale).toBe(0.6);
	});

	it("sampler slots are counted per lobe (C-12 surface)", () => {
		const slots = Object.fromEntries(materialLobes(FLAGS_ON).map((l) => [l.id, l.samplerSlots]));
		expect(slots.clearcoat).toEqual(["clearcoat", "clearcoatRoughness", "clearcoatNormal"]);
		expect(slots.transmission).toEqual(["transmission"]);
		expect(slots.dispersion).toEqual([]);
	});
});

describe("legacyPhysicalDescriptor projection", () => {
	it("maps legacy options to the glTF descriptor", () => {
		const d = legacyPhysicalDescriptor({ metallic: 0.9, roughness: 0.1, ior: 2.0, emissiveColor: [0.5, 0.4, 0.3], emissiveStrength: 2 });
		expect(d.metallicFactor).toBe(0.9);
		expect(d.roughnessFactor).toBe(0.1);
		expect(d.ior).toBe(2.0);
		expect(d.emissiveFactor).toEqual([0.5, 0.4, 0.3]);
		expect(d.emissiveStrength).toBe(2);
		expect(d.alphaMode).toBe("opaque");
		expect(d.specular).toBeUndefined();
	});
});

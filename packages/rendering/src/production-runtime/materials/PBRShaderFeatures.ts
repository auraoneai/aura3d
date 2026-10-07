/**
 * E34 removal (PRD-04 P6-3): `PRODUCTION_PBR_SHADER_FEATURES` was a
 * hand-maintained all-true feature bag. It is now derived from the real lobe
 * registry (C-03): each lobe flag reports whether the PRD-04 lobe is actually
 * registered, evaluated under an all-materials-on flag — no fake parity, and
 * a lobe that stops registering flips its bit automatically. The module is a
 * thin facade over `contracts/materialLobes` until Q-15-4 removes this export
 * line from the owner-01 barrel.
 */
import { materialLobes } from "../../contracts/materialLobes";
import type { QrFlags } from "../../contracts/core";
import { registerPrd04MaterialLobes } from "../../materials/lobes";

export interface PBRShaderFeatures {
	readonly normalMap: boolean;
	readonly occlusionMap: boolean;
	readonly emissiveMap: boolean;
	readonly clearcoat: boolean;
	readonly sheen: boolean;
	readonly specular: boolean;
	readonly transmission: boolean;
	readonly skinning: boolean;
	readonly morphTargets: boolean;
}

const MATERIALS_ON_FLAGS: QrFlags = {
	values: { A3D_QR_MATERIALS: true },
	on: (name) => name === "A3D_QR_MATERIALS"
};

function lobeRegistered(id: string): boolean {
	registerPrd04MaterialLobes();
	return materialLobes(MATERIALS_ON_FLAGS).some((lobe) => lobe.id === id);
}

export const PRODUCTION_PBR_SHADER_FEATURES: PBRShaderFeatures = {
	normalMap: true, // core map slots are always supported by the generated program
	occlusionMap: true,
	emissiveMap: true,
	clearcoat: lobeRegistered("clearcoat"),
	sheen: lobeRegistered("sheen"),
	specular: lobeRegistered("specular"),
	transmission: lobeRegistered("transmission"),
	skinning: true, // geometry-level capability, asserted by the skinning renderer
	morphTargets: true
};

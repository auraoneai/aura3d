/**
 * no-asset-specific-shader-constants.test.ts — PRD-04 P3-5 source guard.
 * `shaders/physical` + `shaders/physical-wgsl` + `materials` trees are generic: no constants tuned to
 * a single product/asset may live there (the listed identifiers and magic
 * values came from the pre-rebuild look-dev hardcodes).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const RENDERING_SRC = join(here, "../../../../packages/rendering/src");

const SCAN_ROOTS = [
	join(RENDERING_SRC, "shaders", "physical"),
	join(RENDERING_SRC, "shaders", "physical-wgsl"),
	join(RENDERING_SRC, "materials")
];

const FORBIDDEN: readonly (string | RegExp)[] = [
	"sourcePaint",
	"productProp",
	"RedPaintGate",
	"horizonStripe",
	"roughEnvironmentFloor",
	"0.98, 0.12, 0.075",
	// Standalone `0.012` scalar (the legacy gate constant). Elements inside a
	// color vector such as `[0.01, 0.012, 0.014, 1]` are not the forbidden
	// constant — a comma may follow, a digit or `.` may not precede/follow.
	/(?<![\d.])0\.012(?![\d.,])/,
	"clearcoatNormalBoost",
	"a3dApplyAdvancedPbrLobes",
	"a3dPbrIridescenceColor",
	"a3dPbrAnisotropicDistribution"
];

function* files(root: string): Generator<string> {
	let entries: string[] = [];
	try {
		entries = readdirSync(root);
	} catch {
		return; // directory absent on this checkout (e.g. physical-wgsl until Phase 6)
	}
	for (const name of entries) {
		const path = join(root, name);
		if (statSync(path).isDirectory()) yield* files(path);
		else if (/\.(ts|glsl|wgsl)$/.test(name)) yield path;
	}
}

describe("P3-5 source guard: no asset-specific shader constants", () => {
	const scanned: string[] = [];
	for (const root of SCAN_ROOTS) scanned.push(...files(root));

	it("scans at least the physical shader tree", () => {
		expect(scanned.some((f) => f.includes(`${"shaders"}/physical/`))).toBe(true);
		expect(scanned.some((f) => f.includes("/materials/"))).toBe(true);
	});

	for (const token of FORBIDDEN) {
		it(`no occurrence of ${String(token)}`, () => {
			const hits: string[] = [];
			for (const file of scanned) {
				const text = readFileSync(file, "utf8");
				const found = typeof token === "string" ? text.includes(token) : token.test(text);
				if (found) hits.push(file);
			}
			expect(hits).toEqual([]);
		});
	}
});

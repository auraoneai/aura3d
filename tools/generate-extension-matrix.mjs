#!/usr/bin/env node
/**
 * generate-extension-matrix.mjs — PRD-04 P6-2 / R17 truthful matrix.
 *
 * Regenerates the support-status tokens of the material-extension entries in
 *   packages/assets/src/GLTFExtensionSupport.ts  (GLTF_EXTENSION_SUPPORT_MATRIX)
 *   packages/engine/src/material-physical/PhysicalMaterialSpec.ts (PHYSICAL_EXTENSION_MATRIX)
 * from tests/reports/material-conformance.json (§15.3), which the lane browser
 * job produces. Descriptions, families and publicApi lists stay human-owned —
 * the tool only rewrites each entry's status field.
 *
 * Rule (PRD-04 §14 P6-2): an extension is conformant (runtime-supported /
 * supported) only with a passing probe AND an integrated G-PANEL scene result
 * (extensions.<name>.passed === true && qrFlags === "integrated" &&
 * gpanelJudgementId). Until then it is at most approximate
 * (parsed-with-limits / bounded). Entries the conformance report does not
 * cover keep their existing status when it is already below approximate.
 *
 * Usage:
 *   node tools/generate-extension-matrix.mjs           # rewrite in place
 *   node tools/generate-extension-matrix.mjs --check   # exit 1 on drift
 *
 * Fails (exit 1) when the conformance report is missing or unparseable.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPORT = resolve("tests/reports/material-conformance.json");
const GLTF_TS = resolve("packages/assets/src/GLTFExtensionSupport.ts");
const PHYS_TS = resolve("packages/engine/src/material-physical/PhysicalMaterialSpec.ts");

const CHECK = process.argv.includes("--check");

if (!existsSync(REPORT)) {
	console.error(`generate-extension-matrix: missing ${REPORT}`);
	console.error("The lane browser job produces this report (prd04-chunk-conformance.spec.ts).");
	process.exit(1);
}

const report = JSON.parse(readFileSync(REPORT, "utf8"));
const extensions = report.extensions ?? {};

/** @returns {"conformant"|"approximate"|"unknown"} */
function verdict(name) {
	const record = extensions[name];
	if (!record || record.passed !== true) return "unknown";
	if (record.qrFlags === "integrated" && typeof record.gpanelJudgementId === "string" && record.gpanelJudgementId.length > 0) {
		return "conformant";
	}
	return "approximate";
}

// --- GLTF_EXTENSION_SUPPORT_MATRIX ---------------------------------------
// entry("NAME", "FAMILY", "STATUS", [...]) — only material-family entries are
// recomputed (lane-04's truthful scope); other families keep hand-maintained
// statuses until their lanes produce equivalent evidence.
const gsrc = readFileSync(GLTF_TS, "utf8");
let gDiffs = 0;
const gOut = gsrc.replace(
	/entry\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"/g,
	(full, name, family, status) => {
		if (family !== "material") return full;
		const v = verdict(name);
		let next = status;
		if (v === "conformant") next = "runtime-supported";
		else if (status !== "unsupported" && status !== "diagnostic-only") next = "parsed-with-limits";
		if (next !== status) gDiffs++;
		return `entry("${name}", "${family}", "${next}"`;
	}
);

// --- PHYSICAL_EXTENSION_MATRIX --------------------------------------------
// { extension: "id", support: "s", diagnostic: ... } — ids map onto
// KHR_materials_<id> entries in the conformance report.
const psrc = readFileSync(PHYS_TS, "utf8");
let pDiffs = 0;
const pOut = psrc.replace(
	/\{\s*extension:\s*"([^"]+)"\s*,\s*support:\s*"([^"]+)"/g,
	(full, id, support) => {
		const v = verdict(`KHR_materials_${id}`);
		let next = support;
		if (v === "conformant") next = "supported";
		else if (support !== "unsupported") next = "bounded";
		if (next !== support) pDiffs++;
		return `{ extension: "${id}", support: "${next}"`;
	}
);

if (CHECK) {
	let ok = true;
	if (gOut !== gsrc) {
		ok = false;
		console.error(`generate-extension-matrix --check: ${GLTF_TS} has ${gDiffs} stale status field(s)`);
	}
	if (pOut !== psrc) {
		ok = false;
		console.error(`generate-extension-matrix --check: ${PHYS_TS} has ${pDiffs} stale status field(s)`);
	}
	if (!ok) {
		console.error("Run `node tools/generate-extension-matrix.mjs` to regenerate.");
		process.exit(1);
	}
	console.log("generate-extension-matrix --check: matrices match the conformance report.");
} else {
	writeFileSync(GLTF_TS, gOut);
	writeFileSync(PHYS_TS, pOut);
	console.log(`generate-extension-matrix: wrote ${gDiffs} status change(s) to ${GLTF_TS}, ${pDiffs} to ${PHYS_TS}.`);
}

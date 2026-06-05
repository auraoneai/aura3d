#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

const outPath = resolve(
  appRoot,
  args.out ?? process.env.AURA_CLASH_USER_VISUAL_APPROVAL_OUT ?? "launch-evidence/visual-approval.json"
);
const screenshotMetaPath = resolve(
  appRoot,
  args.screenshotMeta ?? process.env.AURA_CLASH_SCREENSHOT_META_OUT ?? "launch-evidence/first-frame.json"
);
const reviewPackagePath = resolve(
  appRoot,
  args.reviewPackage ?? process.env.AURA_CLASH_REVIEW_PACKAGE_OUT ?? "launch-evidence/review-package.md"
);
const approvedBy = args.approvedBy ?? process.env.AURA_CLASH_APPROVED_BY;
const confirmed = args.confirmApproval === "1" || process.env.AURA_CLASH_VISUAL_APPROVAL_CONFIRMED === "1";

if (!approvedBy || approvedBy.trim().length === 0) {
  throw new Error("Missing approver. Set AURA_CLASH_APPROVED_BY or pass --approved-by.");
}

if (!confirmed) {
  throw new Error(
    "Visual approval was not confirmed. Set AURA_CLASH_VISUAL_APPROVAL_CONFIRMED=1 or pass --confirm-approval=1 after explicit user approval."
  );
}

if (!existsSync(screenshotMetaPath)) {
  throw new Error(`Missing screenshot metadata: ${screenshotMetaPath}`);
}

if (!existsSync(reviewPackagePath)) {
  throw new Error(`Missing review package: ${reviewPackagePath}`);
}

const screenshotMeta = JSON.parse(readFileSync(screenshotMetaPath, "utf8"));

if (screenshotMeta.ok !== true) {
  throw new Error(`Screenshot metadata must report ok:true before approval can be recorded: ${screenshotMetaPath}`);
}

const screenshotPath = resolve(
  appRoot,
  args.screenshot ?? screenshotMeta.screenshot ?? "launch-evidence/first-frame.png"
);

if (!existsSync(screenshotPath)) {
  throw new Error(`Missing screenshot image: ${screenshotPath}`);
}

const evidence = {
  ok: true,
  approved: true,
  gate: "Visual screenshot approved by user.",
  approvedBy: approvedBy.trim(),
  approvedAt: new Date().toISOString(),
  screenshot: toAppRelative(screenshotPath),
  screenshotMeta: toAppRelative(screenshotMetaPath),
  reviewPackage: toAppRelative(reviewPackagePath),
  screenshotSha256: sha256File(screenshotPath),
  screenshotSizeBytes: readFileSync(screenshotPath).byteLength,
  screenshotMetaSha256: sha256File(screenshotMetaPath),
  screenshotMetaSizeBytes: readFileSync(screenshotMetaPath).byteLength,
  reviewPackageSha256: sha256File(reviewPackagePath),
  reviewPackageSizeBytes: readFileSync(reviewPackagePath).byteLength,
  notes: args.notes ?? process.env.AURA_CLASH_VISUAL_APPROVAL_NOTES ?? "",
  source: "manual-user-approval-record",
  boundaries: [
    "This file records explicit human visual approval of the referenced screenshot and review package.",
    "It does not prove deployment, package smoke, local gates, or AuraVoice sample render approval."
  ]
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(`Aura Clash visual approval recorded: ${toAppRelative(outPath)}`);

function toAppRelative(path) {
  return relative(appRoot, path).replaceAll("\\", "/");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseArgs(values) {
  const parsed = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (!value.startsWith("--")) {
      continue;
    }

    const eqIndex = value.indexOf("=");
    if (eqIndex !== -1) {
      parsed[toCamel(value.slice(2, eqIndex))] = value.slice(eqIndex + 1);
      continue;
    }

    const key = toCamel(value.slice(2));
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = "1";
    }
  }

  return parsed;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

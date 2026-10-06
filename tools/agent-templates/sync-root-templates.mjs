#!/usr/bin/env node
// PRD-13 T3.14 — root `templates/` is a generated mirror of
// `packages/create-aura3d/templates` for every template name both trees share.
//
// Consumers read root `templates/` (`verify:templates` builds each dir in a
// fresh app; the root package `files` field ships the packaged starters), so
// the drifted copies are resynced rather than deleted. Root-only directories
// (framework starters, `production-*`, `external-parity-*`, `game-slice`,
// `asset-viewer`, `product-configurator`) are separate templates, not drifted
// mirrors, and are never touched.
//
// Usage:
//   node tools/agent-templates/sync-root-templates.mjs          # write mirror
//   node tools/agent-templates/sync-root-templates.mjs --check  # verify, exit 1 on drift
//   node tools/agent-templates/sync-root-templates.mjs --list   # list mirrored names

import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PACKAGED_DIR = join(ROOT, "packages", "create-aura3d", "templates");
const ROOT_DIR = join(ROOT, "templates");

// Same exclusions as the create-aura3d scaffold copy plus generated artifacts.
const EXCLUDED_PARTS = new Set(["node_modules", "dist", "test-results", "playwright-report", ".turbo"]);
const EXCLUDED_FILES = new Set(["tsconfig.tsbuildinfo"]);
const EXCLUDED_DIRS = new Set([join("tests", "reports")]);

function isExcluded(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts.some((part) => EXCLUDED_PARTS.has(part))) return true;
  if (EXCLUDED_FILES.has(parts[parts.length - 1])) return true;
  if (EXCLUDED_DIRS.has(join(...parts.slice(0, 2)))) return true;
  return false;
}

export function mirroredTemplateNames() {
  const packaged = new Set(readdirSync(PACKAGED_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
  return readdirSync(ROOT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => packaged.has(name))
    .sort();
}

function listFiles(dir, prefix = "") {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (isExcluded(rel)) continue;
    if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

export function drift(template) {
  const packagedDir = join(PACKAGED_DIR, template);
  const rootDir = join(ROOT_DIR, template);
  const findings = [];
  const packagedFiles = listFiles(packagedDir);
  const rootFiles = listFiles(rootDir);
  for (const rel of packagedFiles) {
    if (!rootFiles.includes(rel)) {
      findings.push(`templates/${template}/${rel} missing from root mirror`);
      continue;
    }
    const a = readFileSync(join(packagedDir, rel));
    const b = readFileSync(join(rootDir, rel));
    if (!a.equals(b)) findings.push(`templates/${template}/${rel} differs from packaged source`);
  }
  for (const rel of rootFiles) {
    if (!packagedFiles.includes(rel)) findings.push(`templates/${template}/${rel} has no packaged source (stale mirror file)`);
  }
  return findings;
}

export function sync(template) {
  const packagedDir = join(PACKAGED_DIR, template);
  const rootDir = join(ROOT_DIR, template);
  // Remove files the packaged source no longer carries so stale mirror files
  // can't linger, then copy the packaged tree over.
  for (const rel of listFiles(rootDir)) {
    if (!existsSync(join(packagedDir, rel))) rmSync(join(rootDir, rel));
  }
  cpSync(packagedDir, rootDir, {
    recursive: true,
    filter: (source) => !isExcluded(relative(packagedDir, source))
  });
}

function main() {
  const args = process.argv.slice(2);
  const names = mirroredTemplateNames();
  if (args.includes("--list")) {
    console.log(names.join("\n"));
    return;
  }
  if (args.includes("--check")) {
    const findings = names.flatMap((name) => drift(name));
    if (findings.length === 0) {
      console.log(`sync-root-templates: ${names.length} root templates mirror packaged sources`);
      return;
    }
    console.error(`sync-root-templates: ${findings.length} drift finding(s)`);
    for (const finding of findings) console.error(`  - ${finding}`);
    process.exit(1);
  }
  for (const name of names) sync(name);
  console.log(`sync-root-templates: mirrored ${names.length} templates to templates/`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();

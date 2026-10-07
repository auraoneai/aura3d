#!/usr/bin/env node
/**
 * CLI shim for the camera-cast codemod (PRD-08 §9.3).
 * Implementation lives in `./index.ts`; Node ≥22.18 runs it via type stripping.
 *
 *   node tools/camera-cast-codemod/index.mjs <dir-or-file>… [--report|--write|--dry-run]
 */
import { main } from "./index.ts";

const code = main(process.argv.slice(2));
process.exitCode = code;

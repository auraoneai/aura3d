#!/usr/bin/env node
// aura3d-mcp [--project <dir>]   stdio MCP server. stdout carries protocol messages only; diagnostics go to stderr.
import { resolve } from "node:path";
import { createKnowledge, loadBundle } from "./docs.js";
import { serveStdio } from "./protocol.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.error("aura3d-mcp [--project <dir>]\nStdio MCP server for Aura3D. Env: AURA3D_PROJECT_DIR, AURA3D_MCP_DOCS_BUNDLE, AURA3D_MCP_NO_NPX=1.");
  process.exit(0);
}
const projectIndex = args.indexOf("--project");
const defaultProjectDir = resolve(projectIndex >= 0 && args[projectIndex + 1] ? args[projectIndex + 1]! : process.env.AURA3D_PROJECT_DIR ?? process.cwd());
const knowledge = createKnowledge(loadBundle());
void serveStdio({ knowledge, defaultProjectDir }).then(() => process.exit(0));

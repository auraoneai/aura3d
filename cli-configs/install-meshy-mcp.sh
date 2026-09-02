#!/usr/bin/env bash
set -eu

PACKAGE="@meshy-ai/meshy-mcp-server@0.5.1"
CONFIG_PATH="${MESHY_MCP_CONFIG:-}"
CLIENT_NAME="custom JSON client"
CHECK_ONLY=false

usage() {
  cat <<'USAGE'
Usage: install-meshy-mcp.sh [--check] [--client NAME] --config PATH

Merge the pinned Meshy MCP server into an existing MCP JSON configuration.
MESHY_MCP_CONFIG may supply PATH instead of --config. The script configures an
exact npx package pin; it does not contact npm or start the server.

Options:
  --check          Validate only; do not create directories, files, or backups
  --client NAME    Label used in status output (default: custom JSON client)
  --config PATH    MCP JSON file containing an mcpServers object
  -h, --help       Show this help
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY=true; shift ;;
    --client)
      [ "$#" -ge 2 ] || { echo "error: --client requires a value" >&2; exit 2; }
      CLIENT_NAME=$2; shift 2 ;;
    --config)
      [ "$#" -ge 2 ] || { echo "error: --config requires a path" >&2; exit 2; }
      CONFIG_PATH=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$CONFIG_PATH" ] || {
  echo "error: pass --config PATH or set MESHY_MCP_CONFIG" >&2
  exit 2
}
command -v node >/dev/null 2>&1 || {
  echo "error: Node.js 18 or newer is required" >&2
  exit 3
}
NODE_MAJOR=$(node --version | sed 's/^v//' | cut -d. -f1)
case "$NODE_MAJOR" in
  ''|*[!0-9]*) echo "error: could not determine the Node.js version" >&2; exit 3 ;;
esac
[ "$NODE_MAJOR" -ge 18 ] || {
  echo "error: Node.js 18 or newer is required (found v$NODE_MAJOR)" >&2
  exit 3
}
command -v npx >/dev/null 2>&1 || {
  echo "error: npx is required to launch $PACKAGE" >&2
  exit 3
}

MODE=install
$CHECK_ONLY && MODE=check

node - "$CONFIG_PATH" "$MODE" "$CLIENT_NAME" "$PACKAGE" <<'NODE'
const {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync,
  renameSync, statSync, unlinkSync, writeFileSync,
} = require("node:fs");
const { dirname, resolve } = require("node:path");

const configPath = resolve(process.argv[2]);
const mode = process.argv[3];
const clientName = process.argv[4];
const packagePin = process.argv[5];
const keyPrefix = ["m", "sy_"].join("");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function fail(message, code = 1) {
  console.error("error: " + message);
  process.exit(code);
}
function containsCredential(value) {
  if (typeof value === "string") return value.startsWith(keyPrefix);
  if (Array.isArray(value)) return value.some(containsCredential);
  if (isObject(value)) return Object.values(value).some(containsCredential);
  return false;
}

const existed = existsSync(configPath);
let source = "{}\n";
if (existed) {
  try { source = readFileSync(configPath, "utf8"); }
  catch { fail("cannot read MCP configuration: " + configPath); }
}
let config;
try { config = JSON.parse(source); }
catch { fail("MCP configuration is not valid JSON: " + configPath); }
if (!isObject(config)) fail("MCP configuration root must be a JSON object");
if (config.mcpServers !== undefined && !isObject(config.mcpServers)) fail("mcpServers must be a JSON object");
if (containsCredential(config)) {
  fail("configuration contains a credential-like value; remove it and inject MESHY_API_KEY at runtime");
}

const servers = config.mcpServers || {};
const current = servers.meshy;
if (current !== undefined && !isObject(current)) fail("mcpServers.meshy must be a JSON object");
const expectedArgs = ["-y", packagePin];
const configured = isObject(current)
  && current.command === "npx"
  && Array.isArray(current.args)
  && current.args.length === expectedArgs.length
  && current.args.every((value, index) => value === expectedArgs[index]);

if (mode === "check") {
  if (!existed) fail("MCP configuration does not exist: " + configPath);
  if (!configured) fail("Meshy MCP is not configured with " + packagePin + " in " + configPath);
  console.log("Meshy MCP configuration is current for " + clientName + ": " + configPath);
  console.log("MESHY_API_KEY must be supplied by the process environment at server startup.");
  process.exit(0);
}
if (configured) {
  console.log("Meshy MCP configuration is already current for " + clientName + ": " + configPath);
  console.log("MESHY_API_KEY must be supplied by the process environment at server startup.");
  process.exit(0);
}

const next = {
  ...config,
  mcpServers: {
    ...servers,
    meshy: {
      ...(isObject(current) ? current : {}),
      command: "npx",
      args: expectedArgs,
    },
  },
};
if (containsCredential(next)) fail("refusing to write a credential-like value");
const rendered = JSON.stringify(next, null, 2) + "\n";
const parent = dirname(configPath);
mkdirSync(parent, { recursive: true, mode: 0o700 });

let backupPath = null;
if (existed) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  backupPath = configPath + ".bak." + stamp;
  let suffix = 0;
  while (existsSync(backupPath)) backupPath = configPath + ".bak." + stamp + "." + (++suffix);
  copyFileSync(configPath, backupPath);
}

const temporaryPath = configPath + ".tmp." + process.pid;
try {
  writeFileSync(temporaryPath, rendered, {
    encoding: "utf8",
    mode: existed ? (statSync(configPath).mode & 0o777) : 0o600,
  });
  JSON.parse(readFileSync(temporaryPath, "utf8"));
  renameSync(temporaryPath, configPath);
  if (!existed) chmodSync(configPath, 0o600);
} catch {
  try { unlinkSync(temporaryPath); } catch {}
  fail("could not write and validate the MCP configuration");
}

console.log("Configured Meshy MCP for " + clientName + ": " + configPath);
if (backupPath) console.log("Backup: " + backupPath);
console.log("MESHY_API_KEY must be supplied by the process environment at server startup.");
NODE

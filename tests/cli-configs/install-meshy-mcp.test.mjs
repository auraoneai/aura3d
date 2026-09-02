import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const installer = join(repositoryRoot, "cli-configs/install-meshy-mcp.sh");
const temporaryRoots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "aura3d-meshy-mcp-"));
  temporaryRoots.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  const invocationLog = join(root, "npx-invocations.log");
  writeFileSync(join(bin, "node"), `#!/bin/sh\nexec "${process.execPath}" "$@"\n`);
  writeFileSync(join(bin, "npx"), `#!/bin/sh\necho invoked >> "${invocationLog}"\nexit 99\n`);
  chmodSync(join(bin, "node"), 0o755);
  chmodSync(join(bin, "npx"), 0o755);
  return { root, bin, invocationLog, config: join(root, "client/mcp.json") };
}

function run(args, bin, extraEnv = {}) {
  return spawnSync("bash", [installer, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv, PATH: `${bin}:${process.env.PATH || ""}` },
  });
}

function backups(config) {
  try {
    return readdirSync(dirname(config)).filter((name) => name.startsWith("mcp.json.bak."));
  } catch {
    return [];
  }
}

function readFileOrEmpty(path) {
  try { return readFileSync(path, "utf8"); }
  catch { return ""; }
}

test.afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("merges the exact pin while preserving existing configuration and backing up", () => {
  const f = fixture();
  mkdirSync(dirname(f.config), { recursive: true });
  const original = {
    theme: "dark",
    mcpServers: {
      existing: { command: "existing-server", args: ["--safe"] },
      meshy: { transport: "stdio", timeout: 30 },
    },
  };
  writeFileSync(f.config, JSON.stringify(original, null, 2));

  const result = run(["--config", f.config, "--client", "TestClient"], f.bin);
  assert.equal(result.status, 0, result.stderr);
  const merged = JSON.parse(readFileSync(f.config, "utf8"));
  assert.equal(merged.theme, "dark");
  assert.deepEqual(merged.mcpServers.existing, original.mcpServers.existing);
  assert.equal(merged.mcpServers.meshy.transport, "stdio");
  assert.equal(merged.mcpServers.meshy.timeout, 30);
  assert.equal(merged.mcpServers.meshy.command, "npx");
  assert.deepEqual(merged.mcpServers.meshy.args, ["-y", "@meshy-ai/meshy-mcp-server@0.5.1"]);
  assert.equal(backups(f.config).length, 1);
  const backup = JSON.parse(readFileSync(join(dirname(f.config), backups(f.config)[0]), "utf8"));
  assert.deepEqual(backup, original);
  assert.match(result.stdout, /TestClient/);
  assert.equal(readFileOrEmpty(f.invocationLog), "");
});

test("is idempotent and does not create another backup", () => {
  const f = fixture();
  mkdirSync(dirname(f.config), { recursive: true });
  writeFileSync(f.config, JSON.stringify({ mcpServers: { other: { command: "other" } } }));
  const first = run(["--config", f.config], f.bin);
  assert.equal(first.status, 0, first.stderr);
  const afterFirst = readFileSync(f.config, "utf8");
  assert.equal(backups(f.config).length, 1);

  const second = run(["--config", f.config], f.bin);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readFileSync(f.config, "utf8"), afterFirst);
  assert.equal(backups(f.config).length, 1);
  assert.match(second.stdout, /already current/);
});

test("check mode reports drift without any mutation", () => {
  const f = fixture();
  mkdirSync(dirname(f.config), { recursive: true });
  const source = JSON.stringify({ mcpServers: { other: { command: "other" } } });
  writeFileSync(f.config, source);

  const result = run(["--check", "--config", f.config], f.bin);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(f.config, "utf8"), source);
  assert.deepEqual(backups(f.config), []);
  assert.equal(readFileOrEmpty(f.invocationLog), "");
});

test("check mode accepts the exact pin without mutation", () => {
  const f = fixture();
  mkdirSync(dirname(f.config), { recursive: true });
  const source = JSON.stringify({
    retained: true,
    mcpServers: { meshy: { command: "npx", args: ["-y", "@meshy-ai/meshy-mcp-server@0.5.1"] } },
  });
  writeFileSync(f.config, source);

  const result = run(["--check", "--config", f.config], f.bin);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(f.config, "utf8"), source);
  assert.deepEqual(backups(f.config), []);
});

test("refuses credential-like existing values without disclosing them", () => {
  const f = fixture();
  mkdirSync(dirname(f.config), { recursive: true });
  const secret = ["m", "sy_", "SYNTHETIC_DO_NOT_USE"].join("");
  const source = JSON.stringify({ mcpServers: { meshy: { env: { MESHY_API_KEY: secret } } } });
  writeFileSync(f.config, source);

  const result = run(["--config", f.config], f.bin);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(f.config, "utf8"), source);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
  assert.deepEqual(backups(f.config), []);
});

test("creates a private config and obtains the path from the environment", () => {
  const f = fixture();
  const result = run([], f.bin, { MESHY_MCP_CONFIG: f.config });
  assert.equal(result.status, 0, result.stderr);
  const created = JSON.parse(readFileSync(f.config, "utf8"));
  assert.deepEqual(created, {
    mcpServers: {
      meshy: { command: "npx", args: ["-y", "@meshy-ai/meshy-mcp-server@0.5.1"] },
    },
  });
  assert.deepEqual(backups(f.config), []);
  assert.equal(readFileOrEmpty(f.invocationLog), "");
});

test("rejects invalid JSON without mutation or backup", () => {
  const f = fixture();
  mkdirSync(dirname(f.config), { recursive: true });
  writeFileSync(f.config, "{ invalid");
  const result = run(["--config", f.config], f.bin);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(f.config, "utf8"), "{ invalid");
  assert.deepEqual(backups(f.config), []);
});

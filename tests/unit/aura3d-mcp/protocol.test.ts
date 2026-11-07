import { spawn } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, expect, it } from "vitest";
import { createServer, SUPPORTED_PROTOCOLS } from "../../../packages/aura3d-mcp/src/protocol.js";
import { context, makeProject, repoRoot } from "./helpers.js";

type Reply = { result?: Record<string, unknown>; error?: { code: number } };

describe("MCP protocol (in process)", () => {
  const server = createServer(context(makeProject()));
  it("negotiates the protocol version", async () => {
    const ok = await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
    expect((ok?.result as { protocolVersion: string }).protocolVersion).toBe("2024-11-05");
    const other = await server.handle({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
    expect((other?.result as { protocolVersion: string }).protocolVersion).toBe(SUPPORTED_PROTOCOLS[0]);
  });
  it("answers errors with JSON-RPC codes and stays silent on notifications", async () => {
    expect((await server.handle({ jsonrpc: "2.0", id: 3, method: "nope" }))?.error?.code).toBe(-32601);
    expect((await server.handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } }))?.error?.code).toBe(-32602);
    expect(await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeUndefined();
    expect((await server.handle("garbage"))?.error?.code).toBe(-32600);
  });
});

describe("MCP protocol conformance over stdio", () => {
  it("spawns the server and speaks initialize, tools, resources", async () => {
    const project = makeProject();
    const child = spawn(process.execPath, ["--import", "tsx", join(repoRoot, "packages/aura3d-mcp/src/cli.ts")], { cwd: repoRoot, env: { ...process.env, AURA3D_PROJECT_DIR: project }, stdio: ["pipe", "pipe", "pipe"] });
    const replies = new Map<number, Reply>();
    const waiters = new Map<number, () => void>();
    const extraneous: string[] = [];
    createInterface({ input: child.stdout }).on("line", (line) => {
      let msg: { id?: number };
      try {
        msg = JSON.parse(line) as { id?: number };
      } catch {
        extraneous.push(line);
        return;
      }
      if (typeof msg.id === "number") {
        replies.set(msg.id, msg as Reply);
        waiters.get(msg.id)?.();
      }
    });
    const rpc = (id: number, method: string, params: Record<string, unknown> = {}): Promise<Reply> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 45_000);
        waiters.set(id, () => {
          clearTimeout(timer);
          resolve(replies.get(id)!);
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    try {
      const init = await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
      expect(init.result?.serverInfo).toMatchObject({ name: "aura3d-mcp" });
      expect(init.result?.capabilities).toHaveProperty("tools");
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
      const list = await rpc(2, "tools/list");
      const names = (list.result?.tools as Array<{ name: string }>).map((t) => t.name).sort();
      expect(names).toEqual(["assets_inspect", "assets_resolve", "check_deploy", "explain_error", "get_recipe", "get_symbol", "scaffold", "search_docs"]);
      const sym = await rpc(3, "tools/call", { name: "get_symbol", arguments: { name: "createAuraApp" } });
      expect(JSON.stringify(sym.result)).toContain("9.9.9-fixture");
      const err = await rpc(4, "tools/call", { name: "explain_error", arguments: { code: "KTX2_CSP_BLOCKED" } });
      expect(JSON.stringify(err.result)).toContain("unsafe-eval");
      const res = await rpc(5, "resources/list");
      expect((res.result?.resources as Array<{ uri: string }>).map((r) => r.uri)).toContain("aura3d://llms.txt");
      const read = await rpc(6, "resources/read", { uri: "aura3d://llms.txt" });
      expect(JSON.stringify(read.result)).toContain("aura3d-mcp docs@");
      expect((await rpc(7, "resources/read", { uri: "aura3d://nope" })).error?.code).toBe(-32002);
      expect((await rpc(8, "ping")).result).toEqual({});
      expect(extraneous).toEqual([]);
    } finally {
      child.stdin.end();
      await new Promise((resolve) => child.on("close", resolve));
    }
  }, 90_000);
});

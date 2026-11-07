// MCP condition (lane 511): the model gets the @aura3d/mcp knowledge tools, served by the real stdio server
// (initialize, tools/list, tools/call over newline-delimited JSON-RPC), one server process per run bound to the sandbox
// project. Only the tools that make sense in a no-shell sandbox are exposed: get_symbol, search_docs, get_recipe, explain_error.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const EXPOSED = new Set(["get_symbol", "search_docs", "get_recipe", "explain_error"]);

export async function startMcp({ projectDir, serverCmd, serverArgs, bundlePath }) {
  const child = spawn(serverCmd, serverArgs, {
    cwd: projectDir,
    env: { ...process.env, AURA3D_PROJECT_DIR: projectDir, AURA3D_MCP_DOCS_BUNDLE: bundlePath },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let nextId = 1;
  const pending = new Map();
  createInterface({ input: child.stdout }).on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const waiter = pending.get(msg.id);
    if (waiter) {
      pending.delete(msg.id);
      waiter(msg);
    }
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`mcp ${method} timed out`)), 60000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "agent-eval", version: "1" } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const listed = await rpc("tools/list");
  const tools = listed.result.tools.filter((t) => EXPOSED.has(t.name)).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  return {
    tools,
    names: new Set(tools.map((t) => t.name)),
    async call(name, args) {
      // The sandbox project is fixed; the model may not redirect the server.
      const { projectDir: _ignored, ...safe } = args ?? {};
      const reply = await rpc("tools/call", { name, arguments: safe });
      if (reply.error) return { text: reply.error.message, isError: true };
      return { text: reply.result.content.map((c) => c.text).join("\n"), isError: reply.result.isError === true };
    },
    close() {
      child.stdin.end();
      child.kill();
    }
  };
}

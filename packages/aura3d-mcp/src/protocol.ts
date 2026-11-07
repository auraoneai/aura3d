// Minimal MCP over newline-delimited JSON-RPC 2.0 on stdio. The official @modelcontextprotocol/sdk is not in the
// offline pnpm store, so the handful of methods an agent client needs are implemented directly:
// initialize, notifications/initialized, ping, tools/list, tools/call, resources/list, resources/read.
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { RESOURCES, TOOLS, type ToolContext } from "./tools.js";

export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_INFO = { name: "aura3d-mcp", version: "5.0.2" } as const;

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const fail = (id: RpcRequest["id"], code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export function createServer(ctx: ToolContext): { handle(message: unknown): Promise<RpcResponse | undefined> } {
  return {
    async handle(message) {
      if (!message || typeof message !== "object" || Array.isArray(message)) return fail(null, -32600, "Invalid Request");
      const req = message as RpcRequest;
      const isNotification = req.id === undefined;
      if (typeof req.method !== "string") return isNotification ? undefined : fail(req.id, -32600, "Invalid Request: method missing");
      const params = req.params ?? {};
      const ok = (result: unknown): RpcResponse | undefined => (isNotification ? undefined : { jsonrpc: "2.0", id: req.id ?? null, result });
      switch (req.method) {
        case "initialize": {
          const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : undefined;
          const protocolVersion = asked && (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
          return ok({
            protocolVersion,
            capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
            serverInfo: SERVER_INFO,
            instructions: "Version-pinned Aura3D knowledge. Prefer get_symbol for exact signatures, get_recipe or search_docs before writing a scene, and explain_error for any Aura3D error code. Every answer names the docs and installed package versions."
          });
        }
        case "ping":
          return ok({});
        case "tools/list":
          return ok({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
        case "tools/call": {
          const name = params.name;
          const tool = TOOLS.find((t) => t.name === name);
          if (!tool) return isNotification ? undefined : fail(req.id, -32602, `Unknown tool: ${String(name)}`);
          const args = params.arguments && typeof params.arguments === "object" ? (params.arguments as Record<string, unknown>) : {};
          try {
            const result = await tool.call(args, ctx);
            return ok({ content: [{ type: "text", text: result.text }], isError: result.isError === true });
          } catch (error) {
            return ok({ content: [{ type: "text", text: `${tool.name} failed: ${(error as Error).message}` }], isError: true });
          }
        }
        case "resources/list":
          return ok({ resources: RESOURCES.map((r) => ({ uri: r.uri, name: r.name, description: r.description, mimeType: r.path.endsWith(".md") ? "text/markdown" : "text/plain" })) });
        case "resources/read": {
          const resource = RESOURCES.find((r) => r.uri === params.uri);
          const text = resource ? ctx.knowledge.file(resource.path) : undefined;
          if (!resource || text === undefined) return isNotification ? undefined : fail(req.id, -32002, `Resource not found: ${String(params.uri)}`);
          const stamped = `<!-- aura3d-mcp docs@${ctx.knowledge.bundle.docsVersion} -->\n${text}`;
          return ok({ contents: [{ uri: resource.uri, mimeType: resource.path.endsWith(".md") ? "text/markdown" : "text/plain", text: stamped }] });
        }
        default:
          if (req.method.startsWith("notifications/")) return undefined;
          return isNotification ? undefined : fail(req.id, -32601, `Method not found: ${req.method}`);
      }
    }
  };
}

export function serveStdio(ctx: ToolContext, input: Readable = process.stdin, output: Writable = process.stdout): Promise<void> {
  const server = createServer(ctx);
  const rl = createInterface({ input, crlfDelay: Infinity });
  const pending = new Set<Promise<void>>();
  rl.on("line", (line) => {
    if (!line.trim()) return;
    const work = (async () => {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        output.write(`${JSON.stringify(fail(null, -32700, "Parse error"))}\n`);
        return;
      }
      const reply = await server.handle(message);
      if (reply) output.write(`${JSON.stringify(reply)}\n`);
    })();
    pending.add(work);
    void work.finally(() => pending.delete(work));
  });
  return new Promise((resolvePromise) => rl.on("close", () => void Promise.all(pending).then(() => resolvePromise())));
}

// C1 native and bridge arms: the `aura3d` tool, which gives the agent the N6 CLI agent tools of the installed
// `@aura3d/cli` (info, examples, validate, render; docs/agents/agent-tools.md). The agent has no shell, so this is the
// only way it reaches them. `render` builds the project, screenshots it in a local headless Chrome over loopback CDP
// (the CLI's own driver, no Playwright) and returns its JSON report plus the screenshot as an image block, which is what
// "open the PNG it saves" means for an agent that cannot open files. Everything here runs inside the run's tool time.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveInside } from "../lib/sandbox.mjs";

export const AURA3D_COMMANDS = ["info", "examples", "validate", "render"];
const RENDER_OUT = ".aura3d/render.png";
const MAX_TEXT = 8000;

export const AURA3D_TOOL = {
  name: "aura3d",
  description:
    "Run an Aura3D CLI agent tool in this project (see docs/agents/agent-tools.md). Commands: `info` (installed versions and engine API surface; args [\"--name\", \"material.pbr\"] for one builder's signature and option keys), `examples` (args [\"<query>\"]: best matching working recipe or template with its source; [\"--id\", \"<id>\", \"--write\", \"src/main.ts\"] saves one), `validate` (static checks of src/ in about a second: colours, unknown options and members, framing, lighting), `render` (vite build, headless Chrome screenshot and diagnostics; returns the JSON report and the screenshot image).",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", enum: AURA3D_COMMANDS },
      args: { type: "array", items: { type: "string" }, description: "Arguments after the command, one string each" }
    },
    required: ["command"]
  }
};

/** Reject arguments that reach outside the project or swap the browser; paths a command writes must stay in src/ or .aura3d/. */
export function checkArgs(command, args, dir) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = String(args[i]);
    const prev = String(args[i - 1] ?? "");
    if (a === "--chrome") throw new Error("--chrome is not available here; render uses the local Chrome");
    if (prev === "--url") {
      if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(a)) throw new Error("--url must be a loopback http URL");
    } else if (prev === "--write") {
      if (!/^src\/[\w./-]+\.ts$/.test(a)) throw new Error("--write must name a .ts file under src/");
      resolveInside(dir, a);
    } else if (prev === "--out") {
      if (!/^\.aura3d\/[\w.-]+\.png$/.test(a)) throw new Error("--out must be a .png under .aura3d/");
    } else if (a.startsWith("/") || a.split(/[\\/]/).includes("..")) {
      throw new Error(`argument ${a} leaves the project`);
    }
    out.push(a);
  }
  if (command === "render") {
    if (!out.includes("--json")) out.push("--json");
    if (!out.includes("--out")) out.push("--out", RENDER_OUT);
  }
  return out;
}

const clip = (text) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[truncated]` : text);

/**
 * Returns a handler (input) => string | content blocks. `record(event)` receives { type: "aura3d", command, exit, ms }.
 * `images: false` (AGENT_EVAL_RENDER_IMAGE=0) returns the render report without the screenshot.
 */
export function createAura3dHandler({ dir, record = () => {}, run = execFileSync, now = () => Date.now(), images = process.env.AGENT_EVAL_RENDER_IMAGE !== "0" }) {
  const bin = join(dir, "node_modules/.bin/aura3d");
  return function aura3d(input = {}) {
    const command = String(input.command ?? "");
    if (!AURA3D_COMMANDS.includes(command)) throw new Error(`command must be one of ${AURA3D_COMMANDS.join(", ")}`);
    const args = checkArgs(command, Array.isArray(input.args) ? input.args : [], dir);
    const started = now();
    let stdout = "";
    let exit = 0;
    try {
      stdout = String(run(bin, [command, ...args], { cwd: dir, encoding: "utf8", timeout: 240000, maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } }));
    } catch (error) {
      if (error.status == null) {
        record({ type: "aura3d", command, exit: null, ms: now() - started });
        throw new Error(`aura3d ${command} did not run: ${String(error.message).slice(0, 300)}`);
      }
      exit = error.status;
      stdout = `${error.stdout ?? ""}${error.stderr ? `\n${error.stderr}` : ""}`;
    }
    record({ type: "aura3d", command, exit, ms: now() - started });
    if (command !== "render") return clip(`exit ${exit}\n${stdout.trim()}`);
    let report = null;
    try {
      report = JSON.parse(stdout.slice(stdout.indexOf("{")));
    } catch {
      return clip(`exit ${exit}\n${stdout.trim()}`);
    }
    const shot = join(dir, args[args.indexOf("--out") + 1]);
    // Absolute sandbox paths mean nothing to the agent; show project-relative ones.
    const text = clip(`exit ${exit}\n${JSON.stringify(report)}`.split(`/private${dir}/`).join("").split(`${dir}/`).join(""));
    if (!images || !existsSync(shot)) return text;
    return [
      { type: "text", text },
      { type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(shot).toString("base64") } }
    ];
  };
}

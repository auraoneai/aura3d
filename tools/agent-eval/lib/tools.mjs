import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { resolveInside, writeSnapshot } from "./sandbox.mjs";

export const TOOL_DEFINITIONS = [
  {
    name: "list_dir",
    description: "List a directory inside the project (relative path, '.' for the root).",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
  },
  {
    name: "read_file",
    description: "Read a text file with line numbers. Large files are paged: pass offset (1-based line) and limit.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, offset: { type: "integer" }, limit: { type: "integer" } },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Create or overwrite a file. Writable: src/**, index.html, vite.config.ts.",
    input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] }
  },
  {
    name: "edit_file",
    description: "Replace one exact occurrence of old_string with new_string in a writable file.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } },
      required: ["path", "old_string", "new_string"]
    }
  },
  {
    name: "search",
    description: "Regex search (ripgrep) over readable files. Optional path narrows the search (file or directory).",
    input_schema: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] }
  },
  {
    name: "typecheck",
    description: "Run the TypeScript compiler (tsc --noEmit) on the project and return its output.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "finish",
    description: "Call when the task is complete and you are done. Give a one-paragraph summary.",
    input_schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] }
  }
];

const WRITABLE = [/^src\//, /^index\.html$/, /^vite\.config\.ts$/];
const READABLE_NODE_MODULES = ["node_modules/@aura3d", "node_modules/three", "node_modules/@types/three"];
const DOC_PREFIXES = ["llms.txt", "AGENTS.md", "docs/", ".agents/"];
const MAX_READ_CHARS = 14000;

const norm = (p) => p.replaceAll("\\", "/").replace(/^\.\//, "");

export function createToolbox({ dir, snapshotRoot, now = () => Date.now(), runTsc }) {
  const started = now();
  const events = [];
  const docsOpened = new Set();
  const typesOpened = new Set();
  const state = { finished: false, summary: null, draftTaken: false, draftIsFinal: false };

  const record = (event) => events.push({ i: events.length, t: now() - started, ...event });

  function readableRel(input) {
    const rel = norm(String(input ?? "."));
    resolveInside(dir, rel);
    if (rel.startsWith("node_modules")) {
      const ok = READABLE_NODE_MODULES.some((root) => rel === root || rel.startsWith(`${root}/`)) || rel === "node_modules" || rel === "node_modules/@types";
      if (!ok) throw new Error(`reading ${rel} is not allowed (only @aura3d/*, three and @types/three are readable)`);
    }
    return rel;
  }

  function tsc() {
    if (runTsc) return runTsc(dir);
    try {
      const out = execFileSync(join(dir, "node_modules/.bin/tsc"), ["--noEmit", "-p", "tsconfig.json", "--pretty", "false"], {
        cwd: dir,
        encoding: "utf8",
        timeout: 90000,
        maxBuffer: 1 << 24,
        stdio: ["ignore", "pipe", "pipe"]
      });
      return { pass: true, output: out.trim() };
    } catch (error) {
      const out = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim() || String(error.message);
      return { pass: false, output: out };
    }
  }

  function takeSnapshot(name) {
    return writeSnapshot(dir, join(snapshotRoot, name));
  }

  const handlers = {
    list_dir({ path }) {
      const rel = readableRel(path ?? ".");
      const full = resolveInside(dir, rel);
      const names = readdirSync(full, { withFileTypes: true })
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .sort();
      record({ type: "list", path: rel });
      return names.join("\n") || "(empty)";
    },
    read_file({ path, offset = 1, limit = 300 }) {
      const rel = readableRel(path);
      const full = resolveInside(dir, rel);
      if (!existsSync(full) || statSync(full).isDirectory()) throw new Error(`${rel} is not a file`);
      const lines = readFileSync(full, "utf8").split("\n");
      const start = Math.max(1, offset);
      let out = "";
      let end = start - 1;
      for (let n = start; n <= Math.min(lines.length, start - 1 + Math.max(1, limit)); n += 1) {
        const piece = `${n}\t${lines[n - 1]}\n`;
        if (out.length + piece.length > MAX_READ_CHARS) break;
        out += piece;
        end = n;
      }
      if (end < lines.length) out += `[showing lines ${start}-${end} of ${lines.length}; pass offset=${end + 1} to continue]`;
      if (DOC_PREFIXES.some((p) => rel === p || rel.startsWith(p))) docsOpened.add(rel);
      else if (rel.startsWith("node_modules/")) typesOpened.add(rel);
      record({ type: "read", path: rel, lines: end - start + 1 });
      return out;
    },
    write_file({ path, content }) {
      const rel = norm(String(path));
      if (!WRITABLE.some((re) => re.test(rel))) throw new Error(`${rel} is not writable (writable: src/**, index.html, vite.config.ts)`);
      const full = resolveInside(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, String(content));
      record({ type: "write", tool: "write_file", path: rel, bytes: Buffer.byteLength(String(content)) });
      return `wrote ${rel} (${String(content).split("\n").length} lines)`;
    },
    edit_file({ path, old_string, new_string }) {
      const rel = norm(String(path));
      if (!WRITABLE.some((re) => re.test(rel))) throw new Error(`${rel} is not writable (writable: src/**, index.html, vite.config.ts)`);
      const full = resolveInside(dir, rel);
      if (!existsSync(full)) throw new Error(`${rel} does not exist`);
      const text = readFileSync(full, "utf8");
      const count = text.split(old_string).length - 1;
      if (count !== 1) throw new Error(`old_string must occur exactly once in ${rel} (found ${count})`);
      writeFileSync(full, text.replace(old_string, () => new_string));
      record({ type: "write", tool: "edit_file", path: rel });
      return `edited ${rel}`;
    },
    search({ pattern, path }) {
      const rels = path ? [readableRel(path)] : ["src", "docs", "llms.txt", "AGENTS.md", ".agents", ...READABLE_NODE_MODULES].filter((p) => existsSync(join(dir, p)));
      try {
        const out = execFileSync("rg", ["-n", "--no-heading", "-L", "-m", "6", "--max-columns", "180", "-g", "!*.map", "-g", "!*.glb", "--", pattern, ...rels], {
          cwd: dir,
          encoding: "utf8",
          timeout: 30000,
          maxBuffer: 1 << 24,
          stdio: ["ignore", "pipe", "pipe"]
        });
        const lines = out.split("\n").slice(0, 60).join("\n");
        record({ type: "search", pattern: String(pattern).slice(0, 80) });
        return lines.length > 8000 ? `${lines.slice(0, 8000)}\n[truncated]` : lines || "(no matches)";
      } catch (error) {
        if (error.status === 1) {
          record({ type: "search", pattern: String(pattern).slice(0, 80) });
          return "(no matches)";
        }
        throw new Error(`search failed: ${String(error.stderr ?? error.message).slice(0, 200)}`);
      }
    },
    typecheck() {
      if (!state.draftTaken) {
        takeSnapshot("draft");
        state.draftTaken = true;
      }
      const result = tsc();
      record({ type: "typecheck", pass: result.pass });
      const out = result.output.length > 6000 ? `${result.output.slice(0, 6000)}\n[truncated]` : result.output;
      return result.pass ? "typecheck passed (no errors)" : out;
    },
    finish({ summary }) {
      state.finished = true;
      state.summary = String(summary ?? "").slice(0, 2000);
      record({ type: "finish" });
      return "ok";
    }
  };

  function exec(name, input) {
    const handler = handlers[name];
    if (!handler) return { content: `unknown tool ${name}`, isError: true };
    try {
      return { content: handler(input ?? {}), isError: false };
    } catch (error) {
      record({ type: "error", tool: name });
      return { content: String(error.message ?? error), isError: true };
    }
  }

  function finalize() {
    const authored = takeSnapshot("final");
    if (!state.draftTaken) {
      takeSnapshot("draft");
      state.draftTaken = true;
      state.draftIsFinal = true;
    }
    return authored;
  }

  return { exec, finalize, events, docsOpened, typesOpened, state, started, tsc };
}

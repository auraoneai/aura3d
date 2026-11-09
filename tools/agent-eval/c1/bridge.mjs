// C1 three.js + bridge arm: the `import_three` tool and the BRIDGE.md note the agent receives.
// The tool runs B1 as shipped, `aura3d import-three recipes/<name>.mjs ... --json`, from the installed @aura3d/cli in the
// sandbox (no shell for the agent). The agent authors scene content as a three.js factory, imports it, then writes
// behaviour natively. Everything the bridge costs (its time inside tool time, its errors, the agent's repairs) is counted
// in the run like any other tool call. The full B1 docs reach the agent as docs/agents/three-bridge.md.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveInside } from "../lib/sandbox.mjs";

export const FACTORY_RE = /^recipes\/[\w.-]+\.(mjs|js)$/;

export const IMPORT_THREE_TOOL = {
  name: "import_three",
  description:
    "Run `aura3d import-three` (the three.js -> Aura3D bridge, see BRIDGE.md and docs/agents/three-bridge.md) on one factory module under recipes/. It runs the factory headless with a fixed seed, exports the three.js scene (meshes, materials, clips, simple shaders, lights, camera, renderer output) to a typed Aura3D asset and writes src/three-bridge/<name>.bridge.ts (regenerated), <name>.scene.ts (yours, written once) and <name>.report.md. Returns the supported / approximated / unsupported report.",
  input_schema: {
    type: "object",
    properties: {
      factory: { type: "string", description: "Path such as recipes/product.mjs (plain JavaScript ES module)" },
      name: { type: "string", description: "Asset key (letters, digits, dashes); defaults to the file name" },
      seed: { type: "integer", description: "Generator seed; keep it fixed so regeneration is stable (default 1)" },
      params: { type: "object", description: "Overrides for the factory's exported params" }
    },
    required: ["factory"]
  }
};

export const BRIDGE_GUIDE = `# three.js + Aura3D bridge (this project)

This project is an Aura3D app (\`@aura3d/engine\`, \`@aura3d/cli\`) with three.js 0.185.1 installed for authoring. Work
this way:

1. Author the scene content in three.js as a factory module \`recipes/<name>.mjs\` (plain JavaScript, ES module; the
   factory contract, what is carried and what is refused are in \`docs/agents/three-bridge.md\`). Geometry, materials,
   lights, camera, animation clips and simple shaders belong here. Name every node you will touch later
   (\`mesh.name = "body"\`): names become stable ids.
2. Call the \`import_three\` tool with \`{ "factory": "recipes/<name>.mjs" }\`. It writes the typed asset and
   \`src/three-bridge/<name>.bridge.ts\` (regenerated every time, do not edit), \`src/three-bridge/<name>.scene.ts\`
   (written once, then yours) and \`src/three-bridge/<name>.report.md\`. Read the report: anything unsupported is not
   shown.
3. Write behaviour natively in \`src/main.ts\` (and the \`.scene.ts\` file): mount the scene, per-frame updates,
   input, DOM UI, \`window.__TASK_STATE__\`. Change a bridged node at runtime through Aura3D (stable ids, a
   \`.runtime({ id, mutable: true })\` node, \`materialOverrides\`), or add native nodes beside it.
4. After every factory edit run \`import_three\` again; native edits in \`.scene.ts\` and \`src/main.ts\` survive.

The browser never runs three.js: \`src/\` must not import \`three\` or the recipe. The \`aura3d\` tool (info,
examples, validate, render) works here as in any Aura3D project.
`;

/**
 * Returns a handler for the toolbox: (input) => string. Throws (an is_error tool result) on a bad factory path or a failed
 * import. `record(event)` receives { type: "bridge", name, pass, ms } for the run's event log.
 */
export function createImportThreeHandler({ dir, record = () => {}, run = execFileSync, now = () => Date.now() }) {
  const bin = join(dir, "node_modules/.bin/aura3d");
  return function importThree(input = {}) {
    const factory = String(input.factory ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
    if (!FACTORY_RE.test(factory)) throw new Error("factory must be a .mjs or .js file directly under recipes/, e.g. recipes/product.mjs");
    resolveInside(dir, factory);
    if (!existsSync(join(dir, factory))) throw new Error(`${factory} does not exist; write it first`);
    const name = String(input.name ?? factory.split("/").pop().replace(/\.(mjs|js)$/, "")).replace(/[^\w-]/g, "-");
    const args = ["import-three", factory, "--name", name];
    if (Number.isInteger(input.seed)) args.push("--seed", String(input.seed));
    if (input.params && typeof input.params === "object" && !Array.isArray(input.params)) args.push("--params", JSON.stringify(input.params));
    args.push("--json");
    const started = now();
    try {
      const out = String(run(bin, args, { cwd: dir, encoding: "utf8", timeout: 180000, maxBuffer: 1 << 24, stdio: ["ignore", "pipe", "pipe"] }));
      record({ type: "bridge", name, pass: true, ms: now() - started });
      // Absolute sandbox paths mean nothing to the agent; show project-relative ones.
      const text = out.split(`/private${dir}/`).join("").split(`${dir}/`).join("");
      return text.length > 8000 ? `${text.slice(0, 8000)}\n[truncated]` : text;
    } catch (error) {
      record({ type: "bridge", name, pass: false, ms: now() - started });
      const msg = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim() || String(error.message);
      throw new Error(`import_three failed: ${msg.slice(0, 3000)}`);
    }
  };
}

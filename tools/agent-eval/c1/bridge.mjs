// C1 three.js + bridge arm: the `bridge_export` tool and the BRIDGE.md guide the agent receives.
// The tool runs the B1 bridge command inside the sandbox. The command is a template so the harness does not depend on B1's
// final CLI spelling: AGENT_EVAL_BRIDGE_CMD (or --bridge-cmd) with {factory} {out} {name} {seed} placeholders, split on
// whitespace and executed without a shell. Default: the installed `aura3d bridge three` command. The dry run points it at
// c1/stub/mock-bridge.mjs. Everything the bridge costs (its wall time inside tool time, its errors, the agent's repairs)
// is counted in the run like any other tool call.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveInside } from "../lib/sandbox.mjs";

export const DEFAULT_BRIDGE_CMD = "node_modules/.bin/aura3d bridge three {factory} --out {out} --name {name} --seed {seed} --json";
export const BRIDGE_OUT = "public/aura-assets/bridge";

export const BRIDGE_TOOL = {
  name: "bridge_export",
  description:
    "Run the three.js -> Aura3D asset bridge on one factory file under src/bridge/ (see BRIDGE.md). It executes the factory with a fixed seed, exports the returned three.js scene to a GLB in public/aura-assets/bridge/, regenerates the typed module src/bridge/assets.ts and returns the supported / approximated / unsupported report.",
  input_schema: {
    type: "object",
    properties: {
      factory: { type: "string", description: "Path such as src/bridge/tower.factory.ts" },
      name: { type: "string", description: "Asset id (letters, digits, dashes); defaults to the file name" },
      seed: { type: "integer", description: "Generator seed; keep it fixed so regeneration is stable (default 1)" }
    },
    required: ["factory"]
  }
};

export const BRIDGE_GUIDE = `# three.js asset bridge (this project)

Use it for procedural geometry that is easier to write with three.js (lathe, extrude, merged primitives, rocks, props).
Keep behaviour native: input, game rules, UI, camera, lights, animation of the scene, and the render loop are Aura3D code
in \`src/main.ts\`.

1. Write a factory under \`src/bridge/<name>.factory.ts\`:

\`\`\`ts
import * as THREE from "three";
export default function create({ seed }: { seed: number }): { scene: THREE.Object3D; clips?: THREE.AnimationClip[] } {
  const root = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 4, 32), new THREE.MeshStandardMaterial({ color: "#c8302c", roughness: 0.6 }));
  tower.name = "tower"; // stable names survive regeneration
  root.add(tower);
  return { scene: root };
}
\`\`\`

2. Call the \`bridge_export\` tool with \`{ "factory": "src/bridge/<name>.factory.ts" }\`. It writes
   \`public/aura-assets/bridge/<name>.glb\`, a report, and regenerates \`src/bridge/assets.ts\` (do not edit that file).

3. Use the asset natively:

\`\`\`ts
import { bridgeAssets } from "./bridge/assets";
scene().add(bridgeAssets.node("<name>", { name: "<name>", scaleMode: "world" }).position(0, 0, 0));
\`\`\`

Supported: meshes with MeshStandardMaterial / MeshPhysicalMaterial colour, metalness, roughness, opacity, emissive; mesh
transforms are baked. Reported, not converted: textures, skinned or instanced meshes, points, lines, custom shaders,
animation clips, lights and cameras (lights and cameras stay native). The factory runs at export time, not in the browser:
do not import it from \`src/main.ts\`. Pass \`scaleMode: "world"\` to keep the factory's units (the default
normalises the model size). Re-run \`bridge_export\` after every factory edit.
`;

function render(template, values) {
  return template
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/\{(factory|out|name|seed)\}/g, (_, key) => String(values[key])));
}

/**
 * Returns a handler for the toolbox: (input) => string. Throws (an is_error tool result) on a bad factory path or a failed
 * export. `record(event)` receives { type: "bridge", pass, ms, name } for the run's event log.
 */
export function createBridgeHandler({ dir, command = process.env.AGENT_EVAL_BRIDGE_CMD ?? DEFAULT_BRIDGE_CMD, record = () => {}, run = execFileSync, now = () => Date.now() }) {
  return function bridgeExport(input = {}) {
    const factory = String(input.factory ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
    if (!/^src\/bridge\/[\w.-]+\.(ts|js)$/.test(factory)) throw new Error("factory must be a file directly under src/bridge/, e.g. src/bridge/tower.factory.ts");
    resolveInside(dir, factory);
    if (!existsSync(join(dir, factory))) throw new Error(`${factory} does not exist; write it first`);
    const name = String(input.name ?? factory.split("/").pop().replace(/\.factory\.[tj]s$/, "").replace(/\.[tj]s$/, "")).replace(/[^\w-]/g, "-");
    const seed = Number.isInteger(input.seed) ? input.seed : 1;
    const [cmd, ...args] = render(command, { factory, out: BRIDGE_OUT, name, seed });
    const started = now();
    try {
      const out = run(cmd.startsWith("node_modules/") ? join(dir, cmd) : cmd, args, { cwd: dir, encoding: "utf8", timeout: 180000, maxBuffer: 1 << 24, stdio: ["ignore", "pipe", "pipe"] });
      record({ type: "bridge", name, pass: true, ms: now() - started });
      const reportFile = join(dir, BRIDGE_OUT, `${name}.report.json`);
      const text = existsSync(reportFile) ? readFileSync(reportFile, "utf8") : String(out);
      return text.length > 6000 ? `${text.slice(0, 6000)}\n[truncated]` : text;
    } catch (error) {
      record({ type: "bridge", name, pass: false, ms: now() - started });
      const msg = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim() || String(error.message);
      throw new Error(`bridge_export failed: ${msg.slice(0, 3000)}`);
    }
  };
}

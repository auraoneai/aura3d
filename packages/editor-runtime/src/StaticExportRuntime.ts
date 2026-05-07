export interface StaticExportRuntimeOptions {
  readonly globalName?: string;
  readonly canvasSelector?: string;
  readonly statusSelector?: string;
  readonly projectPath?: string;
}

export interface StaticExportHtmlOptions {
  readonly title: string;
  readonly runtimePath?: string;
}

const defaultGlobalName = "__GALILEO3D_EXPORTED_PROJECT__";
const defaultCanvasSelector = "#galileo-export";
const defaultStatusSelector = "#galileo-export-status";
const defaultProjectPath = "./project.json";

export function createStaticExportRuntime(options: StaticExportRuntimeOptions = {}): string {
  const globalName = options.globalName ?? defaultGlobalName;
  const canvasSelector = options.canvasSelector ?? defaultCanvasSelector;
  const statusSelector = options.statusSelector ?? defaultStatusSelector;
  const projectPath = options.projectPath ?? defaultProjectPath;
  return `const status = document.querySelector(${JSON.stringify(statusSelector)});
const canvas = document.querySelector(${JSON.stringify(canvasSelector)});
const context = canvas.getContext("2d");
const project = await fetch(${JSON.stringify(projectPath)}).then((response) => response.json());
context.fillStyle = "#121a26";
context.fillRect(0, 0, canvas.width, canvas.height);
context.strokeStyle = "#263244";
context.lineWidth = 1;
for (let x = 40; x < canvas.width; x += 40) {
  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, canvas.height);
  context.stroke();
}
for (let y = 40; y < canvas.height; y += 40) {
  context.beginPath();
  context.moveTo(0, y);
  context.lineTo(canvas.width, y);
  context.stroke();
}
for (const [index, node] of project.scene.nodes.entries()) {
  const color = node.material?.baseColor ?? "#38d99f";
  const x = canvas.width / 2 + node.transform.position[0] * 120 + index * 22;
  const y = canvas.height / 2 - node.transform.position[1] * 90 + index * 18;
  context.fillStyle = color;
  context.fillRect(x - 42, y - 42, 84, 84);
  context.strokeStyle = "#edf2f7";
  context.lineWidth = 3;
  context.strokeRect(x - 42, y - 42, 84, 84);
  context.fillStyle = "#edf2f7";
  context.font = "15px ui-sans-serif, system-ui, sans-serif";
  context.fillText(node.name, x - 42, y + 62);
}
status.textContent = \`Loaded \${project.metadata.name}: \${project.scene.nodes.length} nodes\`;
window[${JSON.stringify(globalName)}] = {
  status: "ready",
  nodeCount: project.scene.nodes.length,
  projectName: project.metadata.name,
  provenanceHash: project.metadata.provenance?.evidenceHash ?? null
};
`;
}

export function createStaticExportHtml(options: StaticExportHtmlOptions): string {
  const runtimePath = options.runtimePath ?? "./runtime.js";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.title)}</title>
    <style>
      html, body { margin: 0; min-height: 100%; background: #10151f; color: #edf2f7; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      main { display: grid; min-height: 100vh; place-items: center; padding: 24px; }
      canvas { width: min(920px, 100%); height: 520px; border: 1px solid #334155; background: #121a26; }
      .hud { position: fixed; left: 20px; top: 16px; padding: 10px 12px; background: rgba(15, 23, 42, 0.86); border: 1px solid #334155; border-radius: 6px; }
    </style>
  </head>
  <body>
    <main>
      <canvas id="galileo-export" width="920" height="520"></canvas>
      <div class="hud" id="galileo-export-status">Loading export...</div>
    </main>
    <script type="module" src="${escapeAttribute(runtimePath)}"></script>
  </body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

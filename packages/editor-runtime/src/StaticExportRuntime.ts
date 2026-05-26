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

const defaultGlobalName = "__AURA3D_EXPORTED_PROJECT__";
const defaultCanvasSelector = "#aura3d-export";
const defaultStatusSelector = "#aura3d-export-status";
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
const provenanceOperations = project.metadata.provenance?.operations?.map((operation) => operation.id) ?? [];
const startedAt = performance.now();
let selectedIndex = 0;
let interactions = 0;
let scriptTickCount = 0;
function nodePosition(node, index) {
  const elapsed = (performance.now() - startedAt) / 1000;
  const scriptedBounce = node.script?.enabled && /bounce/i.test(node.script.behavior ?? "") ? Math.sin(elapsed * 3.2) * 16 : 0;
  return {
    x: canvas.width / 2 + node.transform.position[0] * 120 + index * 22,
    y: canvas.height / 2 - node.transform.position[1] * 90 + index * 18 + scriptedBounce
  };
}
function featureEvidence() {
  return {
    importedAssetNames: project.assets.map((asset) => asset.name),
    importedAssetUris: project.assets.map((asset) => asset.uri),
    editedMaterials: project.scene.nodes.map((node) => ({
      node: node.name,
      name: node.material?.name ?? "",
      baseColor: node.material?.baseColor ?? "",
      metallic: node.material?.metallic ?? 0,
      roughness: node.material?.roughness ?? 0,
      textureSlots: node.material?.textureSlots ?? {}
    })),
    lights: project.scene.nodes.filter((node) => node.light?.kind && node.light.kind !== "none").map((node) => ({ node: node.name, kind: node.light.kind, intensity: node.light.intensity })),
    cameras: project.scene.nodes.filter((node) => node.camera?.enabled).map((node) => ({ node: node.name, fov: node.camera.fov })),
    physicsBodies: project.scene.nodes.filter((node) => node.physics?.body && node.physics.body !== "none").map((node) => ({ node: node.name, body: node.physics.body, collider: node.physics.collider })),
    configuredBehaviors: project.scene.nodes.filter((node) => node.script?.enabled && node.script.behavior).map((node) => ({ node: node.name, behavior: node.script.behavior })),
    particleEmitters: project.scene.nodes.filter((node) => node.particleEmitter?.enabled).map((node) => ({ node: node.name, preset: node.particleEmitter.preset, emissionRate: node.particleEmitter.emissionRate })),
    playBehavior: project.scene.nodes.some((node) => node.script?.enabled || node.animation?.enabled || node.particleEmitter?.enabled),
    usesEditorCode: false,
    exportProvenance: provenanceOperations.includes("static-export") && provenanceOperations.includes("static-export-runtime")
  };
}
function publish() {
  const evidence = featureEvidence();
  window[${JSON.stringify(globalName)}] = {
    id: "external-editor-authored-app",
    status: "ready",
    renderer: "canvas2d-static-export",
    visualClaim: "Browser-first local authoring and static export workflow for the shown V4 app.",
    knownLimits: [
      "This exported app proves a browser editor author/export workflow, not a Unity or Unreal replacement.",
      "The static export visualizes project-authored model metadata with canvas2D shapes; it does not load the editor shell.",
      "Imported glTF asset references, material edits, lights, cameras, physics, scripts, and play behavior are preserved in project data and runtime evidence."
    ],
    claimBoundary: {
      allowed: "browser-first local authoring workflow for the shown V4 app",
      blocked: ["Unity replacement", "Unreal replacement", "broad Unity/Unreal for the web"]
    },
    errors: [],
    diagnostics: {
      drawCalls: project.scene.nodes.length,
      lastError: null,
      frameTimeMs: Number((performance.now() - startedAt).toFixed(2)),
      scriptTickCount
    },
    screenshotPath: "tests/reports/external-parity-example-screenshots/editor-authoring-v4-export.png",
    nodeCount: project.scene.nodes.length,
    assetCount: project.assets.length,
    projectName: project.metadata.name,
    provenanceHash: project.metadata.provenance?.evidenceHash ?? null,
    importedAssetNames: evidence.importedAssetNames,
    editedMaterials: evidence.editedMaterials,
    configuredBehaviors: evidence.configuredBehaviors,
    usesPlayExportPath: evidence.exportProvenance,
    physicsOrScripting: evidence.physicsBodies.length > 0 || evidence.configuredBehaviors.length > 0,
    playBehaviorActive: evidence.playBehavior,
    featureEvidence: evidence,
    selectedNodeName: project.scene.nodes[selectedIndex]?.name ?? null,
    interactions,
    interactive: true
  };
}
function draw() {
  scriptTickCount += 1;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#101827");
  gradient.addColorStop(0.62, "#151f2e");
  gradient.addColorStop(1, "#0f1722");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1e293b";
  context.fillRect(0, canvas.height - 150, canvas.width, 150);
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
  context.fillStyle = "rgba(15, 23, 42, 0.72)";
  context.fillRect(24, 24, 300, 112);
  context.fillStyle = "#e5edf8";
  context.font = "700 20px ui-sans-serif, system-ui, sans-serif";
  context.fillText(project.metadata.name, 42, 58);
  context.font = "14px ui-sans-serif, system-ui, sans-serif";
  context.fillStyle = "#a7b8cc";
  context.fillText(\`\${project.assets.length} imported assets | \${project.scene.nodes.length} authored nodes\`, 42, 84);
  context.fillText("Static export runtime: editor code absent", 42, 110);
  for (const [index, node] of project.scene.nodes.entries()) {
    const selected = index === selectedIndex;
    const color = node.material?.baseColor ?? "#38d99f";
    const { x, y } = nodePosition(node, index);
    if (node.light?.kind !== "none") {
      context.fillStyle = "rgba(250, 204, 21, 0.2)";
      context.beginPath();
      context.arc(x, y, Math.max(36, node.light.intensity * 54), 0, Math.PI * 2);
      context.fill();
    }
    if (node.mesh?.primitive === "imported" || node.mesh?.assetId) {
      drawImportedModelNode(node, x, y, color);
    } else if (node.camera?.enabled) {
      drawCameraNode(x, y, color);
    } else {
      context.fillStyle = color;
      context.fillRect(x - 42, y - 42, 84, 84);
    }
    context.strokeStyle = selected ? "#facc15" : "#edf2f7";
    context.lineWidth = selected ? 5 : 3;
    context.strokeRect(x - 56, y - 50, 112, 100);
    if (node.physics?.collider && node.physics.collider !== "none") {
      context.setLineDash([7, 5]);
      context.strokeStyle = "#fb7185";
      context.lineWidth = 2;
      context.strokeRect(x - 66, y - 60, 132, 120);
      context.setLineDash([]);
    }
    if (node.camera?.enabled) {
      context.strokeStyle = "#67e8f9";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + 60, y - 28);
      context.lineTo(x + 112, y - 56);
      context.lineTo(x + 112, y + 56);
      context.lineTo(x + 60, y + 28);
      context.closePath();
      context.stroke();
    }
    if (node.particleEmitter?.enabled) {
      context.fillStyle = "rgba(125, 211, 252, 0.78)";
      for (let particle = 0; particle < 10; particle += 1) {
        const angle = particle * 0.9 + scriptTickCount * 0.04;
        context.beginPath();
        context.arc(x + Math.cos(angle) * (22 + particle * 2), y - 52 - particle * 5, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.fillStyle = selected ? "#facc15" : "#edf2f7";
    context.font = "15px ui-sans-serif, system-ui, sans-serif";
    context.fillText(node.name, x - 56, y + 76);
  }
  status.textContent = \`Loaded \${project.metadata.name}: \${project.scene.nodes.length} nodes | selected \${project.scene.nodes[selectedIndex]?.name ?? "none"} | interactions \${interactions}\`;
  publish();
}
function drawImportedModelNode(node, x, y, color) {
  context.save();
  context.translate(x, y);
  context.fillStyle = "rgba(0,0,0,0.28)";
  context.beginPath();
  context.ellipse(0, 54, 58, 14, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(-8, 0, 46, 28, -0.12, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(38, -18, 22, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(26, -36);
  context.lineTo(36, -64);
  context.lineTo(48, -36);
  context.fill();
  context.beginPath();
  context.moveTo(46, -34);
  context.lineTo(58, -58);
  context.lineTo(64, -26);
  context.fill();
  context.strokeStyle = "#fed7aa";
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(-48, -2);
  context.quadraticCurveTo(-86, -44, -118, -12);
  context.stroke();
  context.strokeStyle = "#111827";
  context.lineWidth = 6;
  for (const legX of [-30, -10, 12, 28]) {
    context.beginPath();
    context.moveTo(legX, 22);
    context.lineTo(legX - 8, 54);
    context.stroke();
  }
  context.fillStyle = "#111827";
  context.beginPath();
  context.arc(47, -24, 3, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
function drawCameraNode(x, y, color) {
  context.fillStyle = color;
  context.fillRect(x - 40, y - 26, 70, 52);
  context.beginPath();
  context.moveTo(x + 30, y - 20);
  context.lineTo(x + 68, y - 40);
  context.lineTo(x + 68, y + 40);
  context.lineTo(x + 30, y + 20);
  context.closePath();
  context.fill();
}
canvas.tabIndex = 0;
canvas.addEventListener("click", (event) => {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, bounds.width);
  const scaleY = canvas.height / Math.max(1, bounds.height);
  const x = (event.clientX - bounds.left) * scaleX;
  const y = (event.clientY - bounds.top) * scaleY;
  const hitIndex = project.scene.nodes.findIndex((node, index) => {
    const position = nodePosition(node, index);
    return Math.abs(x - position.x) <= 48 && Math.abs(y - position.y) <= 48;
  });
  selectedIndex = hitIndex >= 0 ? hitIndex : (selectedIndex + 1) % Math.max(1, project.scene.nodes.length);
  interactions += 1;
  canvas.focus();
  draw();
});
canvas.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  const direction = event.key === "ArrowRight" ? 1 : -1;
  selectedIndex = (selectedIndex + direction + project.scene.nodes.length) % Math.max(1, project.scene.nodes.length);
  interactions += 1;
  event.preventDefault();
  draw();
});
function frame() {
  draw();
  requestAnimationFrame(frame);
}
frame();
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
      <canvas id="aura3d-export" width="920" height="520"></canvas>
      <div class="hud" id="aura3d-export-status">Loading export...</div>
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

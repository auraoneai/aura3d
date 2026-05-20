const status = document.querySelector("#galileo-export-status");
const canvas = document.querySelector("#galileo-export");
const context = canvas.getContext("2d");
const project = await fetch("./project.json").then((response) => response.json());

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

status.textContent = `Loaded ${project.metadata.name}: ${project.scene.nodes.length} nodes`;
window.__GALILEO3D_EXPORTED_PROJECT__ = {
  id: "editor-authored-project",
  status: "ready",
  renderer: "canvas2d",
  visualClaim: "bounded-editor-authored-static-export",
  knownLimits: [
    "This exported project proves a bounded static browser export path, not a full Unity/Unreal replacement.",
    "The runtime visualization is a canvas2D smoke view of serialized project data, not a full WebGL authored game.",
  ],
  errors: [],
  diagnostics: {
    drawCalls: project.scene.nodes.length,
    lastError: null
  },
  nodeCount: project.scene.nodes.length,
  projectName: project.metadata.name,
  provenanceHash: project.metadata.provenance?.evidenceHash ?? null
};

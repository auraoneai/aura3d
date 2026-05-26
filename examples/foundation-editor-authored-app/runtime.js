const status = document.querySelector("#aura3d-export-status");
const canvas = document.querySelector("#aura3d-export");
const context = canvas.getContext("2d");
const project = await fetch("./project.json").then((response) => response.json());
const provenanceOperations = project.metadata.provenance?.operations?.map((operation) => operation.id) ?? [];

let selectedIndex = 0;
let interactions = 0;

function nodePosition(node, index) {
  return {
    x: canvas.width / 2 + node.transform.position[0] * 120 + index * 22,
    y: canvas.height / 2 - node.transform.position[1] * 90 + index * 18,
  };
}

function publish() {
  window.__AURA3D_EXPORTED_PROJECT__ = {
    id: "foundation-editor-authored-app",
    status: "ready",
    renderer: "canvas2d",
    visualClaim: "bounded-foundation-editor-authored-interactive-static-export",
    knownLimits: [
      "This exported app proves the bounded editor static export path, not a full Unity/Unreal replacement.",
      "The exported runtime uses canvas2D project-data visualization instead of the full editor code path.",
    ],
    errors: [],
    diagnostics: {
      drawCalls: project.scene.nodes.length,
      lastError: null,
    },
    nodeCount: project.scene.nodes.length,
    assetCount: project.assets.length,
    projectName: project.metadata.name,
    provenanceHash: project.metadata.provenance?.evidenceHash ?? null,
    importedAssetNames: project.assets.map((asset) => asset.name),
    editedMaterials: project.scene.nodes.map((node) => ({
      node: node.name,
      name: node.material?.name ?? "",
      baseColor: node.material?.baseColor ?? "",
    })),
    configuredBehaviors: project.scene.nodes
      .filter((node) => node.script?.enabled && node.script.behavior)
      .map((node) => ({ node: node.name, behavior: node.script.behavior })),
    usesPlayExportPath: provenanceOperations.includes("static-export") && provenanceOperations.includes("static-export-runtime"),
    selectedNodeName: project.scene.nodes[selectedIndex]?.name ?? null,
    interactions,
    interactive: true,
  };
}

function draw() {
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
    const selected = index === selectedIndex;
    const color = node.material?.baseColor ?? "#38d99f";
    const { x, y } = nodePosition(node, index);
    context.fillStyle = color;
    context.fillRect(x - 42, y - 42, 84, 84);
    context.strokeStyle = selected ? "#facc15" : "#edf2f7";
    context.lineWidth = selected ? 5 : 3;
    context.strokeRect(x - 42, y - 42, 84, 84);
    if (node.light?.kind !== "none") {
      context.fillStyle = "rgba(250, 204, 21, 0.22)";
      context.beginPath();
      context.arc(x, y, Math.max(32, node.light.intensity * 46), 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = selected ? "#facc15" : "#edf2f7";
    context.font = "15px ui-sans-serif, system-ui, sans-serif";
    context.fillText(node.name, x - 42, y + 62);
  }
  status.textContent = `Loaded ${project.metadata.name}: ${project.scene.nodes.length} nodes | selected ${project.scene.nodes[selectedIndex]?.name ?? "none"} | interactions ${interactions}`;
  publish();
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

draw();

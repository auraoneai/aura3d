/**
 * Renders the committed Turbo racing geometry contract as a top-down SVG.
 *
 * This is a source-to-evidence diagnostic, not a hand-authored route: every grey
 * triangle and every numbered centreline point comes from the generated contract.
 * It exists so a visually wrong branch selection cannot hide behind `onRoad: true`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gameGeometryContract } from "../../apps/showcase-turbo-drift-circuit/src/generated/game-geometry.js";

const output = resolve("tests/reports/turbo-geometry/top-down.svg");
const mesh = gameGeometryContract.topology.drivableMesh;
const route = gameGeometryContract.topology.roadCenterline;
if (!mesh) throw new Error("Turbo geometry contract has no drivable mesh.");

const xs = mesh.positions.filter((_value, index) => index % 3 === 0);
const zs = mesh.positions.filter((_value, index) => index % 3 === 2);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
const minZ = Math.min(...zs);
const maxZ = Math.max(...zs);
const width = 1200;
const height = 900;
const pad = 36;
const scale = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxZ - minZ));
const sx = (x: number): number => pad + (x - minX) * scale;
const sy = (z: number): number => height - pad - (z - minZ) * scale;
const esc = (value: number): string => value.toFixed(2);

const triangles: string[] = [];
for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
  const vertices = [mesh.indices[index]!, mesh.indices[index + 1]!, mesh.indices[index + 2]!];
  const points = vertices.map((vertex) => {
    const at = vertex * 3;
    return `${esc(sx(mesh.positions[at]!))},${esc(sy(mesh.positions[at + 2]!))}`;
  }).join(" ");
  const y = vertices.reduce<number>((sum, vertex) => sum + mesh.positions[vertex * 3 + 1]!, 0) / 3;
  const tone = Math.max(42, Math.min(112, Math.round(74 + y * 180)));
  triangles.push(`<polygon points="${points}" fill="rgb(${tone},${tone},${tone})" stroke="#aab1b8" stroke-width="0.16"/>`);
}

const routePoints = route.map((point) => `${esc(sx(point.x))},${esc(sy(point.z))}`).join(" ");
const labels = route.map((point, index) => {
  const x = sx(point.x);
  const y = sy(point.z);
  return `<circle cx="${esc(x)}" cy="${esc(y)}" r="5" fill="#ff315f" stroke="#fff" stroke-width="1.2"/>` +
    `<text x="${esc(x + 7)}" y="${esc(y - 7)}" fill="#fff" font-family="monospace" font-size="13">${index}</text>`;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#071018"/>
<g>${triangles.join("\n")}</g>
<polyline points="${routePoints}" fill="none" stroke="#ff315f" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
${labels}
<text x="36" y="28" fill="#dce8f4" font-family="monospace" font-size="17">Turbo committed drivable mesh + certified centreline (red)</text>
</svg>\n`;

mkdirSync(resolve("tests/reports/turbo-geometry"), { recursive: true });
writeFileSync(output, svg);
console.log(output);

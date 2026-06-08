import { buildDataGalaxyScene } from '../../../apps/v9-advanced-examples-gallery/src/dataGalaxyScene';
import { dataGalaxyBudgets } from '../../../apps/v9-advanced-examples-gallery/src/dataGalaxyBudgets';
import { dataGalaxyEvidence } from '../../../apps/v9-advanced-examples-gallery/src/dataGalaxyEvidence';
const scene = buildDataGalaxyScene();
const canvas = document.getElementById('galaxy-canvas');
const ctx = canvas.getContext('2d');
const modeButtons = Array.from(document.querySelectorAll('#mode-segment button'));
const densityInput = document.getElementById('density');
const metrics = document.getElementById('metrics');
const status = document.getElementById('status');
let mode = 'overview';
let density = Number(densityInput.value);
let lastTime = 0;
function resize() {
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    ctx?.setTransform(scale, 0, 0, scale, 0, 0);
}
function drawBackground(width, height) {
    if (!ctx)
        return;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#071225');
    gradient.addColorStop(0.6, '#030813');
    gradient.addColorStop(1, '#02050b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const starCount = Math.floor(80 * density);
    for (let i = 0; i < starCount; i += 1) {
        const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * width;
        const y = (Math.sin(i * 37.3) * 0.5 + 0.5) * height;
        const alpha = 0.18 + (i % 7) * 0.05;
        ctx.fillStyle = `rgba(115, 191, 233, ${alpha})`;
        ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
}
function drawEllipse(cx, cy, rx, ry, rotation, color, width) {
    if (!ctx)
        return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
function drawNode(x, y, radius, fill, glow = false) {
    if (!ctx)
        return;
    ctx.save();
    if (glow) {
        ctx.shadowBlur = radius * 4;
        ctx.shadowColor = fill;
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
function drawStream(x0, y0, x1, y1, color, width) {
    if (!ctx)
        return;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2 - Math.abs(x1 - x0) * 0.08;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
}
function drawGalaxy(width, height, time) {
    if (!ctx)
        return;
    const cx = width * 0.5;
    const cy = height * 0.51;
    const base = Math.min(width, height);
    const pulse = 1 + Math.sin(time * 0.0016) * 0.025;
    const modeDepth = mode === 'depth' ? 1.18 : 1;
    const modeFlow = mode === 'flow' ? 1.18 : 1;
    for (let i = 0; i < 6; i += 1) {
        const rx = base * (0.18 + i * 0.055) * density;
        const ry = base * (0.045 + i * 0.018) * modeDepth;
        const rot = -0.05 + i * 0.05 + Math.sin(time * 0.00025 + i) * 0.025;
        drawEllipse(cx, cy + (i - 2) * base * 0.008, rx, ry, rot, i % 2 === 0 ? 'rgba(56, 189, 248, 0.86)' : 'rgba(96, 230, 255, 0.46)', Math.max(1, base * 0.0025));
    }
    const streamCount = Math.floor(16 * density * modeFlow);
    for (let i = 0; i < streamCount; i += 1) {
        const angle = (Math.PI * 2 * i) / streamCount + time * 0.00022;
        const innerX = cx + Math.cos(angle) * base * 0.06;
        const innerY = cy + Math.sin(angle) * base * 0.025;
        const outerX = cx + Math.cos(angle + 0.22) * base * (0.26 + (i % 4) * 0.045) * density;
        const outerY = cy + Math.sin(angle + 0.22) * base * (0.12 + (i % 3) * 0.02) * modeDepth;
        drawStream(innerX, innerY, outerX, outerY, i % 2 === 0 ? 'rgba(96, 230, 255, 0.78)' : 'rgba(45, 134, 188, 0.62)', Math.max(1, base * 0.002));
        drawNode(outerX, outerY, Math.max(2.5, base * 0.006), '#60e6ff', true);
    }
    const anchorCount = Math.floor(24 * density);
    for (let i = 0; i < anchorCount; i += 1) {
        const angle = (Math.PI * 2 * i * 11) / anchorCount;
        const radius = base * (0.20 + (i % 5) * 0.045) * density;
        const x = cx + Math.cos(angle) * radius * 1.35;
        const y = cy + Math.sin(angle) * radius * 0.5 * modeDepth;
        drawNode(x, y, Math.max(1.5, base * 0.0035), i % 4 === 0 ? '#7dd3fc' : '#2d86bc', false);
    }
    const coreGlow = ctx.createRadialGradient(cx, cy, base * 0.015, cx, cy, base * 0.125 * pulse);
    coreGlow.addColorStop(0, 'rgba(248,253,255,0.96)');
    coreGlow.addColorStop(0.32, 'rgba(96,230,255,0.92)');
    coreGlow.addColorStop(1, 'rgba(29,155,215,0)');
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.ellipse(cx, cy, base * 0.13 * pulse, base * 0.13 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    drawNode(cx, cy, base * 0.033 * pulse, '#f8fdff', true);
}
function render(time) {
    if (!ctx)
        return;
    lastTime = time;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawBackground(rect.width, rect.height);
    drawGalaxy(rect.width, rect.height, time);
    requestAnimationFrame(render);
}
function renderMetrics() {
    metrics.innerHTML = '';
    const values = [
        ['Core', '1'],
        ['Rings', String(scene.focalSystem.elements.find((element) => element.kind === 'orbital-ring')?.count ?? 0)],
        ['Streams', String(Math.floor(16 * density * (mode === 'flow' ? 1.18 : 1)))],
        ['GPU', String(dataGalaxyEvidence.gpuDispatches)],
    ];
    for (const [label, value] of values) {
        const item = document.createElement('div');
        item.className = 'metric';
        item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
        metrics.appendChild(item);
    }
    status.textContent = `${dataGalaxyBudgets.mode} | CPU/static | generated GLB excluded from hero proof`;
}
modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        mode = button.dataset.mode;
        modeButtons.forEach((item) => item.classList.toggle('active', item === button));
        renderMetrics();
    });
});
densityInput.addEventListener('input', () => {
    density = Number(densityInput.value);
    renderMetrics();
});
window.addEventListener('resize', resize);
resize();
renderMetrics();
requestAnimationFrame(render);
//# sourceMappingURL=main.js.map